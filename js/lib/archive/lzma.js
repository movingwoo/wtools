// First-party LZMA1 / .lzma (Alone) codec. Format and probability/state rules:
// Igor Pavlov, LZMA Specification draft, 2015-06-14, https://7-zip.org/sdk.html
// Container clarification: https://github.com/tukaani-project/xz/blob/master/doc/lzma-file-format.txt
// The encoder uses bounded greedy hash-chain search, not the SDK's optimal parser.
// Call in a Worker: cancellation terminates it and releases its private buffers.

const TOP = 0x1000000;
const MAX_INPUT = 256 * 1024 * 1024;
const MAX_OUTPUT = 128 * 1024 * 1024;
const MAX_MATCH = 273;
const DICTIONARIES = [0, 1 << 16, 1 << 18, 1 << 19, 1 << 20, 1 << 21,
  1 << 22, 1 << 23, 1 << 24, 1 << 25];
const SEARCH_DEPTHS = [0, 8, 12, 16, 24, 32, 48, 64, 96, 128];

function inputBytes(input) {
  if (!(input instanceof Uint8Array)) throw new TypeError('LZMA 입력은 바이트 배열이어야 합니다.');
  if (input.length > MAX_INPUT) throw new Error('LZMA 입력은 256 MiB 이하여야 합니다.');
  return input;
}

function probabilities(size) { return new Uint16Array(size).fill(1024); }

function models(lc, lp) {
  return {
    literal: probabilities(768 * 2 ** (lc + lp)),
    match: probabilities(12 * 16), rep: probabilities(12),
    rep0: probabilities(12), rep1: probabilities(12), rep2: probabilities(12),
    short: probabilities(12 * 16),
    length: probabilities(2 + 16 * 16 + 256),
    repLength: probabilities(2 + 16 * 16 + 256),
    slot: probabilities(4 * 64), distance: probabilities(115), align: probabilities(16),
  };
}

class RangeReader {
  constructor(input) {
    this.input = input;
    this.position = 13;
    this.range = 0xffffffff;
    this.code = 0;
    if (this.byte() !== 0) this.fail('범위 코더의 첫 바이트가 0이 아닙니다.');
    for (let i = 0; i < 4; i++) this.code = (this.code * 256 + this.byte()) >>> 0;
    if (this.code === this.range) this.fail('범위 코더 초기값이 잘못되었습니다.');
  }

  fail(message) { throw new Error(`LZMA ${message} (입력 바이트 ${this.position})`); }

  byte() {
    if (this.position >= this.input.length) this.fail('입력이 잘렸습니다.');
    return this.input[this.position++];
  }

  normalize() {
    if (this.range < TOP) {
      this.range = (this.range * 256) >>> 0;
      this.code = (this.code * 256 + this.byte()) >>> 0;
    }
    if (this.code >= this.range) this.fail('범위 코더 상태가 손상되었습니다.');
  }

  bit(probs, index) {
    const probability = probs[index];
    const bound = (this.range >>> 11) * probability;
    const bit = this.code >= bound ? 1 : 0;
    if (bit) {
      this.code -= bound;
      this.range -= bound;
      probs[index] = probability - (probability >>> 5);
    } else {
      this.range = bound;
      probs[index] = probability + ((2048 - probability) >>> 5);
    }
    this.normalize();
    return bit;
  }

  tree(probs, offset, bits, reverse = false) {
    let node = 1, value = 0;
    for (let i = 0; i < bits; i++) {
      const bit = this.bit(probs, offset + node);
      node = node * 2 + bit;
      if (reverse) value += bit * 2 ** i;
    }
    return reverse ? value : node - 2 ** bits;
  }

  direct(bits) {
    let value = 0;
    for (let i = 0; i < bits; i++) {
      this.range >>>= 1;
      const bit = this.code >= this.range ? 1 : 0;
      if (bit) this.code -= this.range;
      value = value * 2 + bit;
      this.normalize();
    }
    return value;
  }

  finish() {
    if (this.code !== 0) this.fail('종료 상태가 손상되었습니다.');
    if (this.position !== this.input.length) this.fail('스트림 뒤에 불필요한 데이터가 있습니다.');
  }
}

function readLength(reader, probs, posState) {
  if (!reader.bit(probs, 0)) return 2 + reader.tree(probs, 2 + posState * 8, 3);
  if (!reader.bit(probs, 1)) return 10 + reader.tree(probs, 130 + posState * 8, 3);
  return 18 + reader.tree(probs, 258, 8);
}

function readDistance(reader, model, length) {
  const slot = reader.tree(model.slot, Math.min(length - 2, 3) * 64, 6);
  if (slot < 4) return slot;
  const bits = (slot >>> 1) - 1;
  const base = (2 + (slot & 1)) * 2 ** bits;
  return base + (slot < 14
    ? reader.tree(model.distance, base - slot, bits, true)
    : reader.direct(bits - 4) * 16 + reader.tree(model.align, 0, 4, true));
}

// The output doubles as the dictionary. A hostile dictionary header never causes
// a dictionary-sized allocation; all allocation and match copies obey the limit.
export function decompress(input, { maxOutputLength = MAX_OUTPUT, maxRatio = 200 } = {}) {
  inputBytes(input);
  if (!Number.isSafeInteger(maxOutputLength) || maxOutputLength < 0 || maxOutputLength > MAX_OUTPUT)
    throw new Error('LZMA 해제 크기 한도는 0~128 MiB 정수여야 합니다.');
  if (!Number.isFinite(maxRatio) || maxRatio < 1)
    throw new Error('LZMA 압축률 한도는 1 이상의 유한한 수여야 합니다.');
  const limit = Math.min(maxOutputLength, Math.floor(input.length * maxRatio));
  if (input.length < 18) throw new Error('LZMA 입력이 잘렸습니다. 최소 18바이트가 필요합니다.');
  if (input[0] >= 225) throw new Error('LZMA 속성이 잘못되었습니다. .lzma 형식을 확인하세요.');
  const lc = input[0] % 9;
  const lp = Math.floor(input[0] / 9) % 5;
  const pb = Math.floor(input[0] / 45);
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const dictionary = Math.max(4096, view.getUint32(1, true));
  const sizeLow = view.getUint32(5, true), sizeHigh = view.getUint32(9, true);
  const unknownSize = sizeLow === 0xffffffff && sizeHigh === 0xffffffff;
  const size = unknownSize ? null : sizeHigh * 0x100000000 + sizeLow;
  if (size !== null && size > limit) throw new Error('LZMA 원본 크기가 해제 안전 한도를 넘습니다.');

  const reader = new RangeReader(input), model = models(lc, lp);
  let output = new Uint8Array(Math.min(limit, size ?? 65536));
  let position = 0, state = 0;
  const reps = [0, 0, 0, 0]; // Distances minus one, as stored in the stream.
  const posMask = (1 << pb) - 1, literalMask = (1 << lp) - 1;
  const reserve = (length) => {
    const required = position + length;
    if (size !== null && required > size) reader.fail('원본 크기와 실제 해제 크기가 다릅니다.');
    if (required > limit) reader.fail('해제 결과가 크기 또는 압축률 안전 한도를 넘습니다.');
    if (required > output.length) {
      const next = new Uint8Array(Math.min(limit, Math.max(required, output.length * 2, 4096)));
      next.set(output);
      output = next;
    }
  };

  while (true) {
    if (size !== null && position === size && reader.code === 0) break;
    const posState = position & posMask, statePos = state * 16 + posState;
    if (!reader.bit(model.match, statePos)) {
      reserve(1);
      const previous = position ? output[position - 1] : 0;
      const offset = (((position & literalMask) << lc) + (previous >>> (8 - lc))) * 768;
      let symbol = 1;
      if (state >= 7) {
        let match = output[position - reps[0] - 1];
        while (symbol < 256) {
          const expected = (match >>> 7) & 1;
          match <<= 1;
          const bit = reader.bit(model.literal, offset + (1 + expected) * 256 + symbol);
          symbol = symbol * 2 + bit;
          if (bit !== expected) break;
        }
      }
      while (symbol < 256) symbol = symbol * 2 + reader.bit(model.literal, offset + symbol);
      output[position++] = symbol - 256;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      continue;
    }

    let length;
    if (reader.bit(model.rep, state)) {
      if (!position) reader.fail('빈 사전에 대한 반복 참조입니다.');
      if (!reader.bit(model.rep0, state)) {
        if (!reader.bit(model.short, statePos)) {
          length = 1;
          state = state < 7 ? 9 : 11;
        }
      } else {
        const index = !reader.bit(model.rep1, state) ? 1 : 2 + reader.bit(model.rep2, state);
        const distance = reps[index];
        for (let i = index; i > 0; i--) reps[i] = reps[i - 1];
        reps[0] = distance;
      }
      if (length !== 1) {
        length = readLength(reader, model.repLength, posState);
        state = state < 7 ? 8 : 11;
      }
    } else {
      length = readLength(reader, model.length, posState);
      const distance = readDistance(reader, model, length);
      if (distance === 0xffffffff) {
        if (size !== null && position !== size) reader.fail('종료 표식과 원본 크기가 다릅니다.');
        break;
      }
      reps.pop();
      reps.unshift(distance);
      state = state < 7 ? 7 : 10;
    }
    const distance = reps[0] + 1;
    if (distance > position || distance > dictionary) reader.fail('사전 범위를 벗어난 거리 참조입니다.');
    reserve(length);
    for (let i = 0; i < length; i++, position++) output[position] = output[position - distance];
  }
  reader.finish();
  return position === output.length ? output : output.slice(0, position);
}

class RangeWriter {
  constructor(header) {
    this.output = new Uint8Array(4096);
    this.output.set(header);
    this.position = header.length;
    this.range = 0xffffffff;
    this.low = 0; // At most 33 bits: exactly represented by a JS Number.
    this.cache = 0;
    this.pending = 1;
  }

  byte(value) {
    if (this.position === this.output.length) {
      const next = new Uint8Array(this.output.length * 2);
      next.set(this.output);
      this.output = next;
    }
    this.output[this.position++] = value;
  }

  shift() {
    const low = this.low >>> 0;
    const carry = Math.floor(this.low / 0x100000000);
    if (low < 0xff000000 || carry) {
      this.byte(this.cache + carry);
      while (--this.pending) this.byte(0xff + carry);
      this.cache = low >>> 24;
    }
    this.pending++;
    this.low = (low & 0xffffff) * 256;
  }

  normalize() {
    if (this.range < TOP) {
      this.range *= 256;
      this.shift();
    }
  }

  bit(probs, index, bit) {
    const probability = probs[index];
    const bound = (this.range >>> 11) * probability;
    if (bit) {
      this.low += bound;
      this.range -= bound;
      probs[index] = probability - (probability >>> 5);
    } else {
      this.range = bound;
      probs[index] = probability + ((2048 - probability) >>> 5);
    }
    this.normalize();
  }

  tree(probs, offset, bits, value, reverse = false) {
    let node = 1;
    for (let i = 0; i < bits; i++) {
      const bit = (value >>> (reverse ? i : bits - i - 1)) & 1;
      this.bit(probs, offset + node, bit);
      node = node * 2 + bit;
    }
  }

  direct(bits, value) {
    for (let i = bits - 1; i >= 0; i--) {
      this.range >>>= 1;
      if ((value >>> i) & 1) this.low += this.range;
      this.normalize();
    }
  }

  finish() {
    for (let i = 0; i < 5; i++) this.shift();
    return this.output.slice(0, this.position);
  }
}

function writeLength(writer, probs, posState, length) {
  const value = length - 2;
  writer.bit(probs, 0, value < 8 ? 0 : 1);
  if (value < 8) writer.tree(probs, 2 + posState * 8, 3, value);
  else {
    writer.bit(probs, 1, value < 16 ? 0 : 1);
    if (value < 16) writer.tree(probs, 130 + posState * 8, 3, value - 8);
    else writer.tree(probs, 258, 8, value - 16);
  }
}

function writeDistance(writer, model, length, distance) {
  const high = 31 - Math.clz32(distance);
  const slot = distance < 4 ? distance : high * 2 + ((distance >>> (high - 1)) & 1);
  writer.tree(model.slot, Math.min(length - 2, 3) * 64, 6, slot);
  if (slot < 4) return;
  const bits = (slot >>> 1) - 1, base = (2 + (slot & 1)) * 2 ** bits;
  const value = distance - base;
  if (slot < 14) writer.tree(model.distance, base - slot, bits, value, true);
  else {
    writer.direct(bits - 4, value >>> 4);
    writer.tree(model.align, 0, 4, value & 15, true);
  }
}

class MatchFinder {
  constructor(input, dictionary, depth) {
    this.input = input;
    this.dictionary = dictionary;
    this.depth = depth;
    this.heads = new Int32Array(65536).fill(-1);
    this.pairs = new Int32Array(65536).fill(-1);
    this.chain = new Int32Array(Math.max(1, Math.min(dictionary, input.length)));
  }

  hash(position) {
    const input = this.input;
    return ((input[position] * 251 + input[position + 1]) * 251 + input[position + 2]) & 65535;
  }

  add(position) {
    const input = this.input;
    if (position + 1 < input.length) this.pairs[input[position] * 256 + input[position + 1]] = position;
    if (position + 2 >= input.length) return;
    const hash = this.hash(position);
    this.chain[position % this.chain.length] = this.heads[hash];
    this.heads[hash] = position;
  }

  find(position) {
    const input = this.input, available = Math.min(MAX_MATCH, input.length - position);
    let length = 1, distance = 0;
    const earliest = Math.max(0, position - this.dictionary);
    if (available >= 2) {
      const pair = this.pairs[input[position] * 256 + input[position + 1]];
      if (pair >= earliest) { length = 2; distance = position - pair; }
    }
    if (available < 3) return { length, distance };
    let candidate = this.heads[this.hash(position)], remaining = this.depth;
    while (candidate >= earliest && remaining-- > 0) {
      if (input[candidate + length] === input[position + length]) {
        let matched = 0;
        while (matched < available && input[candidate + matched] === input[position + matched]) matched++;
        if (matched > length) {
          length = matched;
          distance = position - candidate;
          if (length === available) break;
        }
      }
      candidate = this.chain[candidate % this.chain.length];
    }
    return { length, distance };
  }
}

export function compress(input, { level = 5 } = {}) {
  inputBytes(input);
  if (!Number.isInteger(level) || level < 1 || level > 9)
    throw new Error('LZMA 압축 레벨은 1~9 정수여야 합니다.');
  const dictionary = DICTIONARIES[level];
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  header[0] = 0x5d; // lc=3, lp=0, pb=2, matching the previous tool contract.
  view.setUint32(1, dictionary, true);
  view.setUint32(5, input.length, true);
  const writer = new RangeWriter(header), model = models(3, 0);
  const finder = new MatchFinder(input, dictionary, SEARCH_DEPTHS[level]);
  const reps = [0, 0, 0, 0];
  let position = 0, state = 0;
  while (position < input.length) {
    const posState = position & 3, statePos = state * 16 + posState;
    const available = Math.min(MAX_MATCH, input.length - position);
    let repIndex = 0, repLength = 0;
    for (let i = 0; i < 4; i++) {
      const distance = reps[i] + 1;
      if (distance > position) continue;
      let length = 0;
      while (length < available && input[position + length] === input[position - distance + length]) length++;
      if (length > repLength) { repLength = length; repIndex = i; }
    }
    // Avoid a chain traversal when a repeat already fills the longest token.
    const match = repLength === available && repLength >= 2
      ? { length: repLength, distance: reps[repIndex] + 1 } : finder.find(position);
    let length = 1;
    if (repLength >= 2 && repLength + 1 >= match.length) {
      length = repLength;
      writer.bit(model.match, statePos, 1);
      writer.bit(model.rep, state, 1);
      writer.bit(model.rep0, state, repIndex === 0 ? 0 : 1);
      if (repIndex === 0) writer.bit(model.short, statePos, 1);
      else {
        writer.bit(model.rep1, state, repIndex === 1 ? 0 : 1);
        if (repIndex > 1) writer.bit(model.rep2, state, repIndex - 2);
        const distance = reps[repIndex];
        for (let i = repIndex; i > 0; i--) reps[i] = reps[i - 1];
        reps[0] = distance;
      }
      writeLength(writer, model.repLength, posState, length);
      state = state < 7 ? 8 : 11;
    } else if (match.length >= 3 || (match.length === 2 && match.distance < 128)) {
      length = match.length;
      writer.bit(model.match, statePos, 1);
      writer.bit(model.rep, state, 0);
      writeLength(writer, model.length, posState, length);
      writeDistance(writer, model, length, match.distance - 1);
      reps.pop();
      reps.unshift(match.distance - 1);
      state = state < 7 ? 7 : 10;
    } else if (position > reps[0] && input[position] === input[position - reps[0] - 1]) {
      writer.bit(model.match, statePos, 1);
      writer.bit(model.rep, state, 1);
      writer.bit(model.rep0, state, 0);
      writer.bit(model.short, statePos, 0);
      state = state < 7 ? 9 : 11;
    } else {
      writer.bit(model.match, statePos, 0);
      const offset = (position ? input[position - 1] >>> 5 : 0) * 768;
      let symbol = 1, matched = state >= 7;
      const matchByte = matched ? input[position - reps[0] - 1] : 0;
      for (let i = 7; i >= 0; i--) {
        const bit = (input[position] >>> i) & 1, expected = (matchByte >>> i) & 1;
        writer.bit(model.literal, offset + symbol + (matched ? (1 + expected) * 256 : 0), bit);
        symbol = symbol * 2 + bit;
        if (bit !== expected) matched = false;
      }
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
    }
    for (let i = 0; i < length; i++) finder.add(position++);
  }
  // Preserve the known-size header plus EOS used by lzma 2.3.2. The decoder also
  // accepts streams without EOS when their header records the exact output size.
  writer.bit(model.match, state * 16 + (position & 3), 1);
  writer.bit(model.rep, state, 0);
  writeLength(writer, model.length, position & 3, 2);
  writeDistance(writer, model, 2, 0xffffffff);
  return writer.finish();
}
