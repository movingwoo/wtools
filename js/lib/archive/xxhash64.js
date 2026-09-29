// xxHash64, seed zero, for RFC 8878 content checksums. 64-bit words use low/high pairs.
const P1L = 0x85ebca87, P1H = 0x9e3779b1, P2L = 0x27d4eb4f, P2H = 0xc2b2ae3d;
const P3L = 0x9e3779f9, P3H = 0x165667b1, P4L = 0xc2b2ae63, P4H = 0x85ebca77;
const P5L = 0x165667c5, P5H = 0x27d4eb2f;

// A 16-by-32-bit product fits exactly in Number, including the upper-word carry.
const upperProduct = (a, b) => Math.floor(((a >>> 16) * b + Math.floor((a & 65535) * b / 65536)) / 65536);

function accumulate(states, index, low, high) {
  const product = Math.imul(low, P2L) >>> 0, sum = (product + states[index]) >>> 0;
  const sumHigh = (upperProduct(low, P2L) + Math.imul(high, P2L) + Math.imul(low, P2H)
    + states[index + 1] + (sum < product ? 1 : 0)) >>> 0;
  const rotatedLow = ((sum << 31) | (sumHigh >>> 1)) >>> 0;
  const rotatedHigh = ((sumHigh << 31) | (sum >>> 1)) >>> 0;
  states[index] = Math.imul(rotatedLow, P1L) >>> 0;
  states[index + 1] = (upperProduct(rotatedLow, P1L)
    + Math.imul(rotatedHigh, P1L) + Math.imul(rotatedLow, P1H)) >>> 0;
}

export function xxhash64(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0, low = 0, high = 0;
  const add = (a, b) => {
    const next = (low + a) >>> 0;
    high = (high + b + (next < low ? 1 : 0)) >>> 0; low = next;
  };
  const multiply = (a, b) => {
    const next = Math.imul(low, a) >>> 0;
    high = (upperProduct(low, a) + Math.imul(high, a) + Math.imul(low, b)) >>> 0; low = next;
  };
  const rotate = (bits) => {
    const previous = low;
    low = ((low << bits) | (high >>> (32 - bits))) >>> 0;
    high = ((high << bits) | (previous >>> (32 - bits))) >>> 0;
  };
  const mix = () => { multiply(P2L, P2H); rotate(31); multiply(P1L, P1H); };
  if (bytes.length >= 32) {
    const states = new Uint32Array(8);
    low = P1L; high = P1H; add(P2L, P2H);
    states[0] = low; states[1] = high; states[2] = P2L; states[3] = P2H;
    states[6] = (-P1L) >>> 0; states[7] = (~P1H) >>> 0;
    while (offset + 32 <= bytes.length) {
      for (let i = 0; i < 8; i += 2) {
        accumulate(states, i, view.getUint32(offset, true), view.getUint32(offset + 4, true)); offset += 8;
      }
    }
    let sumLow = 0, sumHigh = 0;
    const rotations = [1, 7, 12, 18];
    for (let i = 0; i < 8; i += 2) {
      low = states[i]; high = states[i + 1]; rotate(rotations[i >>> 1]); add(sumLow, sumHigh);
      sumLow = low; sumHigh = high;
    }
    for (let i = 0; i < 8; i += 2) {
      const previousLow = low, previousHigh = high;
      low = states[i]; high = states[i + 1]; mix();
      low = (low ^ previousLow) >>> 0; high = (high ^ previousHigh) >>> 0;
      multiply(P1L, P1H); add(P4L, P4H);
    }
  } else { low = P5L; high = P5H; }
  add(bytes.length >>> 0, Math.floor(bytes.length / 4294967296));
  while (offset + 8 <= bytes.length) {
    const previousLow = low, previousHigh = high;
    low = view.getUint32(offset, true); high = view.getUint32(offset + 4, true); mix();
    low = (low ^ previousLow) >>> 0; high = (high ^ previousHigh) >>> 0;
    rotate(27); multiply(P1L, P1H); add(P4L, P4H); offset += 8;
  }
  if (offset + 4 <= bytes.length) {
    const previousLow = low, previousHigh = high;
    low = view.getUint32(offset, true); high = 0; multiply(P1L, P1H);
    low = (low ^ previousLow) >>> 0; high = (high ^ previousHigh) >>> 0;
    rotate(23); multiply(P2L, P2H); add(P3L, P3H); offset += 4;
  }
  while (offset < bytes.length) {
    const previousLow = low, previousHigh = high;
    low = bytes[offset++]; high = 0; multiply(P5L, P5H);
    low = (low ^ previousLow) >>> 0; high = (high ^ previousHigh) >>> 0;
    rotate(11); multiply(P1L, P1H);
  }
  low = (low ^ (high >>> 1)) >>> 0;
  multiply(P2L, P2H);
  low = (low ^ (low >>> 29) ^ (high << 3)) >>> 0; high = (high ^ (high >>> 29)) >>> 0;
  multiply(P3L, P3H);
  low = (low ^ high) >>> 0;
  return (BigInt(high) << 32n) | BigInt(low);
}
