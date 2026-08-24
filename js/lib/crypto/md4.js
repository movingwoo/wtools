// MD4 (RFC 1320) — 레거시 형식 호환을 위한 스트리밍 구현.

const BLOCK_BYTES = 64;
const DIGEST_BYTES = 16;
const ROUND_1_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const ROUND_2_ORDER = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
const ROUND_3_ORDER = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
const ROUND_ORDERS = [ROUND_1_ORDER, ROUND_2_ORDER, ROUND_3_ORDER];
const ROUND_SHIFTS = [[3, 7, 11, 19], [3, 5, 9, 13], [3, 9, 11, 15]];
const ROUND_CONSTANTS = [0, 0x5a827999, 0x6ed9eba1];

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError('MD4 입력은 바이트 배열이어야 합니다.');
}

function rotateLeft(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function roundStep(value, mixed, word, constant, shift) {
  return rotateLeft((value + mixed + word + constant) >>> 0, shift);
}

function mixRound(round, x, y, z) {
  if (round === 0) return (x & y) | (~x & z);
  if (round === 1) return (x & y) | (x & z) | (y & z);
  return x ^ y ^ z;
}

function writeWord(bytes, offset, word) {
  bytes[offset] = word;
  bytes[offset + 1] = word >>> 8;
  bytes[offset + 2] = word >>> 16;
  bytes[offset + 3] = word >>> 24;
}

export class Md4 {
  constructor() {
    this.state = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
    this.buffer = new Uint8Array(BLOCK_BYTES);
    this.words = new Uint32Array(16);
    this.bufferLength = 0;
    this.bytesLow = 0;
    this.bytesHigh = 0;
    this.finished = false;
    this.result = null;
  }

  update(input) {
    if (this.finished) throw new Error('MD4 해시 계산이 이미 완료되었습니다.');
    const bytes = toBytes(input);
    const addedLow = bytes.byteLength >>> 0;
    const addedHigh = Math.floor(bytes.byteLength / 0x100000000) >>> 0;
    const lowSum = this.bytesLow + addedLow;
    this.bytesLow = lowSum >>> 0;
    this.bytesHigh = (this.bytesHigh + addedHigh + (lowSum >= 0x100000000 ? 1 : 0)) >>> 0;

    let offset = 0;
    if (this.bufferLength) {
      const copied = Math.min(BLOCK_BYTES - this.bufferLength, bytes.length);
      this.buffer.set(bytes.subarray(0, copied), this.bufferLength);
      this.bufferLength += copied;
      offset = copied;
      if (this.bufferLength === BLOCK_BYTES) {
        this.transform(this.buffer, 0);
        this.bufferLength = 0;
      }
    }

    while (offset + BLOCK_BYTES <= bytes.length) {
      this.transform(bytes, offset);
      offset += BLOCK_BYTES;
    }
    if (offset < bytes.length) {
      this.buffer.set(bytes.subarray(offset), 0);
      this.bufferLength = bytes.length - offset;
    }
    return this;
  }

  digest() {
    if (this.result) return this.result.slice();
    this.finished = true;

    let length = this.bufferLength;
    this.buffer[length++] = 0x80;
    if (length > 56) {
      this.buffer.fill(0, length);
      this.transform(this.buffer, 0);
      length = 0;
    }
    this.buffer.fill(0, length, 56);
    const bitLow = this.bytesLow << 3;
    const bitHigh = ((this.bytesHigh << 3) | (this.bytesLow >>> 29)) >>> 0;
    writeWord(this.buffer, 56, bitLow);
    writeWord(this.buffer, 60, bitHigh);
    this.transform(this.buffer, 0);

    const result = new Uint8Array(DIGEST_BYTES);
    for (let i = 0; i < this.state.length; i++) writeWord(result, i * 4, this.state[i]);
    this.result = result;
    this.buffer.fill(0);
    this.words.fill(0);
    return result.slice();
  }

  digestHex() {
    return [...this.digest()].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  transform(bytes, offset) {
    const x = this.words;
    for (let i = 0; i < 16; i++) {
      const pos = offset + i * 4;
      x[i] = (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16)
        | (bytes[pos + 3] << 24)) >>> 0;
    }

    let [a, b, c, d] = this.state;
    for (let round = 0; round < 3; round++) {
      const order = ROUND_ORDERS[round];
      const shifts = ROUND_SHIFTS[round];
      for (let i = 0; i < 16; i++) {
        const shift = shifts[i & 3];
        const word = x[order[i]];
        const constant = ROUND_CONSTANTS[round];
        if ((i & 3) === 0) a = roundStep(a, mixRound(round, b, c, d), word, constant, shift);
        else if ((i & 3) === 1) d = roundStep(d, mixRound(round, a, b, c), word, constant, shift);
        else if ((i & 3) === 2) c = roundStep(c, mixRound(round, d, a, b), word, constant, shift);
        else b = roundStep(b, mixRound(round, c, d, a), word, constant, shift);
      }
    }

    this.state[0] = (this.state[0] + a) >>> 0;
    this.state[1] = (this.state[1] + b) >>> 0;
    this.state[2] = (this.state[2] + c) >>> 0;
    this.state[3] = (this.state[3] + d) >>> 0;
  }
}

export function createMd4() {
  return new Md4();
}

export function md4(input) {
  return createMd4().update(input).digest();
}

export function md4Hex(input) {
  return createMd4().update(input).digestHex();
}
