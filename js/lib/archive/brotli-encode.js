// First-party Brotli encoder, RFC 7932 sections 3–5 and 9 (reviewed 2026-09-08).
// https://www.rfc-editor.org/rfc/rfc7932
// One literal/command/distance tree per meta-block; no dictionary references or
// context switching. These are encoder choices, not restrictions on input bytes.
// Quality controls bounded LZ77 search, not Google's encoder's quality heuristics.

export const BROTLI_MAX_INPUT = 256 * 1024 * 1024;
const BLOCK_BYTES = 1024 * 1024;
const WINDOW = BLOCK_BYTES - 16;
const DEPTH = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128];
const INSERT_BITS = [0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 12, 14, 24];
const COPY_BITS = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 24];
const COMMAND_GROUP = [[128, 192, 384], [256, 320, 512], [448, 576, 640]];
const LENGTH_ORDER = [1, 2, 3, 4, 0, 5, 17, 6, 16, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const LENGTH_CODE = [0, 7, 3, 2, 1, 15];
const LENGTH_BITS = [2, 4, 3, 2, 2, 4];

function bases(bits, start) {
  return bits.map((width) => { const base = start; start += 2 ** width; return base; });
}
const INSERT_BASE = bases(INSERT_BITS, 0);
const COPY_BASE = bases(COPY_BITS, 2);

class BitWriter {
  constructor(capacity) {
    this.bytes = new Uint8Array(capacity);
    this.position = 0;
  }
  write(width, value) {
    // The largest field is 24 bits. Write partial bytes to avoid JS shift wrap.
    while (width) {
      const offset = this.position & 7;
      const take = Math.min(width, 8 - offset);
      this.bytes[this.position >>> 3] |= (value & ((1 << take) - 1)) << offset;
      value >>>= take;
      width -= take;
      this.position += take;
    }
  }
  align() { this.position = Math.ceil(this.position / 8) * 8; }
  raw(bytes) {
    this.align();
    this.bytes.set(bytes, this.position >>> 3);
    this.position += bytes.length * 8;
  }
  finish() { return this.bytes.slice(0, Math.ceil(this.position / 8)); }
}

function reverse(value, width) {
  let result = 0;
  for (let i = 0; i < width; i++) { result = (result << 1) | (value & 1); value >>>= 1; }
  return result;
}

function prefixCode(lengths) {
  const counts = new Uint16Array(16), next = new Uint16Array(16);
  for (const length of lengths) if (length) counts[length]++;
  let code = 0;
  for (let width = 1; width <= 15; width++) {
    code = (code + counts[width - 1]) * 2;
    next[width] = code;
  }
  return { lengths, codes: Uint16Array.from(lengths, (width) => width ? reverse(next[width]++, width) : 0) };
}

function huffman(frequencies, maxBits = 15) {
  const symbols = Array.from(frequencies.keys()).filter((symbol) => frequencies[symbol]);
  if (!symbols.length) symbols.push(0);
  if (symbols.length === 1) return { ...prefixCode(new Uint8Array(frequencies.length)), symbols };
  // Raising the minimum weight bounds tree depth without truncating codes or
  // violating Kraft equality. Alphabets have at most 704 entries.
  for (let floor = 1; ; floor *= 2) {
    const nodes = symbols.map((symbol) => ({ symbol, weight: Math.max(floor, frequencies[symbol]) }));
    nodes.sort((a, b) => a.weight - b.weight || a.symbol - b.symbol);
    const parents = [];
    let leaf = 0, parent = 0;
    const take = () => leaf < nodes.length
      && (parent >= parents.length || nodes[leaf].weight <= parents[parent].weight)
      ? nodes[leaf++] : parents[parent++];
    for (let i = 1; i < symbols.length; i++) {
      const left = take(), right = take();
      parents.push({ weight: left.weight + right.weight, left, right });
    }
    const lengths = new Uint8Array(frequencies.length);
    let deepest = 0;
    const visit = (node, depth) => {
      if (node.symbol !== undefined) { lengths[node.symbol] = depth; deepest = Math.max(deepest, depth); }
      else { visit(node.left, depth + 1); visit(node.right, depth + 1); }
    };
    visit(parents[parents.length - 1], 0);
    if (deepest <= maxBits) return { ...prefixCode(lengths), symbols };
  }
}

function emit(writer, tree, symbol) {
  writer.write(tree.lengths[symbol], tree.codes[symbol]);
}

function writeTree(writer, tree) {
  const { lengths, symbols } = tree;
  if (symbols.length <= 4) {
    const ordered = [...symbols].sort((a, b) => lengths[a] - lengths[b] || a - b);
    writer.write(2, 1);
    writer.write(2, ordered.length - 1);
    const width = Math.ceil(Math.log2(lengths.length));
    for (const symbol of ordered) writer.write(width, symbol);
    if (ordered.length === 4) writer.write(1, lengths[ordered[0]] === 1 ? 1 : 0);
    return;
  }
  // Encode runs with explicit separators. Consecutive 16/17 symbols would
  // extend the preceding run (RFC 7932 §3.5), rather than start another run.
  const sequence = [], counts = new Uint32Array(18);
  const push = (symbol, extra = 0) => { sequence.push([symbol, extra]); counts[symbol]++; };
  const last = Math.max(...symbols);
  for (let i = 0; i <= last;) {
    const length = lengths[i++];
    push(length);
    let run = 0;
    while (i + run <= last && lengths[i + run] === length) run++;
    while (run >= 3) {
      const take = Math.min(run, length ? 6 : 10);
      push(length ? 16 : 17, take - 3);
      i += take; run -= take;
      if (run) { push(length); i++; run--; }
    }
    while (run--) { push(length); i++; }
  }
  const codeLengths = huffman(counts, 5);
  writer.write(2, 0); // HSKIP
  let remaining = 32;
  for (const symbol of LENGTH_ORDER) {
    // A single code-length symbol is represented by length 1 in the header,
    // but consumes no bits in the following sequence; all 18 lengths appear.
    const length = codeLengths.symbols.length === 1
      ? Number(symbol === codeLengths.symbols[0]) : codeLengths.lengths[symbol];
    writer.write(LENGTH_BITS[length], LENGTH_CODE[length]);
    if (length) remaining -= 32 >> length;
    if (!remaining) break;
  }
  for (const [symbol, extra] of sequence) {
    emit(writer, codeLengths, symbol);
    if (symbol >= 16) writer.write(symbol === 16 ? 2 : 3, extra);
  }
}

function lengthCode(value, table) {
  let code = 0;
  while (code + 1 < table.length && table[code + 1] <= value) code++;
  return code;
}

function distanceCode(distance) {
  // NPOSTFIX = NDIRECT = 0. Emit explicit distances, independent of the cache.
  const value = distance + 3;
  const bits = Math.floor(Math.log2(value)) - 1;
  const high = (value >>> bits) - 2;
  return { code: 16 + 2 * (bits - 1) + high, bits, extra: value - ((2 + high) << bits) };
}

function commandsFor(bytes, quality) {
  // Size the hash table to the block, so random 1 MiB inputs do not spend their
  // search budget walking collisions in a small fixed table.
  const hashBits = Math.min(20, Math.max(10, Math.ceil(Math.log2(bytes.length))));
  const heads = new Int32Array(2 ** hashBits).fill(-1);
  const previous = new Int32Array(bytes.length);
  // Four words per command (literal start, literal length, copy length, distance).
  // Each non-final command covers at least four bytes; storage stays linear.
  const commands = new Uint32Array(bytes.length + 4);
  let used = 0, position = 0, literalStart = 0;
  const hash = (at) => Math.imul((bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16
    | bytes[at + 3] << 24), 0x1e35a7bd) >>> (32 - hashBits);
  const remember = (at) => {
    if (at + 3 >= bytes.length) return -1;
    const key = hash(at), candidate = heads[key];
    previous[at] = candidate;
    heads[key] = at;
    return candidate;
  };
  const add = (start, insert, copy, distance) => {
    commands[used++] = start; commands[used++] = insert;
    commands[used++] = copy; commands[used++] = distance;
  };
  while (position + 3 < bytes.length) {
    let candidate = remember(position), best = 3, distance = 0;
    let depth = DEPTH[quality], budget = 256 + quality * 128;
    const maxLength = bytes.length - position;
    while (candidate >= 0 && position - candidate <= WINDOW && depth-- && budget > 0) {
      if (bytes[candidate + best] === bytes[position + best]
          && bytes[candidate] === bytes[position] && bytes[candidate + 1] === bytes[position + 1]
          && bytes[candidate + 2] === bytes[position + 2]) {
        let length = 3;
        while (length < maxLength && bytes[candidate + length] === bytes[position + length]) length++;
        budget -= length;
        if (length > best) { best = length; distance = position - candidate; }
        if (best === maxLength) break;
      }
      candidate = previous[candidate];
    }
    if (!distance) { position++; continue; }
    add(literalStart, position - literalStart, best, distance);
    const end = position + best;
    while (++position < end) remember(position);
    literalStart = position;
  }
  if (literalStart < bytes.length) add(literalStart, bytes.length - literalStart, 2, 0);
  return commands.subarray(0, used);
}

function commandCode(insert, copy) {
  return COMMAND_GROUP[insert >>> 3][copy >>> 3] + ((insert & 7) << 3) + (copy & 7);
}

function compressedBlock(bytes, quality) {
  const commands = commandsFor(bytes, quality);
  const literalCounts = new Uint32Array(256), commandCounts = new Uint32Array(704);
  const distanceCounts = new Uint32Array(64);
  let extraBits = 0;
  for (let i = 0; i < commands.length; i += 4) {
    const [start, insert, copy, distance] = commands.subarray(i, i + 4);
    for (let at = start; at < start + insert; at++) literalCounts[bytes[at]]++;
    const ic = lengthCode(insert, INSERT_BASE), cc = lengthCode(copy, COPY_BASE);
    commandCounts[commandCode(ic, cc)]++;
    extraBits += INSERT_BITS[ic] + COPY_BITS[cc];
    if (distance) {
      const dc = distanceCode(distance);
      distanceCounts[dc.code]++;
      extraBits += dc.bits;
    }
  }
  const literals = huffman(literalCounts), lengths = huffman(commandCounts), distances = huffman(distanceCounts);
  // Skip bit emission when even the payload alone cannot beat raw storage.
  // This avoids a second literal scan and a scratch buffer for high-entropy data.
  const cost = (counts, tree) => counts.reduce((sum, count, symbol) => sum + count * tree.lengths[symbol], 0);
  if (extraBits + cost(literalCounts, literals) + cost(commandCounts, lengths)
      + cost(distanceCounts, distances) >= bytes.length * 8) return null;
  // At most 15 bits/literal, 90 bits/command, and < 4 KiB of tree headers.
  const writer = new BitWriter(bytes.length * 5 + 4096);
  writer.write(13, 0); // one block type per alphabet, no postfix/direct codes,
  // LSB6 context mode, one literal tree and one distance tree (RFC 7932 §9.2).
  writeTree(writer, literals);
  writeTree(writer, lengths);
  writeTree(writer, distances);
  for (let i = 0; i < commands.length; i += 4) {
    const [start, insert, copy, distance] = commands.subarray(i, i + 4);
    const ic = lengthCode(insert, INSERT_BASE), cc = lengthCode(copy, COPY_BASE);
    emit(writer, lengths, commandCode(ic, cc));
    writer.write(INSERT_BITS[ic], insert - INSERT_BASE[ic]);
    writer.write(COPY_BITS[cc], copy - COPY_BASE[cc]);
    for (let at = start; at < start + insert; at++) emit(writer, literals, bytes[at]);
    if (distance) {
      const dc = distanceCode(distance);
      emit(writer, distances, dc.code);
      writer.write(dc.bits, dc.extra);
    }
  }
  return writer;
}

export function compress(bytes, { quality = 6, maxInputLength = BROTLI_MAX_INPUT } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Brotli 입력은 바이트 배열이어야 합니다.');
  if (!Number.isInteger(quality) || quality < 0 || quality > 11)
    throw new Error('Brotli 압축 레벨은 0~11 사이의 정수여야 합니다.');
  if (!Number.isSafeInteger(maxInputLength) || maxInputLength < 0 || maxInputLength > BROTLI_MAX_INPUT)
    throw new Error('Brotli 입력 안전 한도가 올바르지 않습니다.');
  if (bytes.length > maxInputLength) throw new Error('Brotli 입력이 안전 한도(최대 256 MiB)를 넘습니다.');
  // Every block is compared with its raw representation before committing it.
  const writer = new BitWriter(bytes.length + Math.ceil(bytes.length / BLOCK_BYTES) * 5 + 8);
  writer.write(4, 7); // WBITS = 20: 1 MiB - 16 bytes.
  for (let offset = 0; offset < bytes.length; offset += BLOCK_BYTES) {
    const block = bytes.subarray(offset, offset + BLOCK_BYTES);
    const compressed = compressedBlock(block, quality);
    const raw = !compressed || compressed.position >= block.length * 8;
    writer.write(1, 0); // Non-final: stored blocks require a final empty block.
    const nibbles = block.length <= 65536 ? 4 : 5;
    writer.write(2, nibbles - 4);
    writer.write(nibbles * 4, block.length - 1);
    writer.write(1, Number(raw));
    if (raw) writer.raw(block);
    else {
      const fullBytes = compressed.position >>> 3;
      for (let i = 0; i < fullBytes; i++) writer.write(8, compressed.bytes[i]);
      writer.write(compressed.position & 7, compressed.bytes[fullBytes]);
    }
  }
  writer.write(2, 3); // ISLAST = ISLASTEMPTY = 1, zero padding.
  return writer.finish();
}
