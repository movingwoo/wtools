// RFC 1319. Streaming form of the existing W-Tools MD2 implementation.
import { bytes } from './bytes.js';

const MD2_S = [
  41, 46, 67, 201, 162, 216, 124, 1, 61, 54, 84, 161, 236, 240, 6, 19, 98, 167, 5, 243, 192, 199, 115, 140,
  152, 147, 43, 217, 188, 76, 130, 202, 30, 155, 87, 60, 253, 212, 224, 22, 103, 66, 111, 24, 138, 23, 229, 18,
  190, 78, 196, 214, 218, 158, 222, 73, 160, 251, 245, 142, 187, 47, 238, 122, 169, 104, 121, 145, 21, 178, 7, 63,
  148, 194, 16, 137, 11, 34, 95, 33, 128, 127, 93, 154, 90, 144, 50, 39, 53, 62, 204, 231, 191, 247, 151, 3,
  255, 25, 48, 179, 72, 165, 181, 209, 215, 94, 146, 42, 172, 86, 170, 198, 79, 184, 56, 210, 150, 164, 125, 182,
  118, 252, 107, 226, 156, 116, 4, 241, 69, 157, 112, 89, 100, 113, 135, 32, 134, 91, 207, 101, 230, 45, 168, 2,
  27, 96, 37, 173, 174, 176, 185, 246, 28, 70, 97, 105, 52, 64, 126, 15, 85, 71, 163, 35, 221, 81, 175, 58,
  195, 92, 249, 206, 186, 197, 234, 38, 44, 83, 13, 110, 133, 40, 132, 9, 211, 223, 205, 244, 65, 129, 77, 82,
  106, 220, 55, 200, 108, 193, 171, 250, 36, 225, 123, 8, 12, 189, 177, 74, 120, 136, 149, 139, 227, 99, 232, 109,
  233, 203, 213, 254, 59, 0, 29, 57, 242, 239, 183, 14, 102, 88, 208, 228, 166, 119, 114, 248, 235, 117, 75, 10,
  49, 68, 80, 180, 143, 237, 31, 26, 219, 153, 141, 51, 159, 17, 131, 20,
];

export function createMd2() {
  const state = new Uint8Array(48), checksum = new Uint8Array(16), block = new Uint8Array(16);
  let used = 0, closed = false, result = null;
  const transform = (input, withChecksum = true) => {
    if (withChecksum) {
      let last = checksum[15];
      for (let i = 0; i < 16; i++) last = checksum[i] ^= MD2_S[input[i] ^ last];
    }
    for (let i = 0; i < 16; i++) { state[i + 16] = input[i]; state[i + 32] = state[i] ^ input[i]; }
    let t = 0;
    for (let round = 0; round < 18; round++) {
      for (let i = 0; i < 48; i++) t = state[i] ^= MD2_S[t];
      t = (t + round) & 255;
    }
  };
  const api = {
    update(input) {
      bytes(input);
      if (closed) throw new Error('해시 계산이 이미 완료되었습니다.');
      for (const value of input) {
        block[used++] = value;
        if (used === 16) { transform(block); used = 0; }
      }
      return api;
    },
    digest() {
      if (result) return result.slice();
      if (closed) throw new Error('해시 작업이 종료되었습니다.');
      block.fill(16 - used, used);
      transform(block); transform(checksum, false);
      result = state.slice(0, 16);
      api.destroy();
      return result.slice();
    },
    destroy() { closed = true; state.fill(0); checksum.fill(0); block.fill(0); },
  };
  return api;
}
