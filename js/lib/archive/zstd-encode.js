// RFC 8878 encoder: bounded hash-chain LZ parsing and predefined FSE sequence tables.
// Levels select search effort; output is independent of libzstd.
import { LL_BITS, ML_BITS, LL_BASE, ML_BASE, DEFAULT_LL, DEFAULT_OF, DEFAULT_ML, fseTable, fail } from './zstd-entropy.js';
import { xxhash64 } from './xxhash64.js';

const INPUT_LIMIT = 256 * 1024 * 1024, BLOCK_SIZE = 131072, WINDOW = 1048576;

function inverseTable(table) {
  const transitions = Array.from({ length: Math.max(...table.symbols) + 1 }, () => new Uint16Array(2 ** table.log));
  const first = new Uint16Array(transitions.length);
  for (let state = 0; state < table.symbols.length; state++) {
    const symbol = table.symbols[state]; first[symbol] = state;
    transitions[symbol].fill(state, table.base[state], table.base[state] + 2 ** table.bits[state]);
  }
  return { transitions, first, table };
}
const ENCODE_LL = inverseTable(DEFAULT_LL), ENCODE_OF = inverseTable(DEFAULT_OF), ENCODE_ML = inverseTable(DEFAULT_ML);

class Bits {
  constructor(size) { this.bytes = new Uint8Array(size); this.position = 0; this.buffer = 0; this.pending = 0; }
  write(value, width) {
    // Encoder fields are at most 20 bits; the accumulator never exceeds 27 bits.
    this.buffer |= value << this.pending; this.pending += width;
    while (this.pending >= 8) {
      this.bytes[this.position++] = this.buffer & 255; this.buffer >>>= 8; this.pending -= 8;
    }
  }
  finish(stop = true) {
    if (stop) this.write(1, 1);
    if (this.pending) this.bytes[this.position++] = this.buffer;
    return this.bytes.subarray(0, this.position);
  }
}

function encodeWeights(weights) {
  const counts = new Uint16Array(12);
  for (const weight of weights) counts[weight]++;
  const last = counts.findLastIndex((count) => count !== 0), probabilities = [];
  for (let i = 0; i <= last; i++) probabilities.push(counts[i] ? Math.max(1, Math.floor(counts[i] * 32 / weights.length)) : 0);
  let total = probabilities.reduce((a, b) => a + b, 0);
  while (total !== 32) {
    let best = -1, score = -Infinity;
    for (let i = 0; i <= last; i++) {
      if (!counts[i] || (total > 32 && probabilities[i] <= 1)) continue;
      const difference = total < 32 ? counts[i] * 32 / weights.length - probabilities[i]
        : probabilities[i] - counts[i] * 32 / weights.length;
      if (difference > score) { score = difference; best = i; }
    }
    const change = total < 32 ? 1 : -1; probabilities[best] += change; total += change;
  }
  const header = new Bits(64); header.write(0, 4);
  let remaining = 32;
  for (let i = 0; i < probabilities.length; i++) {
    const count = probabilities[i], value = count + 1;
    const width = Math.floor(Math.log2(remaining + 1)) + 1, threshold = 2 ** width - 2 - remaining;
    if (value < threshold) header.write(value, width - 1);
    else header.write(value < 2 ** (width - 1) ? value : value + threshold, width);
    remaining -= count;
    if (!count) {
      let zeros = 0;
      while (i + 1 < probabilities.length && !probabilities[i + 1]) { i++; zeros++; }
      while (zeros >= 3) { header.write(3, 2); zeros -= 3; }
      header.write(zeros, 2);
    }
  }
  const table = fseTable(probabilities, 5), inverse = inverseTable(table), stream = new Bits(512), states = [0, 0];
  for (let i = weights.length - 2; i < weights.length; i++) {
    // The decoder terminates when the next state update exhausts the bitstream.
    states[i & 1] = table.symbols.findIndex((symbol, state) => symbol === weights[i] && table.bits[state] > 0);
  }
  for (let i = weights.length - 3; i >= 0; i--) {
    const lane = i & 1, previous = inverse.transitions[weights[i]][states[lane]];
    stream.write(states[lane] - table.base[previous], table.bits[previous]); states[lane] = previous;
  }
  stream.write(states[1], 5); stream.write(states[0], 5);
  const description = header.finish(false), packed = stream.finish(), result = new Uint8Array(description.length + packed.length + 1);
  result[0] = description.length + packed.length; result.set(description, 1); result.set(packed, description.length + 1);
  return result;
}

function huffmanLiterals(bytes) {
  if (bytes.length < 32) return null;
  const frequencies = new Uint32Array(256);
  for (const byte of bytes) frequencies[byte]++;
  const last = frequencies.findLastIndex((count) => count !== 0), count = frequencies.filter((n) => n > 0).length;
  if (count < 2) return null;
  // Entropy is a lower bound on any Huffman payload. Skip building a tree when
  // even that bound cannot repay a small header (common for incompressible data).
  let entropy = bytes.length * Math.log2(bytes.length);
  for (const frequency of frequencies) if (frequency) entropy -= frequency * Math.log2(frequency);
  if (entropy / 8 + 32 >= bytes.length) return null;
  let lengths, depth;
  const scaled = Array.from(frequencies);
  do {
    const nodes = [];
    for (let i = 0; i <= last; i++) if (scaled[i]) nodes.push({ weight: scaled[i], symbol: i });
    while (nodes.length > 1) {
      nodes.sort((a, b) => a.weight - b.weight);
      const left = nodes.shift(), right = nodes.shift(); nodes.push({ weight: left.weight + right.weight, left, right });
    }
    lengths = new Uint8Array(last + 1); depth = 0;
    const visit = (node, width) => {
      if (node.symbol !== undefined) { lengths[node.symbol] = width; depth = Math.max(depth, width); }
      else { visit(node.left, width + 1); visit(node.right, width + 1); }
    };
    visit(nodes[0], 0);
    for (let i = 0; i <= last; i++) if (scaled[i]) scaled[i] = Math.max(1, Math.floor(scaled[i] / 2));
  } while (depth > 11);
  const weights = Array.from(lengths, (length) => length ? depth + 1 - length : 0), codes = new Uint16Array(last + 1);
  let position = 0, bitCount = 0;
  for (let weight = 1; weight <= depth; weight++) {
    for (let symbol = 0; symbol <= last; symbol++) {
      if (weights[symbol] !== weight) continue;
      codes[symbol] = position >>> (weight - 1); position += 2 ** (weight - 1);
      bitCount += frequencies[symbol] * lengths[symbol];
    }
  }
  if (Math.ceil(bitCount / 8) + 32 >= bytes.length) return null;
  let tree;
  if (last <= 128) {
    tree = new Uint8Array(1 + Math.ceil(last / 2)); tree[0] = 127 + last;
    for (let i = 0; i < last; i++) tree[1 + (i >>> 1)] |= weights[i] << ((i & 1) ? 0 : 4);
  } else tree = encodeWeights(weights.slice(0, -1));
  const single = bytes.length < 1024, segment = single ? bytes.length : Math.ceil(bytes.length / 4), streams = [];
  for (let start = 0; start < bytes.length; start += segment) {
    const stream = new Bits(Math.ceil(segment * 11 / 8) + 1);
    for (let i = Math.min(bytes.length, start + segment) - 1; i >= start; i--) stream.write(codes[bytes[i]], lengths[bytes[i]]);
    streams.push(stream.finish());
  }
  const packedSize = tree.length + (single ? 0 : 6) + streams.reduce((sum, stream) => sum + stream.length, 0);
  const width = single ? 10 : bytes.length < 16384 && packedSize < 16384 ? 14 : 18;
  const headerBytes = width === 10 ? 3 : width === 14 ? 4 : 5;
  const result = new Uint8Array(headerBytes + packedSize);
  let header = 2 + (single ? 0 : width === 14 ? 8 : 12) + bytes.length * 16 + packedSize * 2 ** (width + 4);
  for (let i = 0; i < headerBytes; i++) { result[i] = header % 256; header = Math.floor(header / 256); }
  result.set(tree, headerBytes); let cursor = headerBytes + tree.length;
  if (!single) {
    for (let i = 0; i < 3; i++) { result[cursor++] = streams[i].length & 255; result[cursor++] = streams[i].length >>> 8; }
  }
  for (const stream of streams) { result.set(stream, cursor); cursor += stream.length; }
  return result;
}

function lengthCode(length, bases) {
  let low = 0, high = bases.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >>> 1;
    if (bases[middle] <= length) low = middle;
    else high = middle - 1;
  }
  return low;
}

function sequenceStream(sequences) {
  const bits = new Bits(sequences.length * 12 + 16), last = sequences.length - 1;
  const states = [ENCODE_LL.first[sequences[last].ll], ENCODE_OF.first[sequences[last].of], ENCODE_ML.first[sequences[last].ml]];
  for (let i = last; i >= 0; i--) {
    const sequence = sequences[i], symbols = [sequence.ll, sequence.of, sequence.ml];
    if (i !== last) {
      for (const index of [1, 2, 0]) {
        const { table, transitions } = [ENCODE_LL, ENCODE_OF, ENCODE_ML][index];
        const previous = transitions[symbols[index]][states[index]];
        bits.write(states[index] - table.base[previous], table.bits[previous]); states[index] = previous;
      }
    }
    bits.write(sequence.literals - LL_BASE[sequence.ll], LL_BITS[sequence.ll]);
    bits.write(sequence.match - ML_BASE[sequence.ml], ML_BITS[sequence.ml]);
    bits.write(sequence.distance + 3 - 2 ** sequence.of, sequence.of);
  }
  bits.write(states[2], DEFAULT_ML.log); bits.write(states[1], DEFAULT_OF.log); bits.write(states[0], DEFAULT_LL.log);
  return bits.finish();
}

export function compress(bytes, { level = 3 } = {}) {
  if (!(bytes instanceof Uint8Array)) fail('입력은 바이트 배열이어야 합니다.');
  if (bytes.length > INPUT_LIMIT) fail('입력이 안전 한도 256 MiB를 넘습니다.');
  if (!Number.isInteger(level) || level < 1 || level > 19) fail('압축 레벨은 1~19의 정수여야 합니다.');
  const depth = level === 1 ? 1 : level <= 3 ? 2 : level <= 10 ? 8 : 16;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const heads = new Int32Array(65536).fill(-1), chain = new Int32Array(WINDOW).fill(-1);
  const hash = (offset) => Math.imul(view.getUint32(offset, true), 0x9e3779b1) >>> 16;
  const insert = (offset) => {
    const key = hash(offset), previous = heads[key];
    chain[offset & (WINDOW - 1)] = previous; heads[key] = offset; return previous;
  };
  const blocks = [];
  let total = 13; // Magic, descriptor, 4-byte content size, checksum.
  for (let start = 0; start < bytes.length || (!bytes.length && !blocks.length); start += BLOCK_SIZE) {
    const end = Math.min(bytes.length, start + BLOCK_SIZE), literals = new Uint8Array(end - start), sequences = [];
    let cursor = start, anchor = start, literalSize = 0, misses = 0;
    while (cursor + 6 <= end) {
      let candidate = insert(cursor), bestLength = 5, bestDistance = 0, searches = depth;
      while (candidate >= 0 && candidate >= cursor - WINDOW && candidate < cursor && searches-- > 0) {
        if (bytes[candidate + bestLength] === bytes[cursor + bestLength]
            && view.getUint32(candidate, true) === view.getUint32(cursor, true)) {
          let length = 4;
          while (cursor + length < end && bytes[candidate + length] === bytes[cursor + length]) length++;
          if (length > bestLength) { bestLength = length; bestDistance = cursor - candidate; }
          if (cursor + length === end || length >= 258) break;
        }
        candidate = chain[candidate & (WINDOW - 1)];
      }
      if (!bestDistance) { cursor += 1 + (misses++ >>> (level <= 3 ? 6 : 8)); continue; }
      const literalLength = cursor - anchor;
      literals.set(bytes.subarray(anchor, cursor), literalSize); literalSize += literalLength;
      sequences.push({ literals: literalLength, match: bestLength, distance: bestDistance,
        ll: lengthCode(literalLength, LL_BASE), ml: lengthCode(bestLength, ML_BASE), of: Math.floor(Math.log2(bestDistance + 3)) });
      const matchEnd = cursor + bestLength;
      // Seed a few positions for subsequent short matches without walking long repeated spans.
      for (let p = cursor + 1; p < Math.min(matchEnd, cursor + depth) && p + 4 <= end; p++) insert(p);
      if (matchEnd - 2 > cursor && matchEnd + 2 <= end) insert(matchEnd - 2);
      cursor = anchor = matchEnd; misses = 0;
    }
    literals.set(bytes.subarray(anchor, end), literalSize); literalSize += end - anchor;
    let data = bytes.subarray(start, end), type = 0;
    {
      const sequenceBytes = sequences.length ? sequenceStream(sequences) : new Uint8Array(0), header = [];
      let literalHeader;
      if (literalSize < 32) { literalHeader = literalSize * 8; header.push(literalHeader); }
      else if (literalSize < 4096) { literalHeader = literalSize * 16 + 4; header.push(literalHeader & 255, literalHeader >>> 8); }
      else { literalHeader = literalSize * 16 + 12; header.push(literalHeader & 255, (literalHeader >>> 8) & 255, literalHeader >>> 16); }
      const count = sequences.length, countBytes = count < 128 ? [count]
        : count < 0x7f00 ? [(count >>> 8) + 128, count & 255] : [255, (count - 0x7f00) & 255, (count - 0x7f00) >>> 8];
      const huffman = huffmanLiterals(literals.subarray(0, literalSize));
      const literalBytes = huffman && huffman.length < header.length + literalSize ? huffman : null;
      const literalSectionSize = literalBytes ? literalBytes.length : header.length + literalSize;
      const length = literalSectionSize + countBytes.length + (count ? 1 : 0) + sequenceBytes.length;
      if (length < end - start) {
        data = new Uint8Array(length); type = 2;
        if (literalBytes) data.set(literalBytes);
        else { data.set(header); data.set(literals.subarray(0, literalSize), header.length); }
        const position = literalSectionSize;
        data.set(countBytes, position); // All three sequence tables use predefined mode (zero).
        if (count) data.set(sequenceBytes, position + countBytes.length + 1);
      }
    }
    blocks.push({ data, type }); total += 3 + data.length;
  }
  const output = new Uint8Array(total), resultView = new DataView(output.buffer);
  resultView.setUint32(0, 0xfd2fb528, true); output[4] = 0xa4;
  resultView.setUint32(5, bytes.length, true);
  let position = 9;
  for (let i = 0; i < blocks.length; i++) {
    const { data, type } = blocks[i], header = data.length * 8 + type * 2 + (i === blocks.length - 1 ? 1 : 0);
    output[position++] = header & 255; output[position++] = (header >>> 8) & 255; output[position++] = header >>> 16;
    output.set(data, position); position += data.length;
  }
  resultView.setUint32(position, Number(xxhash64(bytes) & 0xffffffffn), true);
  return output;
}
