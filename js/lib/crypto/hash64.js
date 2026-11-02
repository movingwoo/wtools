// FIPS 180-4 SHA-384/512. 64-bit words are high/low Uint32 pairs.
// Constants are fractional cube roots (K) and square roots (IV) of primes.
import { BlockHash } from './hash-base.js';
const K = new Uint32Array([
  0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc,
  0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
  0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
  0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1, 0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
  0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3, 0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
  0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
  0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4,
  0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725, 0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
  0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
  0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
  0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30,
  0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
  0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53, 0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8,
  0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb, 0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
  0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
  0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
  0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178,
  0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
  0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c,
  0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817,
]);
const IV512 = [
  0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1,
  0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179,
];
const IV384 = [
  0xcbbb9d5d, 0xc1059ed8, 0x629a292a, 0x367cd507, 0x9159015a, 0x3070dd17, 0x152fecd8, 0xf70e5939,
  0x67332667, 0xffc00b31, 0x8eb44a87, 0x68581511, 0xdb0c2e0d, 0x64f98fa7, 0x47b5481d, 0xbefa4fa4,
];
const rotateHigh = (h, l, n) => n < 32 ? (h >>> n) | (l << (32 - n)) : (l >>> (n - 32)) | (h << (64 - n));
const rotateLow = (h, l, n) => rotateHigh(l, h, n);

export function createSha512(bits = 512) {
  if (bits !== 384 && bits !== 512) throw new Error('지원하지 않는 SHA-2 길이입니다.');
  const hash = new BlockHash(bits === 384 ? IV384 : IV512, 128, bits / 8, false, function (input, offset) {
    const w = this.words, state = this.state;
    const view = new DataView(input.buffer, input.byteOffset + offset, 128);
    for (let i = 0; i < 32; i++) w[i] = view.getUint32(i * 4);
    for (let i = 32; i < 160; i += 2) {
      const ah = w[i - 30], al = w[i - 29], bh = w[i - 4], bl = w[i - 3];
      const s0h = (rotateHigh(ah, al, 1) ^ rotateHigh(ah, al, 8) ^ (ah >>> 7)) >>> 0;
      const s0l = (rotateLow(ah, al, 1) ^ rotateLow(ah, al, 8) ^ ((al >>> 7) | (ah << 25))) >>> 0;
      const s1h = (rotateHigh(bh, bl, 19) ^ rotateHigh(bh, bl, 61) ^ (bh >>> 6)) >>> 0;
      const s1l = (rotateLow(bh, bl, 19) ^ rotateLow(bh, bl, 61) ^ ((bl >>> 6) | (bh << 26))) >>> 0;
      const low = w[i - 31] + s0l + w[i - 13] + s1l;
      w[i + 1] = low;
      w[i] = w[i - 32] + s0h + w[i - 14] + s1h + Math.floor(low / 0x100000000);
    }
    let [ah, al, bh, bl, ch, cl, dh, dl, eh, el, fh, fl, gh, gl, hh, hl] = state;
    for (let i = 0; i < 160; i += 2) {
      const s1h = (rotateHigh(eh, el, 14) ^ rotateHigh(eh, el, 18) ^ rotateHigh(eh, el, 41)) >>> 0;
      const s1l = (rotateLow(eh, el, 14) ^ rotateLow(eh, el, 18) ^ rotateLow(eh, el, 41)) >>> 0;
      const chooseH = ((eh & fh) ^ (~eh & gh)) >>> 0;
      const chooseL = ((el & fl) ^ (~el & gl)) >>> 0;
      const low1 = hl + s1l + chooseL + K[i + 1] + w[i + 1];
      const t1l = low1 >>> 0;
      const t1h = (hh + s1h + chooseH + K[i] + w[i] + Math.floor(low1 / 0x100000000)) >>> 0;
      const s0h = (rotateHigh(ah, al, 28) ^ rotateHigh(ah, al, 34) ^ rotateHigh(ah, al, 39)) >>> 0;
      const s0l = (rotateLow(ah, al, 28) ^ rotateLow(ah, al, 34) ^ rotateLow(ah, al, 39)) >>> 0;
      const low2 = s0l + (((al & bl) ^ (al & cl) ^ (bl & cl)) >>> 0);
      const t2l = low2 >>> 0;
      const t2h = (s0h + (((ah & bh) ^ (ah & ch) ^ (bh & ch)) >>> 0) + Math.floor(low2 / 0x100000000)) >>> 0;
      hh = gh; hl = gl; gh = fh; gl = fl; fh = eh; fl = el;
      eh = (dh + t1h + Math.floor((dl + t1l) / 0x100000000)) >>> 0; el = (dl + t1l) >>> 0;
      dh = ch; dl = cl; ch = bh; cl = bl; bh = ah; bl = al;
      ah = (t1h + t2h + Math.floor((t1l + t2l) / 0x100000000)) >>> 0; al = (t1l + t2l) >>> 0;
    }
    const result = [ah, al, bh, bl, ch, cl, dh, dl, eh, el, fh, fl, gh, gl, hh, hl];
    for (let i = 0; i < 16; i += 2) {
      const low = state[i + 1] + result[i + 1];
      state[i] += result[i] + Math.floor(low / 0x100000000);
      state[i + 1] = low;
    }
  });
  hash.words = new Uint32Array(160);
  return hash;
}
