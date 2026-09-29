// RFC 8878 sections 3.1.1.3 and 4. Tables are format constants, not implementation code.
export const LL_BITS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
export const ML_BITS = [...Array(32).fill(0), 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
function baselines(bits, start) {
  return bits.map((width) => { const value = start; start += 2 ** width; return value; });
}
export const LL_BASE = baselines(LL_BITS, 0), ML_BASE = baselines(ML_BITS, 3);
export const fail = (message) => { throw new Error(`Zstandard: ${message}`); };

export function fseTable(probabilities, log) {
  const size = 2 ** log;
  if (probabilities.reduce((sum, n) => sum + Math.abs(n), 0) !== size) fail('FSE 확률 합이 올바르지 않습니다.');
  const symbols = new Uint8Array(size), bits = new Uint8Array(size), base = new Uint16Array(size);
  const next = new Uint16Array(probabilities.length);
  let last = size - 1;
  for (let symbol = 0; symbol < probabilities.length; symbol++) {
    const count = probabilities[symbol];
    if (count === -1) { symbols[last--] = symbol; next[symbol] = 1; }
    else next[symbol] = count;
  }
  const step = (size >>> 1) + (size >>> 3) + 3;
  let position = 0;
  for (let symbol = 0; symbol < probabilities.length; symbol++) {
    for (let n = 0; n < probabilities[symbol]; n++) {
      symbols[position] = symbol;
      do { position = (position + step) & (size - 1); } while (position > last);
    }
  }
  if (position !== 0) fail('FSE 테이블 분포가 올바르지 않습니다.');
  for (let state = 0; state < size; state++) {
    const value = next[symbols[state]]++;
    bits[state] = log - Math.floor(Math.log2(value));
    base[state] = (value << bits[state]) - size;
  }
  return { symbols, bits, base, log };
}

export const DEFAULT_LL = fseTable([4, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 1, 1, 1, 1, 1, -1, -1, -1, -1], 6);
export const DEFAULT_ML = fseTable([1, 4, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1], 6);
export const DEFAULT_OF = fseTable([1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1], 5);

export function readFse(bytes, offset, end, maxLog, maxSymbol) {
  let bit = offset * 8;
  const read = (width) => {
    if (bit + width > end * 8) fail('FSE 확률 데이터가 잘렸습니다.');
    let value = 0, shift = 0;
    while (width) {
      const take = Math.min(width, 8 - (bit & 7));
      value += ((bytes[bit >>> 3] >>> (bit & 7)) & ((1 << take) - 1)) * 2 ** shift;
      bit += take; shift += take; width -= take;
    }
    return value;
  };
  const log = read(4) + 5;
  if (log > maxLog) fail('FSE 정확도가 허용 범위를 넘습니다.');
  const probabilities = [];
  let remaining = 2 ** log;
  while (remaining > 0) {
    if (probabilities.length > maxSymbol) fail('FSE 기호 수가 허용 범위를 넘습니다.');
    const width = Math.floor(Math.log2(remaining + 1)) + 1;
    const threshold = 2 ** width - 1 - (remaining + 1);
    let value = read(width - 1);
    if (value >= threshold) {
      value += read(1) * 2 ** (width - 1);
      if (value >= 2 ** (width - 1)) value -= threshold;
    }
    const probability = value - 1;
    probabilities.push(probability); remaining -= Math.abs(probability);
    if (remaining < 0) fail('FSE 확률 합이 한도를 넘습니다.');
    if (probability === 0) {
      let repeat;
      do {
        repeat = read(2);
        if (probabilities.length + repeat > maxSymbol + 1) fail('FSE 0 반복이 한도를 넘습니다.');
        for (let i = 0; i < repeat; i++) probabilities.push(0);
      } while (repeat === 3);
    }
  }
  if (probabilities.filter((n) => n !== 0).length < 2) fail('FSE에는 두 개 이상의 기호가 필요합니다.');
  return { table: fseTable(probabilities, log), offset: Math.ceil(bit / 8) };
}

export class ReverseBits {
  constructor(bytes, start, end) {
    if (end <= start || !bytes[end - 1]) fail('엔트로피 스트림 종료 비트가 없습니다.');
    this.bytes = bytes; this.start = start * 8;
    this.position = (end - 1) * 8 + Math.floor(Math.log2(bytes[end - 1]));
  }
  get remaining() { return this.position - this.start; }
  peek(width) {
    if (!width) return 0;
    if (width > this.remaining) return this.peek(this.remaining) << (width - this.remaining);
    const position = this.position - width, offset = position >>> 3, shift = position & 7, bytes = this.bytes;
    const word = (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
    let value = word >>> shift;
    if (width + shift > 32) value |= bytes[offset + 4] << (32 - shift);
    return value & (-1 >>> (32 - width));
  }
  read(width) {
    if (width > this.remaining) fail('엔트로피 스트림이 잘렸습니다.');
    const value = this.peek(width); this.position -= width; return value;
  }
  done() { if (this.remaining !== 0) fail('엔트로피 스트림에 사용하지 않은 비트가 있습니다.'); }
}
