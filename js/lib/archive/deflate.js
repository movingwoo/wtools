// First-party RFC 1950 (zlib), RFC 1951 (DEFLATE), and RFC 1952 (gzip) codec.
// Compression emits stored or fixed-Huffman blocks. Decompression accepts stored,
// fixed-Huffman, and dynamic-Huffman streams produced by interoperable encoders.

const WINDOW_SIZE = 32 * 1024;
const HASH_SIZE = 1 << 16;
const DEFAULT_MAX_OUTPUT = 256 * 1024 * 1024;
const MAX_INITIAL_OUTPUT = 1024 * 1024;
const FIXED_OUTPUT_LIMIT = Symbol('fixed-output-limit');

const LENGTH_BASE = new Uint16Array([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
]);
const LENGTH_EXTRA = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
  3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
]);
const DISTANCE_BASE = new Uint16Array([
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193,
  12289, 16385, 24577,
]);
const DISTANCE_EXTRA = new Uint8Array([
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
]);
const CODE_LENGTH_ORDER = new Uint8Array([
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value++) {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
})();

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError('압축 입력은 바이트 배열이어야 합니다.');
}

function outputLimit(value) {
  const limit = value == null ? DEFAULT_MAX_OUTPUT : Number(value);
  if (!Number.isSafeInteger(limit) || limit < 0)
    throw new RangeError('해제 결과 크기 한도가 올바르지 않습니다.');
  return limit;
}

function reverseBits(value, length) {
  let reversed = 0;
  for (let bit = 0; bit < length; bit++) {
    reversed = (reversed << 1) | (value & 1);
    value >>>= 1;
  }
  return reversed;
}

function huffman(lengths, maxAllowed = 15, allowSingle = false) {
  let maxBits = 0;
  const counts = new Uint16Array(maxAllowed + 1);
  for (const length of lengths) {
    if (length > maxAllowed) throw new Error('DEFLATE 허프만 코드 길이가 올바르지 않습니다.');
    if (length) {
      counts[length]++;
      if (length > maxBits) maxBits = length;
    }
  }
  if (!maxBits) throw new Error('DEFLATE 허프만 트리가 비어 있습니다.');

  let remaining = 1;
  for (let bits = 1; bits <= maxAllowed; bits++) {
    remaining = (remaining << 1) - counts[bits];
    if (remaining < 0) throw new Error('DEFLATE 허프만 코드가 서로 겹칩니다.');
  }
  if (remaining && !(allowSingle && maxBits === 1 && counts[1] === 1))
    throw new Error('DEFLATE 허프만 트리가 불완전합니다.');

  const next = new Uint16Array(maxAllowed + 1);
  let code = 0;
  for (let bits = 1; bits <= maxAllowed; bits++) {
    code = (code + counts[bits - 1]) << 1;
    next[bits] = code;
  }
  const codes = new Uint16Array(lengths.length);
  const table = new Uint32Array(1 << maxBits);
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const length = lengths[symbol];
    if (!length) continue;
    const reversed = reverseBits(next[length]++, length);
    codes[symbol] = reversed;
    for (let index = reversed; index < table.length; index += 1 << length)
      table[index] = (length << 16) | (symbol + 1);
  }
  return { lengths, codes, table, maxBits };
}

const FIXED_LITERAL_LENGTHS = (() => {
  const lengths = new Uint8Array(288);
  lengths.fill(8, 0, 144);
  lengths.fill(9, 144, 256);
  lengths.fill(7, 256, 280);
  lengths.fill(8, 280);
  return lengths;
})();
const FIXED_DISTANCE_LENGTHS = new Uint8Array(32).fill(5);
const FIXED_LITERAL = huffman(FIXED_LITERAL_LENGTHS);
const FIXED_DISTANCE = huffman(FIXED_DISTANCE_LENGTHS);

class BitReader {
  constructor(bytes, start = 0) {
    this.bytes = bytes;
    this.start = start;
    this.offset = start;
    this.buffer = 0;
    this.length = 0;
    this.readLength = 0;
  }

  fill(length) {
    while (this.length < length && this.offset < this.bytes.length) {
      this.buffer |= this.bytes[this.offset++] << this.length;
      this.length += 8;
    }
  }

  read(length) {
    if (!length) return 0;
    this.fill(length);
    if (this.length < length) throw new Error('DEFLATE 스트림이 중간에서 잘렸습니다.');
    const value = this.buffer & ((1 << length) - 1);
    this.buffer >>>= length;
    this.length -= length;
    this.readLength += length;
    return value;
  }

  align() {
    const padding = (8 - (this.readLength & 7)) & 7;
    if (padding) this.read(padding);
  }

  code(book) {
    this.fill(book.maxBits);
    const entry = book.table[this.buffer & ((1 << book.maxBits) - 1)];
    if (!entry) throw new Error('DEFLATE 허프만 코드가 올바르지 않습니다.');
    const length = entry >>> 16;
    if (this.length < length) throw new Error('DEFLATE 스트림이 중간에서 잘렸습니다.');
    this.read(length);
    return (entry & 0xffff) - 1;
  }

  get nextByte() {
    return this.start + Math.ceil(this.readLength / 8);
  }
}

class ByteWriter {
  constructor(limit, estimate = 1024) {
    this.limit = limit;
    this.length = 0;
    this.bytes = new Uint8Array(Math.min(limit, Math.max(1, estimate)));
  }

  ensure(extra) {
    const needed = this.length + extra;
    if (needed > this.limit) throw new Error(`해제 결과가 안전 한도 ${this.limit.toLocaleString()}바이트를 넘습니다.`);
    if (needed <= this.bytes.length) return;
    let size = this.bytes.length;
    while (size < needed) {
      const grown = size + Math.max(1, Math.ceil(size / 2));
      size = Math.min(this.limit, Math.max(needed, grown));
    }
    const grown = new Uint8Array(size);
    grown.set(this.bytes);
    this.bytes = grown;
  }

  push(value) {
    this.ensure(1);
    this.bytes[this.length++] = value;
  }

  append(bytes) {
    this.ensure(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }

  copy(distance, length) {
    if (!distance || distance > this.length || distance > WINDOW_SIZE)
      throw new Error('DEFLATE 거리 참조가 출력 범위를 벗어났습니다.');
    this.ensure(length);
    for (let index = 0; index < length; index++) {
      this.bytes[this.length] = this.bytes[this.length - distance];
      this.length++;
    }
  }

  finish() {
    const output = this.bytes.subarray(0, this.length);
    // Keep peak memory bounded, but do not retain a very large mostly-unused backing buffer.
    return this.bytes.length > MAX_INITIAL_OUTPUT && this.length * 2 < this.bytes.length
      ? output.slice() : output;
  }
}

class BitWriter {
  constructor(estimate = 1024, limit = Number.MAX_SAFE_INTEGER) {
    this.limit = limit;
    this.bytes = new Uint8Array(Math.min(limit, Math.max(1, estimate)));
    this.length = 0;
    this.buffer = 0;
    this.bitLength = 0;
  }

  ensure(extra) {
    const needed = this.length + extra;
    if (needed > this.limit) throw FIXED_OUTPUT_LIMIT;
    if (needed <= this.bytes.length) return;
    let size = this.bytes.length;
    while (size < needed) size = Math.min(this.limit, Math.max(needed, size * 2));
    const grown = new Uint8Array(size);
    grown.set(this.bytes);
    this.bytes = grown;
  }

  byte(value) {
    this.ensure(1);
    this.bytes[this.length++] = value;
  }

  write(value, length) {
    this.buffer |= value << this.bitLength;
    this.bitLength += length;
    while (this.bitLength >= 8) {
      this.byte(this.buffer & 0xff);
      this.buffer >>>= 8;
      this.bitLength -= 8;
    }
  }

  align() {
    if (this.bitLength) {
      this.byte(this.buffer & 0xff);
      this.buffer = 0;
      this.bitLength = 0;
    }
  }

  append(bytes) {
    if (this.bitLength) throw new Error('내부 DEFLATE 바이트 정렬 오류입니다.');
    this.ensure(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }

  finish() {
    this.align();
    const output = this.bytes.subarray(0, this.length);
    return this.bytes.length > MAX_INITIAL_OUTPUT && this.length * 2 < this.bytes.length
      ? output.slice() : output;
  }
}

function dynamicBooks(reader) {
  const literalCount = reader.read(5) + 257;
  const distanceCount = reader.read(5) + 1;
  const codeCount = reader.read(4) + 4;
  const codeLengths = new Uint8Array(19);
  for (let index = 0; index < codeCount; index++) codeLengths[CODE_LENGTH_ORDER[index]] = reader.read(3);
  const codeBook = huffman(codeLengths, 7);
  const lengths = new Uint8Array(literalCount + distanceCount);
  let offset = 0;
  while (offset < lengths.length) {
    const symbol = reader.code(codeBook);
    if (symbol <= 15) {
      lengths[offset++] = symbol;
      continue;
    }
    let value = 0, count;
    if (symbol === 16) {
      if (!offset) throw new Error('DEFLATE 반복 코드 앞에 코드 길이가 없습니다.');
      value = lengths[offset - 1];
      count = reader.read(2) + 3;
    } else if (symbol === 17) count = reader.read(3) + 3;
    else if (symbol === 18) count = reader.read(7) + 11;
    else throw new Error('DEFLATE 코드 길이 기호가 올바르지 않습니다.');
    if (offset + count > lengths.length) throw new Error('DEFLATE 코드 길이 반복이 범위를 넘습니다.');
    lengths.fill(value, offset, offset + count);
    offset += count;
  }
  const literalLengths = lengths.slice(0, literalCount);
  if (!literalLengths[256]) throw new Error('DEFLATE 블록에 종료 코드가 없습니다.');
  return {
    literal: huffman(literalLengths, 15, true),
    distance: huffman(lengths.slice(literalCount), 15, true),
  };
}

function inflateCodes(reader, writer, literal, distance) {
  while (true) {
    const symbol = reader.code(literal);
    if (symbol < 256) {
      writer.push(symbol);
      continue;
    }
    if (symbol === 256) return;
    if (symbol < 257 || symbol > 285) throw new Error('DEFLATE 길이 기호가 올바르지 않습니다.');
    const lengthIndex = symbol - 257;
    const length = LENGTH_BASE[lengthIndex] + reader.read(LENGTH_EXTRA[lengthIndex]);
    const distanceSymbol = reader.code(distance);
    if (distanceSymbol > 29) throw new Error('DEFLATE 거리 기호가 올바르지 않습니다.');
    const back = DISTANCE_BASE[distanceSymbol] + reader.read(DISTANCE_EXTRA[distanceSymbol]);
    writer.copy(back, length);
  }
}

function inflateMember(bytes, start, maxOutputLength) {
  const reader = new BitReader(bytes, start);
  const estimate = Math.min(MAX_INITIAL_OUTPUT, Math.max(1024, (bytes.length - start) * 3));
  const writer = new ByteWriter(maxOutputLength, Math.min(maxOutputLength, estimate));
  let final = false;
  while (!final) {
    final = !!reader.read(1);
    const type = reader.read(2);
    if (type === 0) {
      reader.align();
      const length = reader.read(16);
      const inverse = reader.read(16);
      if (((length ^ 0xffff) & 0xffff) !== inverse)
        throw new Error('DEFLATE 저장 블록 길이 검증에 실패했습니다.');
      writer.ensure(length);
      for (let index = 0; index < length; index++) writer.push(reader.read(8));
    } else if (type === 1) inflateCodes(reader, writer, FIXED_LITERAL, FIXED_DISTANCE);
    else if (type === 2) {
      const books = dynamicBooks(reader);
      inflateCodes(reader, writer, books.literal, books.distance);
    } else throw new Error('예약된 DEFLATE 블록 형식은 지원하지 않습니다.');
  }
  return { output: writer.finish(), nextOffset: reader.nextByte };
}

function hashAt(bytes, offset) {
  return ((bytes[offset] * 251 + bytes[offset + 1]) * 251 + bytes[offset + 2]) & (HASH_SIZE - 1);
}

function writeSymbol(writer, book, symbol) {
  writer.write(book.codes[symbol], book.lengths[symbol]);
}

function lengthSymbol(length) {
  for (let index = 0; index < LENGTH_BASE.length; index++) {
    const extra = LENGTH_EXTRA[index];
    if (length <= LENGTH_BASE[index] + ((1 << extra) - 1)) return index;
  }
  return LENGTH_BASE.length - 1;
}

function distanceSymbol(distance) {
  for (let index = 0; index < DISTANCE_BASE.length; index++) {
    const extra = DISTANCE_EXTRA[index];
    if (distance <= DISTANCE_BASE[index] + ((1 << extra) - 1)) return index;
  }
  return DISTANCE_BASE.length - 1;
}

function fixedDeflate(bytes, level, maxOutputLength) {
  // A stream of 9-bit literals is the largest possible fixed-Huffman encoding.
  const upperBound = Math.max(2, Math.ceil((bytes.length * 9 + 10) / 8));
  const writer = new BitWriter(Math.min(maxOutputLength, upperBound), maxOutputLength);
  const head = new Int32Array(HASH_SIZE);
  const previous = new Int32Array(WINDOW_SIZE);
  head.fill(-1);
  previous.fill(-1);
  const maxChain = level <= 1 ? 8 : level >= 9 ? 256 : 64;

  const insert = (position) => {
    if (position + 2 >= bytes.length) return;
    const hash = hashAt(bytes, position);
    previous[position & (WINDOW_SIZE - 1)] = head[hash];
    head[hash] = position;
  };

  try {
    writer.write(3, 3); // BFINAL=1, BTYPE=01 (fixed Huffman).
    let position = 0;
    while (position < bytes.length) {
      let bestLength = 0, bestDistance = 0;
      if (position + 2 < bytes.length) {
        let candidate = head[hashAt(bytes, position)];
        let remaining = maxChain;
        const maximum = Math.min(258, bytes.length - position);
        while (candidate >= 0 && position - candidate <= WINDOW_SIZE && remaining-- > 0) {
          if (bytes[candidate] === bytes[position]
              && bytes[candidate + bestLength] === bytes[position + bestLength]) {
            let length = 1;
            while (length < maximum && bytes[candidate + length] === bytes[position + length]) length++;
            if (length >= 3 && length > bestLength) {
              bestLength = length;
              bestDistance = position - candidate;
              if (length === maximum) break;
            }
          }
          const next = previous[candidate & (WINDOW_SIZE - 1)];
          if (next >= candidate) break;
          candidate = next;
        }
      }

      if (bestLength >= 3) {
        const lengthIndex = lengthSymbol(bestLength);
        writeSymbol(writer, FIXED_LITERAL, lengthIndex + 257);
        writer.write(bestLength - LENGTH_BASE[lengthIndex], LENGTH_EXTRA[lengthIndex]);
        const distanceIndex = distanceSymbol(bestDistance);
        writer.write(FIXED_DISTANCE.codes[distanceIndex], FIXED_DISTANCE.lengths[distanceIndex]);
        writer.write(bestDistance - DISTANCE_BASE[distanceIndex], DISTANCE_EXTRA[distanceIndex]);
        for (let index = 0; index < bestLength; index++) insert(position + index);
        position += bestLength;
      } else {
        writeSymbol(writer, FIXED_LITERAL, bytes[position]);
        insert(position++);
      }
    }
    writeSymbol(writer, FIXED_LITERAL, 256);
    return { output: writer.finish() };
  } catch (error) {
    if (error !== FIXED_OUTPUT_LIMIT) throw error;
    return { output: null, reuse: writer.bytes };
  }
}

function storedDeflate(bytes, reuse) {
  const blocks = Math.max(1, Math.ceil(bytes.length / 0xffff));
  const size = bytes.length + blocks * 5;
  const output = reuse?.length === size ? reuse : new Uint8Array(size);
  let inputOffset = 0, outputOffset = 0;
  for (let block = 0; block < blocks; block++) {
    const length = Math.min(0xffff, bytes.length - inputOffset);
    output[outputOffset++] = block === blocks - 1 ? 1 : 0; // BFINAL, BTYPE=00, zero padding.
    output[outputOffset++] = length & 0xff;
    output[outputOffset++] = length >>> 8;
    output[outputOffset++] = (~length) & 0xff;
    output[outputOffset++] = (~length) >>> 8 & 0xff;
    output.set(bytes.subarray(inputOffset, inputOffset + length), outputOffset);
    inputOffset += length;
    outputOffset += length;
  }
  return output;
}

export function deflateRaw(input, { level = 6 } = {}) {
  const bytes = asBytes(input);
  const normalizedLevel = Math.max(1, Math.min(9, Number(level) || 6));
  const storedSize = bytes.length + Math.max(1, Math.ceil(bytes.length / 0xffff)) * 5;
  const fixed = fixedDeflate(bytes, normalizedLevel, storedSize);
  return fixed.output || storedDeflate(bytes, fixed.reuse);
}

export function inflateRaw(input, { maxOutputLength } = {}) {
  const bytes = asBytes(input);
  const member = inflateMember(bytes, 0, outputLimit(maxOutputLength));
  if (member.nextOffset !== bytes.length) throw new Error('DEFLATE 스트림 뒤에 불필요한 데이터가 있습니다.');
  return member.output;
}

export function crc32(input) {
  const bytes = asBytes(input);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function adler32(input) {
  const bytes = asBytes(input);
  let first = 1, second = 0;
  for (let offset = 0; offset < bytes.length; offset += 5552) {
    const end = Math.min(bytes.length, offset + 5552);
    for (let index = offset; index < end; index++) {
      first += bytes[index];
      second += first;
    }
    first %= 65521;
    second %= 65521;
  }
  return ((second << 16) | first) >>> 0;
}

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function u32le(value) {
  return new Uint8Array([value, value >>> 8, value >>> 16, value >>> 24]);
}

function readU32le(bytes, offset) {
  return (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0;
}

function readU32be(bytes, offset) {
  return (bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3])) >>> 0;
}

export function gzip(input, options = {}) {
  const bytes = asBytes(input);
  const body = deflateRaw(bytes, options);
  return concat([
    new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, options.level >= 9 ? 2 : options.level <= 1 ? 4 : 0, 3]),
    body,
    u32le(crc32(bytes)),
    u32le(bytes.length >>> 0),
  ]);
}

function skipZeroTerminated(bytes, offset, label) {
  while (offset < bytes.length && bytes[offset]) offset++;
  if (offset >= bytes.length) throw new Error(`Gzip ${label} 필드가 중간에서 잘렸습니다.`);
  return offset + 1;
}

export function gunzip(input, { maxOutputLength } = {}) {
  const bytes = asBytes(input);
  const limit = outputLimit(maxOutputLength);
  let firstOutput = null, aggregate = null;
  let total = 0, offset = 0, members = 0;
  while (offset < bytes.length) {
    const headerStart = offset;
    if (offset + 10 > bytes.length || bytes[offset] !== 0x1f || bytes[offset + 1] !== 0x8b)
      throw new Error('올바른 Gzip 헤더가 아닙니다.');
    if (bytes[offset + 2] !== 8) throw new Error('지원하지 않는 Gzip 압축 방식입니다.');
    const flags = bytes[offset + 3];
    if (flags & 0xe0) throw new Error('Gzip 헤더의 예약 플래그가 설정되어 있습니다.');
    offset += 10;
    if (flags & 4) {
      if (offset + 2 > bytes.length) throw new Error('Gzip 추가 필드 길이가 잘렸습니다.');
      const length = bytes[offset] | bytes[offset + 1] << 8;
      offset += 2;
      if (offset + length > bytes.length) throw new Error('Gzip 추가 필드가 중간에서 잘렸습니다.');
      offset += length;
    }
    if (flags & 8) offset = skipZeroTerminated(bytes, offset, '파일명');
    if (flags & 16) offset = skipZeroTerminated(bytes, offset, '주석');
    if (flags & 2) {
      if (offset + 2 > bytes.length) throw new Error('Gzip 헤더 체크섬이 잘렸습니다.');
      const expected = bytes[offset] | bytes[offset + 1] << 8;
      const actual = crc32(bytes.subarray(headerStart, offset)) & 0xffff;
      if (expected !== actual) throw new Error('Gzip 헤더 CRC-16 검증에 실패했습니다.');
      offset += 2;
    }

    const member = inflateMember(bytes, offset, limit - total);
    offset = member.nextOffset;
    if (offset + 8 > bytes.length) throw new Error('Gzip 체크섬 또는 원본 크기가 잘렸습니다.');
    if (readU32le(bytes, offset) !== crc32(member.output)) throw new Error('Gzip CRC-32 검증에 실패했습니다.');
    if (readU32le(bytes, offset + 4) !== (member.output.length >>> 0))
      throw new Error('Gzip 원본 크기 검증에 실패했습니다.');
    offset += 8;
    if (!members) firstOutput = member.output;
    else {
      if (!aggregate) {
        aggregate = new ByteWriter(limit, Math.min(limit, total + member.output.length));
        aggregate.append(firstOutput);
        firstOutput = null;
      }
      aggregate.append(member.output);
    }
    total += member.output.length;
    members++;
  }
  if (!members) throw new Error('Gzip 데이터가 비어 있습니다.');
  return aggregate ? aggregate.finish() : firstOutput;
}

export function zlib(input, options = {}) {
  const bytes = asBytes(input);
  const level = Math.max(1, Math.min(9, Number(options.level) || 6));
  const flevel = level <= 1 ? 0 : level >= 9 ? 3 : 2;
  const cmf = 0x78;
  let flg = flevel << 6;
  flg += (31 - ((cmf << 8 | flg) % 31)) % 31;
  const checksum = adler32(bytes);
  return concat([
    new Uint8Array([cmf, flg]),
    deflateRaw(bytes, { level }),
    new Uint8Array([checksum >>> 24, checksum >>> 16, checksum >>> 8, checksum]),
  ]);
}

export function unzlib(input, { maxOutputLength } = {}) {
  const bytes = asBytes(input);
  if (bytes.length < 6) throw new Error('Zlib 스트림이 중간에서 잘렸습니다.');
  const cmf = bytes[0], flg = bytes[1];
  if ((cmf & 15) !== 8) throw new Error('지원하지 않는 Zlib 압축 방식입니다.');
  if ((cmf >>> 4) > 7) throw new Error('Zlib 윈도 크기가 허용 범위를 넘습니다.');
  if (((cmf << 8) | flg) % 31) throw new Error('Zlib 헤더 체크 비트가 올바르지 않습니다.');
  if (flg & 0x20) throw new Error('사전이 필요한 Zlib 스트림은 지원하지 않습니다.');
  const member = inflateMember(bytes, 2, outputLimit(maxOutputLength));
  if (member.nextOffset + 4 !== bytes.length) throw new Error('Zlib 스트림 길이가 올바르지 않습니다.');
  if (readU32be(bytes, member.nextOffset) !== adler32(member.output))
    throw new Error('Zlib Adler-32 검증에 실패했습니다.');
  return member.output;
}

const nativeSupport = new Map();

function streamFormat(format) {
  if (format === 'gzip') return 'gzip';
  if (format === 'zlib') return 'deflate';
  if (format === 'raw-deflate') return 'deflate-raw';
  throw new Error(`지원하지 않는 압축 형식입니다: ${format}`);
}

function supportsNative(kind, format) {
  const key = `${kind}:${format}`;
  if (nativeSupport.has(key)) return nativeSupport.get(key);
  const Constructor = kind === 'compress' ? globalThis.CompressionStream : globalThis.DecompressionStream;
  let supported = false;
  if (typeof Constructor === 'function') {
    try {
      new Constructor(streamFormat(format));
      supported = true;
    } catch { /* Use the first-party codec. */ }
  }
  nativeSupport.set(key, supported);
  return supported;
}

async function nativeTransform(input, kind, format, maxOutputLength) {
  const Constructor = kind === 'compress' ? CompressionStream : DecompressionStream;
  const reader = new Blob([input]).stream().pipeThrough(new Constructor(streamFormat(format))).getReader();
  const estimate = Math.min(MAX_INITIAL_OUTPUT, Math.max(1024, input.length * 2));
  const output = new ByteWriter(maxOutputLength, Math.min(maxOutputLength, estimate));
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxOutputLength) {
        await reader.cancel();
        throw new Error(`해제 결과가 안전 한도 ${maxOutputLength.toLocaleString()}바이트를 넘습니다.`);
      }
      output.append(value);
    }
  } finally {
    reader.releaseLock();
  }
  return output.finish();
}

export async function compress(input, { format = 'gzip', level = 6, preferNative = true } = {}) {
  const bytes = asBytes(input);
  const normalizedLevel = Math.max(1, Math.min(9, Number(level) || 6));
  if (preferNative && normalizedLevel === 6 && supportsNative('compress', format)) {
    try {
      return await nativeTransform(bytes, 'compress', format, Number.MAX_SAFE_INTEGER);
    } catch (error) {
      throw new Error(`압축에 실패했습니다: ${error?.message || error}`);
    }
  }
  if (format === 'gzip') return gzip(bytes, { level: normalizedLevel });
  if (format === 'zlib') return zlib(bytes, { level: normalizedLevel });
  if (format === 'raw-deflate') return deflateRaw(bytes, { level: normalizedLevel });
  throw new Error(`지원하지 않는 압축 형식입니다: ${format}`);
}

export async function decompress(input, {
  format = 'gzip', maxOutputLength, preferNative = true,
} = {}) {
  const bytes = asBytes(input);
  const limit = outputLimit(maxOutputLength);
  // CompressionStream defines gzip as one member, while RFC 1952 files may
  // concatenate members. Keep file-compatible multi-member behavior here.
  if (preferNative && format !== 'gzip' && supportsNative('decompress', format)) {
    try {
      return await nativeTransform(bytes, 'decompress', format, limit);
    } catch (error) {
      if (error?.message?.startsWith('해제 결과가 안전 한도')) throw error;
      throw new Error('압축 데이터를 해제하지 못했습니다. 형식과 손상 여부를 확인하세요.');
    }
  }
  if (format === 'gzip') {
    try {
      return gunzip(bytes, { maxOutputLength: limit });
    } catch (error) {
      if (error?.message?.startsWith('해제 결과가 안전 한도')) throw error;
      throw new Error('압축 데이터를 해제하지 못했습니다. 형식과 손상 여부를 확인하세요.');
    }
  }
  if (format === 'zlib') return unzlib(bytes, { maxOutputLength: limit });
  if (format === 'raw-deflate') return inflateRaw(bytes, { maxOutputLength: limit });
  throw new Error(`지원하지 않는 압축 형식입니다: ${format}`);
}
