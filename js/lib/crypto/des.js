// FIPS 46-3 permutations and S-boxes. Legacy interoperability only.
import { bytes } from './bytes.js';
const IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const FP = new Array(64);
IP.forEach((value, i) => { FP[value - 1] = i + 1; });
const PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
const P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const BOXES = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11],
];
const SP = BOXES.map((box, index) => Uint32Array.from({ length: 64 }, (_, value) => {
  const row = ((value & 32) >>> 4) | (value & 1), column = (value >>> 1) & 15;
  const substituted = box[row * 16 + column] << (28 - index * 4);
  let out = 0;
  for (let i = 0; i < 32; i++) out |= ((substituted >>> (32 - P[i])) & 1) << (31 - i);
  return out;
}));
function permutationTables(permutation) {
  const tables = Array.from({ length: 8 }, () => new Uint32Array(512));
  for (let byte = 0; byte < 8; byte++) for (let value = 0; value < 256; value++) {
    for (let bit = 0; bit < 64; bit++) {
      const source = permutation[bit] - 1;
      if ((source >>> 3) === byte && ((value >>> (7 - source % 8)) & 1)) tables[byte][value * 2 + (bit >>> 5)] |= 1 << (31 - bit % 32);
    }
  }
  return tables;
}
const INITIAL = permutationTables(IP), FINAL = permutationTables(FP);

export function createDes(key) {
  bytes(key);
  if (key.length !== 8) throw new Error('DES 키는 8바이트여야 합니다.');
  const keys = new Uint8Array(128);
  let c = 0, d = 0, closed = false;
  for (let i = 0; i < 56; i++) {
    const bit = PC1[i] - 1, value = (key[bit >>> 3] >>> (7 - bit % 8)) & 1;
    if (i < 28) c = (c << 1) | value; else d = (d << 1) | value;
  }
  for (let round = 0; round < 16; round++) {
    const shift = SHIFTS[round];
    c = ((c << shift) | (c >>> (28 - shift))) & 0xfffffff;
    d = ((d << shift) | (d >>> (28 - shift))) & 0xfffffff;
    for (let i = 0; i < 48; i++) {
      const bit = PC2[i] - 1;
      keys[round * 8 + Math.floor(i / 6)] |= (((bit < 28 ? c : d) >>> (27 - bit % 28)) & 1) << (5 - i % 6);
    }
  }
  c = d = 0;
  function crypt(block, decrypt) {
    bytes(block);
    if (closed || block.length !== 8) throw new Error('DES 블록 또는 작업 상태가 올바르지 않습니다.');
    let l = 0, r = 0;
    for (let i = 0; i < 8; i++) { l ^= INITIAL[i][block[i] * 2]; r ^= INITIAL[i][block[i] * 2 + 1]; }
    for (let round = 0; round < 16; round++) {
      const k = (decrypt ? 15 - round : round) * 8;
      const f = SP[0][(((r & 1) << 5) | (r >>> 27)) ^ keys[k]]
        ^ SP[1][((r >>> 23) & 63) ^ keys[k + 1]] ^ SP[2][((r >>> 19) & 63) ^ keys[k + 2]]
        ^ SP[3][((r >>> 15) & 63) ^ keys[k + 3]] ^ SP[4][((r >>> 11) & 63) ^ keys[k + 4]]
        ^ SP[5][((r >>> 7) & 63) ^ keys[k + 5]] ^ SP[6][((r >>> 3) & 63) ^ keys[k + 6]]
        ^ SP[7][(((r & 31) << 1) | (r >>> 31)) ^ keys[k + 7]];
      const next = l ^ f; l = r; r = next;
    }
    let high = 0, low = 0;
    for (let i = 0; i < 8; i++) {
      const value = ((i < 4 ? r : l) >>> (24 - (i % 4) * 8)) & 255;
      high ^= FINAL[i][value * 2]; low ^= FINAL[i][value * 2 + 1];
    }
    const view = new DataView(block.buffer, block.byteOffset, 8);
    view.setUint32(0, high); view.setUint32(4, low);
  }
  return { blockSize: 8, encrypt: (block) => crypt(block, false), decrypt: (block) => crypt(block, true), destroy() { closed = true; keys.fill(0); } };
}

export function createTripleDes(key) {
  bytes(key);
  if (![8, 16, 24].includes(key.length)) throw new Error('3DES 키는 8, 16, 24바이트여야 합니다.');
  const a = createDes(key.subarray(0, 8));
  const b = createDes(key.subarray(key.length === 8 ? 0 : 8, key.length === 8 ? 8 : 16));
  const c = createDes(key.subarray(key.length === 24 ? 16 : 0, key.length === 24 ? 24 : 8));
  return {
    blockSize: 8,
    encrypt(block) { a.encrypt(block); b.decrypt(block); c.encrypt(block); },
    decrypt(block) { c.decrypt(block); b.encrypt(block); a.decrypt(block); },
    destroy() { a.destroy(); b.destroy(); c.destroy(); },
  };
}
