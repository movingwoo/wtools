// RFC 8878 decoder. Frame-local state, bounded allocations, no dictionary loading.
import { LL_BITS, ML_BITS, LL_BASE, ML_BASE, DEFAULT_LL, DEFAULT_OF, DEFAULT_ML,
  readFse, ReverseBits, fail } from './zstd-entropy.js';
import { xxhash64 } from './xxhash64.js';

const INPUT_LIMIT = 256 * 1024 * 1024, OUTPUT_LIMIT = 128 * 1024 * 1024;

function huffmanTree(bytes, start, end) {
  if (start >= end) fail('Huffman 헤더가 잘렸습니다.');
  const header = bytes[start++], weights = [];
  if (header >= 128) {
    const count = header - 127;
    if (start + Math.ceil(count / 2) > end) fail('Huffman 가중치가 잘렸습니다.');
    for (let i = 0; i < count; i++) weights.push((bytes[start + (i >>> 1)] >>> ((i & 1) ? 0 : 4)) & 15);
    start += Math.ceil(count / 2);
  } else {
    const stop = start + header;
    if (stop > end) fail('Huffman FSE 헤더가 잘렸습니다.');
    const { table, offset } = readFse(bytes, start, stop, 6, 12);
    const stream = new ReverseBits(bytes, offset, stop);
    const states = [stream.read(table.log), stream.read(table.log)];
    let active = 0;
    for (;;) {
      if (weights.length >= 254) fail('Huffman 기호 수가 허용 범위를 넘습니다.');
      const state = states[active];
      weights.push(table.symbols[state]);
      const width = table.bits[state];
      if (width > stream.remaining) {
        weights.push(table.symbols[states[active ^ 1]]);
        break;
      }
      states[active] = table.base[state] + stream.read(width); active ^= 1;
    }
    start = stop;
  }
  let total = 0;
  for (const weight of weights) {
    if (weight > 11) fail('Huffman 가중치가 허용 범위를 넘습니다.');
    if (weight) total += 2 ** (weight - 1);
  }
  if (!total) fail('Huffman 가중치 합이 0입니다.');
  const log = Math.floor(Math.log2(total)) + 1, remaining = 2 ** log - total;
  if (log > 11 || (remaining & (remaining - 1))) fail('Huffman 가중치 합이 올바르지 않습니다.');
  weights.push(Math.floor(Math.log2(remaining)) + 1);
  if (weights.filter((n) => n === 1).length < 2) fail('Huffman 최하위 가중치가 부족합니다.');
  const entries = new Uint16Array(2 ** log);
  let position = 0;
  for (let weight = 1; weight <= log; weight++) {
    const span = 2 ** (weight - 1);
    for (let symbol = 0; symbol < weights.length; symbol++) {
      if (weights[symbol] !== weight) continue;
      entries.fill(((log + 1 - weight) << 8) | symbol, position, position + span); position += span;
    }
  }
  return { table: { log, entries }, offset: start };
}

function decodeLiterals(bytes, start, end, count, table, output, offset) {
  const stream = new ReverseBits(bytes, start, end), { log, entries } = table;
  let position = stream.position, i = 0, buffer = 0, available = 0;
  // Refill 24 bits at a time; the final few symbols use checked zero padding.
  for (; i < count && position - stream.start >= log; i++) {
    if (available < log) {
      available = Math.min(24, position - stream.start);
      const bit = position - available, at = bit >>> 3;
      const word = bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24);
      buffer = (word >>> (bit & 7)) << (32 - available);
    }
    const entry = entries[buffer >>> (32 - log)], width = entry >>> 8;
    buffer <<= width; available -= width; position -= width; output[offset + i] = entry & 255;
  }
  stream.position = position;
  for (; i < count; i++) {
    const entry = entries[stream.peek(log)], width = entry >>> 8;
    if (width > stream.remaining) fail('Huffman 스트림이 잘렸습니다.');
    stream.position -= width; output[offset + i] = entry & 255;
  }
  stream.done();
}

export function decompress(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array)) fail('입력은 바이트 배열이어야 합니다.');
  if (bytes.length > INPUT_LIMIT) fail('입력이 안전 한도 256 MiB를 넘습니다.');
  const limit = options.maxOutputLength ?? Math.min(OUTPUT_LIMIT, bytes.length * 200);
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > OUTPUT_LIMIT) fail('해제 한도는 0~128 MiB의 정수여야 합니다.');
  let cursor = 0, used = 0, output = new Uint8Array(0), end = bytes.length;
  const requireBytes = (length) => { if (length > end - cursor) fail(`바이트 ${cursor}: 데이터가 잘렸습니다.`); };
  const integer = (length) => {
    requireBytes(length);
    let value = 0;
    for (let i = 0; i < length; i++) value += bytes[cursor++] * 2 ** (i * 8);
    if (!Number.isSafeInteger(value)) fail('정수 크기가 안전 범위를 넘습니다.');
    return value;
  };
  const reserve = (length) => {
    const next = used + length;
    if (next > limit) fail('해제 결과가 크기 또는 압축률 안전 한도를 넘습니다.');
    if (next > output.length) {
      const replacement = new Uint8Array(Math.min(limit, Math.max(next, 65536, output.length * 2)));
      replacement.set(output.subarray(0, used)); output = replacement;
    }
  };
  if (!bytes.length) fail('프레임이 없습니다.');
  while (cursor < bytes.length) {
    const magic = integer(4);
    if ((magic & 0xfffffff0) === 0x184d2a50) {
      const size = integer(4); requireBytes(size); cursor += size; continue;
    }
    if (magic !== 0xfd2fb528) fail('프레임 매직이 올바르지 않습니다.');
    const flags = integer(1), single = flags & 32, sizeFlag = flags >>> 6;
    if (flags & 8) fail('프레임 예약 비트가 설정되어 있습니다.');
    let window;
    if (!single) {
      const descriptor = integer(1), base = 2 ** (10 + (descriptor >>> 3));
      window = base + base / 8 * (descriptor & 7);
    }
    const dictionary = integer([0, 1, 2, 4][flags & 3]);
    if (dictionary) fail('외부 사전이 필요한 프레임은 지원하지 않습니다.');
    const sizeBytes = sizeFlag ? 2 ** sizeFlag : (single ? 1 : 0);
    const contentSize = sizeBytes ? integer(sizeBytes) + (sizeBytes === 2 ? 256 : 0) : undefined;
    if (contentSize !== undefined && contentSize > limit - used) fail('선언된 해제 크기가 안전 한도를 넘습니다.');
    if (single) window = contentSize;
    if (window > OUTPUT_LIMIT) fail('윈도 크기가 안전 한도 128 MiB를 넘습니다.');
    const frameStart = used, maxBlock = Math.min(131072, window);
    let repeat1 = 1, repeat2 = 4, repeat3 = 8;
    const tables = [null, null, null];
    let huffman, last = false;
    do {
      const block = integer(3), type = (block >>> 1) & 3, size = block >>> 3;
      last = !!(block & 1);
      if (type === 3) fail('예약된 블록 형식입니다.');
      if (size > maxBlock) fail('블록 크기가 프레임 한도를 넘습니다.');
      const blockStart = used;
      const blockReserve = (length) => {
        if (used - blockStart + length > maxBlock) fail('해제 블록 크기가 프레임 한도를 넘습니다.');
        if (contentSize !== undefined && used - frameStart + length > contentSize) fail('선언된 해제 크기를 넘습니다.');
        reserve(length);
      };
      if (type === 0) {
        requireBytes(size); blockReserve(size); output.set(bytes.subarray(cursor, cursor + size), used);
        cursor += size; used += size;
      } else if (type === 1) {
        const value = integer(1); blockReserve(size); output.fill(value, used, used + size); used += size;
      } else {
        requireBytes(size); end = cursor + size;
        const header = integer(1), literalType = header & 3, format = (header >>> 2) & 3;
        let literalCount, packedCount, streams = 1;
        if (literalType < 2) {
          literalCount = (format & 1) ? (header >>> 4) + integer(format === 1 ? 1 : 2) * 16 : header >>> 3;
        } else {
          const width = format < 2 ? 10 : format === 2 ? 14 : 18;
          const fields = (header >>> 4) + integer(format < 2 ? 2 : format === 2 ? 3 : 4) * 16;
          literalCount = fields % 2 ** width; packedCount = Math.floor(fields / 2 ** width);
          streams = format ? 4 : 1;
        }
        // Bound decoded literals before allocating, even if a corrupt sequence never uses them.
        blockReserve(literalCount);
        let literals;
        if (literalType === 0) {
          requireBytes(literalCount); literals = bytes.subarray(cursor, cursor + literalCount); cursor += literalCount;
        } else if (literalType === 1) {
          const value = integer(1); literals = new Uint8Array(literalCount).fill(value);
        } else {
          requireBytes(packedCount);
          const stop = cursor + packedCount;
          if (literalType === 2) {
            const parsed = huffmanTree(bytes, cursor, stop); huffman = parsed.table; cursor = parsed.offset;
          } else if (!huffman) fail('재사용할 Huffman 테이블이 없습니다.');
          literals = new Uint8Array(literalCount);
          if (streams === 1) decodeLiterals(bytes, cursor, stop, literalCount, huffman, literals, 0);
          else {
            if (stop - cursor < 6 || literalCount < 6) fail('Huffman 점프 테이블이 올바르지 않습니다.');
            const sizes = [integer(2), integer(2), integer(2)];
            sizes.push(stop - cursor - sizes.reduce((sum, n) => sum + n, 0));
            const segment = Math.ceil(literalCount / 4);
            for (let i = 0; i < 4; i++) {
              if (sizes[i] < 1 || cursor + sizes[i] > stop) fail('Huffman 스트림 길이가 올바르지 않습니다.');
              decodeLiterals(bytes, cursor, cursor + sizes[i], i === 3 ? literalCount - segment * 3 : segment,
                huffman, literals, i * segment);
              cursor += sizes[i];
            }
          }
          cursor = stop;
        }
        const first = integer(1);
        const sequences = first < 128 ? first : first < 255 ? (first - 128) * 256 + integer(1) : integer(2) + 0x7f00;
        let literalOffset = 0;
        if (sequences) {
          if (sequences * 3 > maxBlock) fail('시퀀스 수가 블록 한도를 넘습니다.');
          const modes = integer(1);
          if (modes & 3) fail('시퀀스 예약 비트가 설정되어 있습니다.');
          for (let i = 0; i < 3; i++) {
            const mode = (modes >>> (6 - 2 * i)) & 3, maxSymbol = [35, 31, 52][i];
            if (mode === 0) tables[i] = [DEFAULT_LL, DEFAULT_OF, DEFAULT_ML][i];
            else if (mode === 1) {
              const value = integer(1);
              if (value > maxSymbol) fail('RLE 시퀀스 기호가 올바르지 않습니다.');
              tables[i] = { symbols: [value], bits: [0], base: [0], log: 0 };
            } else if (mode === 2) {
              const parsed = readFse(bytes, cursor, end, i === 1 ? 8 : 9, maxSymbol);
              tables[i] = parsed.table; cursor = parsed.offset;
            } else if (!tables[i]) fail('재사용할 FSE 테이블이 없습니다.');
          }
          const stream = new ReverseBits(bytes, cursor, end);
          const [llTable, ofTable, mlTable] = tables;
          let llState = stream.read(llTable.log), ofState = stream.read(ofTable.log), mlState = stream.read(mlTable.log);
          for (let i = 0; i < sequences; i++) {
            const ll = llTable.symbols[llState], of = ofTable.symbols[ofState], ml = mlTable.symbols[mlState];
            const offsetValue = ((1 << of) >>> 0) + stream.read(of);
            const matchLength = ML_BASE[ml] + stream.read(ML_BITS[ml]), literalLength = LL_BASE[ll] + stream.read(LL_BITS[ll]);
            if (literalLength > literalCount - literalOffset) fail('리터럴 길이가 제공된 데이터를 넘습니다.');
            blockReserve(literalLength + matchLength);
            if (literalLength < 32) {
              for (let n = 0; n < literalLength; n++) output[used + n] = literals[literalOffset + n];
            } else output.set(literals.subarray(literalOffset, literalOffset + literalLength), used);
            used += literalLength; literalOffset += literalLength;
            let distance;
            if (offsetValue > 3) {
              distance = offsetValue - 3; repeat3 = repeat2; repeat2 = repeat1; repeat1 = distance;
            }
            else {
              const index = offsetValue - 1 + (literalLength === 0 ? 1 : 0);
              distance = index === 3 ? repeat1 - 1 : index === 2 ? repeat3 : index === 1 ? repeat2 : repeat1;
              if (index > 0) {
                if (index > 1) repeat3 = repeat2;
                repeat2 = repeat1; repeat1 = distance;
              }
            }
            if (distance < 1 || distance > window || distance > used - frameStart) fail('일치 거리가 올바르지 않습니다. 외부 사전은 지원하지 않습니다.');
            for (let n = 0; n < matchLength; n++) output[used + n] = output[used + n - distance];
            used += matchLength;
            if (i + 1 < sequences) {
              llState = llTable.base[llState] + stream.read(llTable.bits[llState]);
              mlState = mlTable.base[mlState] + stream.read(mlTable.bits[mlState]);
              ofState = ofTable.base[ofState] + stream.read(ofTable.bits[ofState]);
            }
          }
          stream.done(); cursor = end;
        }
        if (cursor !== end) fail('블록에 사용하지 않은 데이터가 있습니다.');
        blockReserve(literalCount - literalOffset);
        output.set(literals.subarray(literalOffset), used); used += literalCount - literalOffset;
        end = bytes.length;
      }
    } while (!last);
    if (contentSize !== undefined && used - frameStart !== contentSize) fail('선언된 해제 크기와 결과가 다릅니다.');
    if ((flags & 4) && integer(4) !== Number(xxhash64(output.subarray(frameStart, used)) & 0xffffffffn)) fail('내용 체크섬이 일치하지 않습니다.');
  }
  return output.slice(0, used);
}
