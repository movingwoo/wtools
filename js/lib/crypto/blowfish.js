// Schneier's 16-round Blowfish. Constants are independently generated pi digits.
import { PI_WORDS } from './blowfish-constants.js';
import { bytes } from './bytes.js';

export function createBlowfish(key, { legacy = false } = {}) {
  bytes(key);
  // Legacy mode receives word-padded CryptoJS keys (at most 18 words).
  if (!key.length || key.length > (legacy ? 72 : 56)) throw new Error('Blowfish 키 길이가 올바르지 않습니다.');
  const p = PI_WORDS.slice(0, 18), s = PI_WORDS.slice(18);
  let closed = false;
  const f = (x) => ((((s[x >>> 24] + s[256 + ((x >>> 16) & 255)]) | 0) ^ s[512 + ((x >>> 8) & 255)]) + s[768 + (x & 255)]) | 0;
  const pair = (left, right, decrypt = false) => {
    for (let round = 0; round < 16; round++) {
      left ^= p[decrypt ? 17 - round : round];
      right ^= f(left);
      [left, right] = [right, left];
    }
    [left, right] = [right, left];
    right ^= p[decrypt ? 1 : 16]; left ^= p[decrypt ? 0 : 17];
    return [left >>> 0, right >>> 0];
  };
  let offset = 0;
  for (let i = 0; i < 18; i++) {
    let word = 0;
    for (let j = 0; j < 4; j++) { word = (word << 8) | key[offset]; offset = (offset + 1) % key.length; }
    p[i] ^= word;
  }
  let left = 0, right = 0;
  for (const table of [p, s]) for (let i = 0; i < table.length; i += 2) {
    [left, right] = pair(left, right);
    table[i] = left; table[i + 1] = right;
  }
  left = right = 0;
  const crypt = (block, decrypt) => {
    bytes(block);
    if (closed || block.length !== 8) throw new Error('Blowfish 블록 또는 작업 상태가 올바르지 않습니다.');
    const view = new DataView(block.buffer, block.byteOffset, 8);
    const [l, r] = pair(view.getUint32(0), view.getUint32(4), decrypt);
    view.setUint32(0, l); view.setUint32(4, r);
  };
  return { blockSize: 8, encrypt: (block) => crypt(block, false), decrypt: (block) => crypt(block, true), destroy() { closed = true; p.fill(0); s.fill(0); } };
}
