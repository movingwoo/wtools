// xxHash32, used by the LZ4 frame descriptor, blocks and content checksum.
const P1 = 0x9e3779b1, P2 = 0x85ebca77, P3 = 0xc2b2ae3d, P4 = 0x27d4eb2f, P5 = 0x165667b1;
const rotate = (value, bits) => (value << bits) | (value >>> (32 - bits));
const lane = (state, value) => Math.imul(rotate(state + Math.imul(value, P2), 13), P1);

export function xxhash32(bytes, seed = 0) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0, hash;
  if (bytes.length >= 16) {
    let a = seed + P1 + P2, b = seed + P2, c = seed, d = seed - P1;
    while (offset + 16 <= bytes.length) {
      a = lane(a, view.getUint32(offset, true));
      b = lane(b, view.getUint32(offset + 4, true));
      c = lane(c, view.getUint32(offset + 8, true));
      d = lane(d, view.getUint32(offset + 12, true));
      offset += 16;
    }
    hash = rotate(a, 1) + rotate(b, 7) + rotate(c, 12) + rotate(d, 18);
  } else hash = seed + P5;
  hash = (hash + bytes.length) | 0;
  while (offset + 4 <= bytes.length) {
    hash = Math.imul(rotate(hash + Math.imul(view.getUint32(offset, true), P3), 17), P4);
    offset += 4;
  }
  while (offset < bytes.length) hash = Math.imul(rotate(hash + Math.imul(bytes[offset++], P5), 11), P1);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, P2);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, P3);
  return (hash ^ (hash >>> 16)) >>> 0;
}
