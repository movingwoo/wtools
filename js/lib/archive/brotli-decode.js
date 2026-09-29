// First-party RFC 7932 decoder. Normative data is generated separately from the RFC.
// No window/header-sized output allocation: check each meta-block before output grows.
import { LUT0, LUT1, LUT2, DICTIONARY_BITS, TRANSFORMS } from './brotli-tables.js';

const MAX_INPUT = 256 * 1024 * 1024;
const MAX_OUTPUT = 128 * 1024 * 1024;
const PAGE_SIZE = 65536;
const INSERT_BITS = [0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 12, 14, 24];
const COPY_BITS = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 24];
const COUNT_BITS = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 7, 8, 9, 10, 11, 12, 13, 24];
const INSERT_GROUP = [0, 0, 0, 0, 8, 8, 0, 16, 8, 16, 16];
const COPY_GROUP = [0, 8, 0, 8, 0, 8, 16, 0, 16, 8, 16];
const LENGTH_ORDER = [1, 2, 3, 4, 0, 5, 17, 6, 16, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const bases = (bits, start) => bits.map((width) => { const base = start; start += 2 ** width; return base; });
const INSERT_BASE = bases(INSERT_BITS, 0), COPY_BASE = bases(COPY_BITS, 2), COUNT_BASE = bases(COUNT_BITS, 1);
const DICTIONARY_OFFSET = [];
let dictionarySize = 0;
for (let length = 0; length <= 24; length++) {
  DICTIONARY_OFFSET.push(dictionarySize);
  if (length >= 4) dictionarySize += length * 2 ** DICTIONARY_BITS[length];
}

class BitReader {
  constructor(bytes) { this.bytes = bytes; this.position = 0; }
  fail(message) { throw new Error(`Brotli 비트 ${this.position}: ${message}`); }
  peek(width) {
    const index = this.position >>> 3, shift = this.position & 7, b = this.bytes;
    const value = b[index] | b[index + 1] << 8 | b[index + 2] << 16 | b[index + 3] << 24;
    return (value >>> shift) & ((1 << width) - 1);
  }
  skip(width) {
    if (this.position + width > this.bytes.length * 8) this.fail('데이터가 잘렸습니다.');
    this.position += width;
  }
  read(width) { const value = this.peek(width); this.skip(width); return value; }
  align() { if (this.read((8 - (this.position & 7)) & 7)) this.fail('채움 비트가 0이 아닙니다.'); }
  raw(length) {
    const start = this.position >>> 3;
    this.skip(length * 8);
    return this.bytes.subarray(start, start + length);
  }
}

function treeFromLengths(reader, lengths, allowSingle = false) {
  const counts = new Uint16Array(16), first = new Uint16Array(16), offset = new Uint16Array(16);
  let used = 0, single = -1, space = 32768;
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const width = lengths[symbol];
    if (width) { counts[width]++; used++; single = symbol; space -= 32768 >>> width; }
  }
  if (allowSingle && used === 1) return { single };
  if (space !== 0 || used < 2) reader.fail('허프만 코드 길이가 불완전하거나 서로 겹칩니다.');
  const symbols = new Uint16Array(used), fast = new Uint16Array(256);
  let code = 0, start = 0;
  for (let width = 1; width <= 15; width++) {
    code = (code + counts[width - 1]) * 2;
    first[width] = code;
    offset[width] = start;
    start += counts[width];
  }
  const cursor = offset.slice();
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const width = lengths[symbol];
    if (!width) continue;
    const index = cursor[width]++;
    symbols[index] = symbol;
    if (width <= 8) {
      let value = first[width] + index - offset[width], reversed = 0;
      for (let i = 0; i < width; i++) { reversed = reversed * 2 + (value & 1); value >>>= 1; }
      for (let i = reversed; i < 256; i += 1 << width) fast[i] = (width << 11) | symbol;
    }
  }
  return { single: -1, counts, first, offset, symbols, fast };
}

function symbol(reader, tree) {
  if (tree.single >= 0) return tree.single;
  const entry = tree.fast[reader.peek(8)];
  if (entry) { reader.skip(entry >>> 11); return entry & 2047; }
  let code = 0;
  for (let width = 1; width <= 15; width++) {
    code = code * 2 + reader.read(1);
    const index = code - tree.first[width];
    if (index >= 0 && index < tree.counts[width]) return tree.symbols[tree.offset[width] + index];
  }
  reader.fail('존재하지 않는 허프만 코드입니다.');
}

function readTree(reader, alphabet) {
  const skip = reader.read(2), lengths = new Uint8Array(alphabet);
  if (skip === 1) {
    const count = reader.read(2) + 1, values = [], bits = Math.ceil(Math.log2(alphabet));
    for (let i = 0; i < count; i++) {
      const value = reader.read(bits);
      if (value >= alphabet || values.includes(value)) reader.fail('단순 허프만 코드의 기호가 중복되거나 범위를 넘습니다.');
      values.push(value);
    }
    if (count === 1) return { single: values[0] };
    const widths = count === 2 ? [1, 1] : count === 3 ? [1, 2, 2]
      : reader.read(1) ? [1, 2, 3, 3] : [2, 2, 2, 2];
    values.forEach((value, i) => { lengths[value] = widths[i]; });
    return treeFromLengths(reader, lengths);
  }
  const codeLengths = new Uint8Array(18);
  let space = 32;
  for (let i = skip; i < 18 && space > 0; i++) {
    const prefix = reader.read(2);
    const width = prefix < 3 ? [0, 4, 3][prefix] : reader.read(1) ? (reader.read(1) ? 5 : 1) : 2;
    codeLengths[LENGTH_ORDER[i]] = width;
    if (width) space -= 32 >>> width;
  }
  if (space < 0) reader.fail('코드 길이 허프만 트리가 서로 겹칩니다.');
  const lengthTree = treeFromLengths(reader, codeLengths, true);
  let index = 0, remaining = 32768, previousLength = 8, previousSymbol = -1, repeat = 0;
  while (remaining > 0 && index < alphabet) {
    const value = symbol(reader, lengthTree);
    if (value < 16) {
      lengths[index++] = value;
      if (value) { previousLength = value; remaining -= 32768 >>> value; }
      repeat = 0;
    } else {
      const bits = value === 16 ? 2 : 3, width = value === 16 ? previousLength : 0;
      const old = previousSymbol === value ? repeat : 0;
      repeat = (old ? (old - 2) * 2 ** bits : 0) + 3 + reader.read(bits);
      const count = repeat - old;
      if (index + count > alphabet) reader.fail('허프만 코드 길이 반복이 알파벳을 넘습니다.');
      lengths.fill(width, index, index + count);
      index += count;
      if (width) remaining -= count * (32768 >>> width);
    }
    previousSymbol = value;
  }
  if (remaining !== 0) reader.fail('허프만 코드 길이 합이 올바르지 않습니다.');
  return treeFromLengths(reader, lengths);
}

function readCount(reader) {
  if (!reader.read(1)) return 1;
  const bits = reader.read(3);
  return bits ? (1 << bits) + 1 + reader.read(bits) : 2;
}

function blockLength(reader, tree) {
  const code = symbol(reader, tree);
  return COUNT_BASE[code] + reader.read(COUNT_BITS[code]);
}

class Block {
  constructor(reader) {
    this.types = readCount(reader);
    this.current = 0;
    this.previous = 1;
    this.remaining = Infinity;
    if (this.types > 1) {
      this.typeTree = readTree(reader, this.types + 2);
      this.lengthTree = readTree(reader, 26);
      this.remaining = blockLength(reader, this.lengthTree);
    }
  }
  next(reader) {
    if (!this.remaining) {
      const code = symbol(reader, this.typeTree);
      const type = code === 0 ? this.previous : code === 1 ? (this.current + 1) % this.types : code - 2;
      if (type >= this.types) reader.fail('블록 종류가 범위를 넘습니다.');
      this.previous = this.current;
      this.current = type;
      this.remaining = blockLength(reader, this.lengthTree);
    }
    this.remaining--;
    return this.current;
  }
}

function contextMap(reader, size) {
  const count = readCount(reader), map = new Uint8Array(size);
  if (count > 1) {
    const rle = reader.read(1) ? reader.read(4) + 1 : 0;
    const tree = readTree(reader, count + rle);
    let index = 0;
    while (index < size) {
      const value = symbol(reader, tree);
      if (value > 0 && value <= rle) {
        index += (1 << value) + reader.read(value);
        if (index > size) reader.fail('문맥 맵의 반복 길이가 범위를 넘습니다.');
      } else map[index++] = value === 0 ? 0 : value - rle;
    }
    if (reader.read(1)) {
      const order = Uint8Array.from({ length: 256 }, (_, i) => i);
      for (let i = 0; i < size; i++) {
        const index = map[i], value = order[index];
        order.copyWithin(1, 0, index);
        order[0] = value;
        map[i] = value;
      }
    }
  }
  return { count, map };
}

class Output {
  constructor(limit, reader) { this.limit = limit; this.reader = reader; this.pages = []; this.length = 0; }
  check(length) {
    if (length > this.limit - this.length) this.reader.fail('해제 결과가 안전 한도(최대 128 MiB·압축률 200:1)를 넘습니다.');
  }
  page() {
    const index = this.length >>> 16;
    if (!this.pages[index]) this.pages.push(new Uint8Array(Math.min(PAGE_SIZE, this.limit - index * PAGE_SIZE)));
    return this.pages[index];
  }
  get(index) { return index < 0 ? 0 : this.pages[index >>> 16][index & 65535]; }
  byte(value) { const page = this.page(); page[this.length++ & 65535] = value; }
  append(bytes) {
    let offset = 0;
    while (offset < bytes.length) {
      const page = this.page(), start = this.length & 65535;
      const count = Math.min(bytes.length - offset, page.length - start);
      page.set(bytes.subarray(offset, offset + count), start);
      this.length += count;
      offset += count;
    }
  }
  copy(distance, length) {
    while (length) {
      const page = this.page(), start = this.length & 65535;
      const count = Math.min(length, page.length - start);
      if (distance === 1) page.fill(this.get(this.length - 1), start, start + count);
      else {
        for (let i = 0; i < count; i++) page[start + i] = this.get(this.length + i - distance);
      }
      this.length += count;
      length -= count;
    }
  }
  finish() {
    const result = new Uint8Array(this.length);
    for (let i = 0; i < this.pages.length; i++) result.set(this.pages[i].subarray(0, this.length - i * PAGE_SIZE), i * PAGE_SIZE);
    return result;
  }
}

function dictionaryWord(reader, dictionary, length, id) {
  if (length < 4 || length > 24) reader.fail('정적 사전 단어 길이는 4~24바이트여야 합니다.');
  const count = 2 ** DICTIONARY_BITS[length], transform = Math.floor(id / count);
  if (transform > 120) reader.fail('존재하지 않는 정적 사전 변환입니다.');
  if (!(dictionary instanceof Uint8Array) || dictionary.length !== dictionarySize)
    reader.fail('표준 Brotli 사전 데이터가 필요합니다.');
  const [prefix, operation, suffix] = TRANSFORMS[transform];
  const start = DICTIONARY_OFFSET[length] + (id % count) * length;
  const omitFirst = operation >= 3 && operation <= 11 ? operation - 2 : 0;
  const omitLast = operation >= 12 ? operation - 11 : 0;
  const body = dictionary.slice(start + Math.min(length, omitFirst), start + Math.max(0, length - omitLast));
  if (operation === 1 || operation === 2) {
    for (let i = 0; i < body.length;) {
      const value = body[i];
      if (value < 192) { if (value >= 97 && value <= 122) body[i] ^= 32; i++; }
      else if (value < 224) { if (i + 1 < body.length) body[i + 1] ^= 32; i += 2; }
      else { if (i + 2 < body.length) body[i + 2] ^= 5; i += 3; }
      if (operation === 1) break;
    }
  }
  const result = new Uint8Array(prefix.length + body.length + suffix.length);
  for (let i = 0; i < prefix.length; i++) result[i] = prefix.charCodeAt(i);
  result.set(body, prefix.length);
  for (let i = 0; i < suffix.length; i++) result[prefix.length + body.length + i] = suffix.charCodeAt(i);
  return result;
}

function distanceValue(reader, code, history, postfix, direct) {
  if (code < 4) return history[code];
  if (code < 16) {
    const offset = code < 10 ? code - 4 : code - 10;
    return history[code < 10 ? 0 : 1] + (offset & 1 ? 1 : -1) * ((offset >>> 1) + 1);
  }
  if (code < 16 + direct) return code - 15;
  const value = code - 16 - direct, high = value >>> postfix, bits = 1 + (high >>> 1);
  return (((2 + (high & 1)) * 2 ** bits - 4 + reader.read(bits)) * 2 ** postfix)
    + (value & ((1 << postfix) - 1)) + direct + 1;
}

function compressedBlock(reader, output, end, window, history, dictionary) {
  const literals = new Block(reader), commands = new Block(reader), distances = new Block(reader);
  const postfix = reader.read(2), direct = reader.read(4) << postfix;
  const modes = Uint8Array.from({ length: literals.types }, () => reader.read(2));
  const literalMap = contextMap(reader, 64 * literals.types), distanceMap = contextMap(reader, 4 * distances.types);
  const literalTrees = Array.from({ length: literalMap.count }, () => readTree(reader, 256));
  const commandTrees = Array.from({ length: commands.types }, () => readTree(reader, 704));
  const distanceTrees = Array.from({ length: distanceMap.count }, () => readTree(reader, 16 + direct + (48 << postfix)));
  while (output.length < end) {
    const beforeBits = reader.position, beforeOutput = output.length;
    const command = symbol(reader, commandTrees[commands.next(reader)]), group = command >>> 6;
    const insertCode = INSERT_GROUP[group] + ((command >>> 3) & 7), copyCode = COPY_GROUP[group] + (command & 7);
    const insertLength = INSERT_BASE[insertCode] + reader.read(INSERT_BITS[insertCode]);
    const copyLength = COPY_BASE[copyCode] + reader.read(COPY_BITS[copyCode]);
    if (insertLength > end - output.length) reader.fail('리터럴 길이가 메타블록을 넘습니다.');
    for (let i = 0; i < insertLength; i++) {
      const type = literals.next(reader), mode = modes[type];
      const p1 = output.get(output.length - 1), p2 = output.get(output.length - 2);
      const context = mode === 0 ? p1 & 63 : mode === 1 ? p1 >>> 2 : mode === 2 ? LUT0[p1] | LUT1[p2] : (LUT2[p1] << 3) | LUT2[p2];
      output.byte(symbol(reader, literalTrees[literalMap.map[type * 64 + context]]));
    }
    if (output.length === end) break;
    // RFC 7932 section 10 / erratum 6977: implicit distances consume no distance block symbols.
    const code = command < 128 ? 0
      : symbol(reader, distanceTrees[distanceMap.map[distances.next(reader) * 4 + Math.min(copyLength - 2, 3)]]);
    const distance = distanceValue(reader, code, history, postfix, direct);
    if (distance <= 0) reader.fail('뒤로 복사할 거리가 0 이하입니다.');
    const maximum = Math.min(output.length, window);
    if (distance > maximum) {
      const word = dictionaryWord(reader, dictionary, copyLength, distance - maximum - 1);
      if (word.length > end - output.length) reader.fail('사전 단어 길이가 메타블록을 넘습니다.');
      output.append(word);
    } else {
      if (copyLength > end - output.length) reader.fail('복사 길이가 메타블록을 넘습니다.');
      if (code !== 0) { history[3] = history[2]; history[2] = history[1]; history[1] = history[0]; history[0] = distance; }
      output.copy(distance, copyLength);
    }
    if (reader.position === beforeBits && output.length === beforeOutput) reader.fail('진행하지 않는 압축 명령입니다.');
  }
}

export function decompress(bytes, { dictionary, maxOutputLength = MAX_OUTPUT, maxExpansionRatio = 200 } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Brotli 입력은 바이트 배열이어야 합니다.');
  if (bytes.length > MAX_INPUT) throw new Error('Brotli 입력이 안전 한도 256 MiB를 넘습니다.');
  if (!Number.isSafeInteger(maxOutputLength) || maxOutputLength < 0 || maxOutputLength > MAX_OUTPUT)
    throw new Error('Brotli 출력 상한은 0~128 MiB의 정수여야 합니다.');
  if (!Number.isFinite(maxExpansionRatio) || maxExpansionRatio <= 0 || maxExpansionRatio > 200)
    throw new Error('Brotli 압축률 상한은 0보다 크고 200 이하여야 합니다.');
  const reader = new BitReader(bytes);
  let bits = 16;
  if (reader.read(1)) {
    const code = reader.read(3);
    if (code) bits = 17 + code;
    else {
      const small = reader.read(3);
      if (small === 1) reader.fail('지원하지 않는 확장 윈도 또는 잘못된 스트림 헤더입니다.');
      bits = small ? 8 + small : 17;
    }
  }
  const window = 2 ** bits - 16, history = [4, 11, 15, 16];
  const output = new Output(Math.min(maxOutputLength, Math.floor(bytes.length * maxExpansionRatio)), reader);
  let last;
  do {
    last = reader.read(1);
    if (last && reader.read(1)) break;
    const nibbles = reader.read(2) + 4;
    if (nibbles === 7) {
      if (reader.read(1)) reader.fail('예약 비트가 0이 아닙니다.');
      const count = reader.read(2), encoded = reader.read(count * 8);
      if (count > 1 && encoded < 2 ** (8 * (count - 1))) reader.fail('메타데이터 길이에 불필요한 상위 바이트가 있습니다.');
      reader.align();
      reader.raw(count ? encoded + 1 : 0);
      continue;
    }
    const encoded = reader.read(nibbles * 4);
    if (nibbles > 4 && encoded < 2 ** ((nibbles - 1) * 4)) reader.fail('메타블록 길이에 불필요한 상위 니블이 있습니다.');
    const length = encoded + 1;
    output.check(length);
    if (!last && reader.read(1)) { reader.align(); output.append(reader.raw(length)); }
    else compressedBlock(reader, output, output.length + length, window, history, dictionary);
  } while (!last);
  reader.align();
  if (reader.position !== bytes.length * 8) reader.fail('스트림 뒤에 불필요한 데이터가 있습니다.');
  return output.finish();
}
