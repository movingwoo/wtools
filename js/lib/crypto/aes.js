// FIPS 197: AES fallback for modes/key sizes absent from WebCrypto.
// Tables follow the standard's S-box and column matrices; JS is not constant-time.
import { bytes } from './bytes.js';

const S = new Uint8Array(256), INVERSE = new Uint8Array(256);
const xtime = (a) => ((a << 1) ^ (a & 128 ? 0x11b : 0)) & 255;
function multiply(a, b) {
  let value = 0;
  for (let i = 0; i < 8; i++) { if (b & 1) value ^= a; a = xtime(a); b >>>= 1; }
  return value;
}
for (let n = 0; n < 256; n++) {
  let inverse = n ? 1 : 0, power = n, exponent = 254;
  while (exponent) { if (exponent & 1) inverse = multiply(inverse, power); power = multiply(power, power); exponent >>>= 1; }
  let s = inverse ^ 0x63;
  for (let shift = 1; shift < 5; shift++) s ^= ((inverse << shift) | (inverse >>> (8 - shift))) & 255;
  S[n] = s; INVERSE[s] = n;
}
const ENCRYPT = Array.from({ length: 4 }, () => new Uint32Array(256));
const DECRYPT = Array.from({ length: 4 }, () => new Uint32Array(256));
for (let n = 0; n < 256; n++) {
  const s = S[n], inverse = INVERSE[n];
  let forward = (xtime(s) << 24) | (s << 16) | (s << 8) | (xtime(s) ^ s);
  let backward = (multiply(inverse, 14) << 24) | (multiply(inverse, 9) << 16)
    | (multiply(inverse, 13) << 8) | multiply(inverse, 11);
  for (let column = 0; column < 4; column++) {
    ENCRYPT[column][n] = forward; DECRYPT[column][n] = backward;
    forward = (forward >>> 8) | (forward << 24);
    backward = (backward >>> 8) | (backward << 24);
  }
}

function inverseMix(word) {
  const a = word >>> 24, b = (word >>> 16) & 255, c = (word >>> 8) & 255, d = word & 255;
  return ((multiply(a, 14) ^ multiply(b, 11) ^ multiply(c, 13) ^ multiply(d, 9)) << 24)
    | ((multiply(a, 9) ^ multiply(b, 14) ^ multiply(c, 11) ^ multiply(d, 13)) << 16)
    | ((multiply(a, 13) ^ multiply(b, 9) ^ multiply(c, 14) ^ multiply(d, 11)) << 8)
    | (multiply(a, 11) ^ multiply(b, 13) ^ multiply(c, 9) ^ multiply(d, 14));
}

export function createAes(key) {
  bytes(key);
  if (![16, 24, 32].includes(key.length)) throw new Error('AES 키는 16, 24, 32바이트여야 합니다.');
  const rounds = key.length / 4 + 6;
  const schedule = new Uint8Array((rounds + 1) * 16);
  schedule.set(key);
  const word = new Uint8Array(4);
  let rcon = 1, closed = false;
  for (let offset = key.length; offset < schedule.length; offset += 4) {
    word.set(schedule.subarray(offset - 4, offset));
    if (offset % key.length === 0) {
      const first = word[0];
      word[0] = S[word[1]] ^ rcon; word[1] = S[word[2]]; word[2] = S[word[3]]; word[3] = S[first];
      rcon = xtime(rcon);
    } else if (key.length === 32 && offset % 32 === 16) {
      for (let j = 0; j < 4; j++) word[j] = S[word[j]];
    }
    for (let j = 0; j < 4; j++) schedule[offset + j] = schedule[offset + j - key.length] ^ word[j];
  }
  word.fill(0);
  const keys = new Uint32Array(schedule.length / 4), inverseKeys = new Uint32Array(keys.length);
  const view = new DataView(schedule.buffer);
  for (let i = 0; i < keys.length; i++) keys[i] = view.getUint32(i * 4);
  for (let round = 0; round <= rounds; round++) for (let column = 0; column < 4; column++) {
    // Reverse column order matches the inverse row shift in the shared round loop.
    const value = keys[(rounds - round) * 4 + ((4 - column) % 4)];
    inverseKeys[round * 4 + column] = round && round !== rounds ? inverseMix(value) : value;
  }
  schedule.fill(0);
  const run = (block, inverse) => {
    bytes(block);
    if (closed || block.length !== 16) throw new Error('AES 블록 또는 작업 상태가 올바르지 않습니다.');
    const data = new DataView(block.buffer, block.byteOffset, 16);
    const roundKeys = inverse ? inverseKeys : keys, box = inverse ? INVERSE : S;
    const [t0, t1, t2, t3] = inverse ? DECRYPT : ENCRYPT;
    const second = inverse ? 12 : 4, fourth = inverse ? 4 : 12;
    let a = data.getUint32(0) ^ roundKeys[0], b = data.getUint32(second) ^ roundKeys[1];
    let c = data.getUint32(8) ^ roundKeys[2], d = data.getUint32(fourth) ^ roundKeys[3];
    let offset = 4;
    for (let round = 1; round < rounds; round++, offset += 4) {
      const nextA = t0[a >>> 24] ^ t1[(b >>> 16) & 255] ^ t2[(c >>> 8) & 255] ^ t3[d & 255] ^ roundKeys[offset];
      const nextB = t0[b >>> 24] ^ t1[(c >>> 16) & 255] ^ t2[(d >>> 8) & 255] ^ t3[a & 255] ^ roundKeys[offset + 1];
      const nextC = t0[c >>> 24] ^ t1[(d >>> 16) & 255] ^ t2[(a >>> 8) & 255] ^ t3[b & 255] ^ roundKeys[offset + 2];
      d = t0[d >>> 24] ^ t1[(a >>> 16) & 255] ^ t2[(b >>> 8) & 255] ^ t3[c & 255] ^ roundKeys[offset + 3];
      a = nextA; b = nextB; c = nextC;
    }
    data.setUint32(0, ((box[a >>> 24] << 24) | (box[(b >>> 16) & 255] << 16) | (box[(c >>> 8) & 255] << 8) | box[d & 255]) ^ roundKeys[offset]);
    data.setUint32(second, ((box[b >>> 24] << 24) | (box[(c >>> 16) & 255] << 16) | (box[(d >>> 8) & 255] << 8) | box[a & 255]) ^ roundKeys[offset + 1]);
    data.setUint32(8, ((box[c >>> 24] << 24) | (box[(d >>> 16) & 255] << 16) | (box[(a >>> 8) & 255] << 8) | box[b & 255]) ^ roundKeys[offset + 2]);
    data.setUint32(fourth, ((box[d >>> 24] << 24) | (box[(a >>> 16) & 255] << 16) | (box[(b >>> 8) & 255] << 8) | box[c & 255]) ^ roundKeys[offset + 3]);
  };
  return {
    blockSize: 16,
    encrypt(block) { run(block, false); },
    decrypt(block) { run(block, true); },
    destroy() { closed = true; keys.fill(0); inverseKeys.fill(0); },
  };
}
