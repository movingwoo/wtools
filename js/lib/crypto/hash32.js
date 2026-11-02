// RFC 1321 (MD5), FIPS 180 (SHA-0/1/224/256), RIPEMD-160 specification.
import { BlockHash } from './hash-base.js';

const IV = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
const left = (x, n) => (x << n) | (x >>> (32 - n));
const right = (x, n) => (x >>> n) | (x << (32 - n));
const MD5_K = Uint32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000));
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const SHA_IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const SHA224_IV = [0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4];
const R = [
  0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15, 7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,
  3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12, 1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,
  4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13,
];
const RR = [
  5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12, 6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,
  15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13, 8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,
  12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11,
];
const S = [
  11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8, 7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,
  11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5, 11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,
  9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6,
];
const SS = [
  8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6, 9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,
  9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5, 15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,
  8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11,
];
const RK = [0, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
const RKK = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0];
function ripemdMix(round, b, c, d) {
  if (round === 0) return b ^ c ^ d;
  if (round === 1) return (b & c) | (~b & d);
  if (round === 2) return (b | ~c) ^ d;
  if (round === 3) return (b & d) | (c & ~d);
  return b ^ (c | ~d);
}

export function createHash32(name) {
  const md5 = name === 'MD5', ripemd = name === 'RIPEMD160';
  const sha1 = name === 'SHA1' || name === 'SHA0';
  if (!md5 && !ripemd && !sha1 && name !== 'SHA224' && name !== 'SHA256')
    throw new Error('지원하지 않는 해시 알고리즘입니다.');
  const state = md5 ? IV.slice(0, 4) : sha1 || ripemd ? IV : name === 'SHA224' ? SHA224_IV : SHA_IV;
  const size = md5 ? 16 : sha1 || ripemd ? 20 : name === 'SHA224' ? 28 : 32;
  const hash = new BlockHash(state, 64, size, md5 || ripemd, function (input, offset) {
    const w = this.words, h = this.state;
    const view = new DataView(input.buffer, input.byteOffset + offset, 64);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(i * 4, this.littleEndian);
    if (md5) {
      let [a, b, c, d] = h;
      for (let i = 0; i < 64; i++) {
        const r = i >>> 4;
        const f = r === 0 ? (b & c) | (~b & d) : r === 1 ? (d & b) | (~d & c) : r === 2 ? b ^ c ^ d : c ^ (b | ~d);
        const g = r === 0 ? i : r === 1 ? (5 * i + 1) % 16 : r === 2 ? (3 * i + 5) % 16 : 7 * i % 16;
        const next = (b + left((a + f + MD5_K[i] + w[g]) | 0, MD5_S[r * 4 + i % 4])) | 0;
        a = d; d = c; c = b; b = next;
      }
      [a, b, c, d].forEach((v, i) => { h[i] += v; });
    } else if (sha1) {
      for (let i = 16; i < 80; i++) {
        const v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
        w[i] = name === 'SHA0' ? v : left(v, 1);
      }
      let [a, b, c, d, e] = h;
      for (let i = 0; i < 80; i++) {
        const f = i < 20 ? (b & c) | (~b & d) : i < 40 || i >= 60 ? b ^ c ^ d : (b & c) | (b & d) | (c & d);
        const k = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6][Math.floor(i / 20)];
        const t = (left(a, 5) + f + e + k + w[i]) | 0;
        e = d; d = c; c = left(b, 30); b = a; a = t;
      }
      [a, b, c, d, e].forEach((v, i) => { h[i] += v; });
    } else if (ripemd) {
      let [a, b, c, d, e] = h, [aa, bb, cc, dd, ee] = h;
      for (let i = 0; i < 80; i++) {
        const r = i >>> 4;
        const t = (left((a + ripemdMix(r, b, c, d) + w[R[i]] + RK[r]) | 0, S[i]) + e) | 0;
        a = e; e = d; d = left(c, 10); c = b; b = t;
        const tt = (left((aa + ripemdMix(4 - r, bb, cc, dd) + w[RR[i]] + RKK[r]) | 0, SS[i]) + ee) | 0;
        aa = ee; ee = dd; dd = left(cc, 10); cc = bb; bb = tt;
      }
      const t = (h[1] + c + dd) | 0;
      h[1] = h[2] + d + ee; h[2] = h[3] + e + aa; h[3] = h[4] + a + bb; h[4] = h[0] + b + cc; h[0] = t;
    } else {
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        w[i] = w[i - 16] + (right(a, 7) ^ right(a, 18) ^ (a >>> 3)) + w[i - 7] + (right(b, 17) ^ right(b, 19) ^ (b >>> 10));
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (right(e, 6) ^ right(e, 11) ^ right(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) | 0;
        const t2 = ((right(a, 2) ^ right(a, 13) ^ right(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] += v; });
    }
  });
  hash.words = new Uint32Array(80);
  return hash;
}
