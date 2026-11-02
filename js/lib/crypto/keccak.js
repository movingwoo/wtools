// FIPS 202 Keccak-f[1600]. SHA-3 domain 0x06; legacy Keccak domain 0x01.
import { bytes } from './bytes.js';

const RC = new Uint32Array(48);
let lfsr = 1;
for (let round = 0; round < 24; round++) for (let j = 0; j < 7; j++) {
  const bit = (1 << j) - 1;
  if (lfsr & 1) RC[round * 2 + (bit >>> 5)] ^= 1 << (bit & 31);
  lfsr = (lfsr << 1) ^ (lfsr & 0x80 ? 0x171 : 0);
}
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];

export function createKeccak(bits = 256, domain = 6) {
  if (![224, 256, 384, 512].includes(bits) || ![1, 6].includes(domain)) throw new Error('지원하지 않는 SHA-3 설정입니다.');
  const rate = (1600 - bits * 2) / 8;
  const state = new Uint32Array(50), scratch = new Uint32Array(50), parity = new Uint32Array(10);
  const block = new Uint8Array(rate);
  let used = 0, closed = false, result = null;
  const transform = (input, offset) => {
    const view = new DataView(input.buffer, input.byteOffset + offset, rate);
    for (let i = 0; i < rate / 4; i++) state[i] ^= view.getUint32(i * 4, true);
    for (let round = 0; round < 24; round++) {
      for (let x = 0; x < 10; x++) parity[x] = state[x] ^ state[x + 10] ^ state[x + 20] ^ state[x + 30] ^ state[x + 40];
      for (let x = 0; x < 5; x++) {
        const before = (x + 4) % 5 * 2, after = (x + 1) % 5 * 2;
        const lo = parity[before] ^ ((parity[after] << 1) | (parity[after + 1] >>> 31));
        const hi = parity[before + 1] ^ ((parity[after + 1] << 1) | (parity[after] >>> 31));
        for (let y = 0; y < 50; y += 10) { state[y + x * 2] ^= lo; state[y + x * 2 + 1] ^= hi; }
      }
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        const lane = x + y * 5, rotation = ROT[lane], target = (y + 5 * ((2 * x + 3 * y) % 5)) * 2;
        let lo = state[lane * 2], hi = state[lane * 2 + 1];
        if (rotation >= 32) [lo, hi] = [hi, lo];
        const n = rotation % 32;
        scratch[target] = n ? (lo << n) | (hi >>> (32 - n)) : lo;
        scratch[target + 1] = n ? (hi << n) | (lo >>> (32 - n)) : hi;
      }
      for (let y = 0; y < 50; y += 10) for (let x = 0; x < 10; x++) {
        state[y + x] = scratch[y + x] ^ (~scratch[y + (x + 2) % 10] & scratch[y + (x + 4) % 10]);
      }
      state[0] ^= RC[round * 2]; state[1] ^= RC[round * 2 + 1];
    }
  };
  const api = {
    update(input) {
      bytes(input);
      if (closed) throw new Error('해시 계산이 이미 완료되었습니다.');
      let offset = 0;
      while (offset < input.length) {
        if (!used && offset + rate <= input.length) { transform(input, offset); offset += rate; continue; }
        const n = Math.min(rate - used, input.length - offset);
        block.set(input.subarray(offset, offset + n), used);
        used += n; offset += n;
        if (used === rate) { transform(block, 0); used = 0; }
      }
      return api;
    },
    digest() {
      if (result) return result.slice();
      if (closed) throw new Error('해시 작업이 종료되었습니다.');
      block.fill(0, used); block[used] = domain; block[rate - 1] |= 0x80;
      transform(block, 0);
      result = new Uint8Array(bits / 8);
      for (let i = 0; i < result.length; i++) result[i] = state[i >>> 2] >>> ((i & 3) * 8);
      api.destroy();
      return result.slice();
    },
    destroy() { closed = true; block.fill(0); state.fill(0); scratch.fill(0); parity.fill(0); },
  };
  return api;
}
