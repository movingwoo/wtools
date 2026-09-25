// LZ4 frame v1.6.4 and block format. No external dictionaries or legacy frames.
import { xxhash32 } from './xxhash32.js';

const INPUT_LIMIT = 256 * 1024 * 1024;
const OUTPUT_LIMIT = 128 * 1024 * 1024;
const MAGIC = 0x184d2204;
const BLOCK_SIZES = [0, 0, 0, 0, 65536, 262144, 1048576, 4194304];

function checkInput(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('LZ4 입력은 바이트 배열이어야 합니다.');
  if (bytes.length > INPUT_LIMIT) throw new Error('LZ4 입력이 안전 한도 256 MiB를 넘습니다.');
}

export function decompress(bytes, options = {}) {
  checkInput(bytes);
  const maxOutputLength = options.maxOutputLength ?? Math.min(OUTPUT_LIMIT, bytes.length * 200);
  if (!Number.isSafeInteger(maxOutputLength) || maxOutputLength < 0 || maxOutputLength > OUTPUT_LIMIT)
    throw new Error('LZ4 해제 한도는 0~128 MiB의 정수여야 합니다.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 0, used = 0, output = new Uint8Array(0), frames = 0;
  const fail = (message) => { throw new Error(`LZ4 바이트 ${cursor}: ${message}`); };
  const requireBytes = (length) => { if (length > bytes.length - cursor) fail('데이터가 잘렸습니다.'); };
  const word = () => { requireBytes(4); const value = view.getUint32(cursor, true); cursor += 4; return value; };
  const grow = (length) => {
    const next = used + length;
    if (next > maxOutputLength) fail('해제 결과가 크기 또는 압축률 안전 한도를 넘습니다.');
    if (next > output.length) {
      const replacement = new Uint8Array(Math.min(maxOutputLength, Math.max(next, 65536, output.length * 2)));
      replacement.set(output.subarray(0, used));
      output = replacement;
    }
  };
  while (cursor < bytes.length) {
    const magic = word();
    if ((magic & 0xfffffff0) === 0x184d2a50) {
      const length = word(); requireBytes(length); cursor += length; frames++;
      continue;
    }
    if (magic !== MAGIC) fail('LZ4 프레임 매직이 올바르지 않습니다.');
    frames++;
    const headerStart = cursor;
    requireBytes(2);
    const flags = bytes[cursor++], descriptor = bytes[cursor++];
    if ((flags >>> 6) !== 1 || (flags & 2) || (descriptor & 0x8f)) fail('예약 비트 또는 프레임 버전이 올바르지 않습니다.');
    const blockSize = BLOCK_SIZES[descriptor >>> 4];
    if (!blockSize) fail('블록 크기가 올바르지 않습니다.');
    let contentSize;
    if (flags & 8) {
      const low = word(), high = word();
      contentSize = high * 4294967296 + low;
      if (!Number.isSafeInteger(contentSize) || contentSize > maxOutputLength - used)
        fail('선언된 해제 크기가 안전 한도를 넘습니다.');
    }
    if (flags & 1) { word(); fail('외부 사전을 사용하는 프레임은 지원하지 않습니다.'); }
    requireBytes(1);
    const headerHash = (xxhash32(bytes.subarray(headerStart, cursor)) >>> 8) & 255;
    if (bytes[cursor++] !== headerHash) fail('헤더 체크섬이 일치하지 않습니다.');
    const frameStart = used;
    for (;;) {
      const block = word();
      if (!block) break;
      const length = block & 0x7fffffff, stored = block >>> 31;
      if (length > blockSize) fail('블록 크기가 프레임 한도를 넘습니다.');
      requireBytes(length + ((flags & 16) ? 4 : 0));
      const end = cursor + length, blockStart = used;
      if (flags & 16) {
        if (xxhash32(bytes.subarray(cursor, end)) !== view.getUint32(end, true)) fail('블록 체크섬이 일치하지 않습니다.');
      }
      const reserve = (count) => {
        if (used - blockStart + count > blockSize) fail('해제 블록 크기가 프레임 한도를 넘습니다.');
        if (contentSize !== undefined && used - frameStart + count > contentSize) fail('선언된 해제 크기를 넘습니다.');
        grow(count);
      };
      if (stored) {
        reserve(length); output.set(bytes.subarray(cursor, end), used); used += length; cursor = end;
      } else {
        const expandedLength = (nibble) => {
          let count = nibble;
          if (nibble === 15) {
            let extra;
            do {
              if (cursor === end) fail('블록 길이 데이터가 잘렸습니다.');
              extra = bytes[cursor++]; count += extra;
            } while (extra === 255);
          }
          return count;
        };
        let lastMatch = -1, finalLiterals = -1;
        while (cursor < end) {
          const token = bytes[cursor++], literals = expandedLength(token >>> 4);
          if (literals > end - cursor) fail('리터럴 데이터가 잘렸습니다.');
          reserve(literals);
          output.set(bytes.subarray(cursor, cursor + literals), used); used += literals; cursor += literals;
          if (cursor === end) { finalLiterals = literals; break; }
          if (end - cursor < 2) fail('일치 거리 데이터가 잘렸습니다.');
          const distance = bytes[cursor++] | (bytes[cursor++] << 8);
          const historyStart = (flags & 32) ? blockStart : frameStart;
          if (!distance || distance > used - historyStart) fail('일치 거리가 올바르지 않습니다.');
          const count = expandedLength(token & 15) + 4;
          reserve(count); lastMatch = used;
          for (let i = 0; i < count; i++) { output[used] = output[used - distance]; used++; }
        }
        if (finalLiterals < 0 || (lastMatch >= 0 && (finalLiterals < 5 || used - lastMatch < 12)))
          fail('블록 끝의 리터럴 또는 마지막 일치 위치가 올바르지 않습니다.');
      }
      cursor = end + ((flags & 16) ? 4 : 0);
    }
    if (contentSize !== undefined && used - frameStart !== contentSize) fail('선언된 해제 크기와 결과가 다릅니다.');
    if ((flags & 4) && word() !== xxhash32(output.subarray(frameStart, used))) fail('내용 체크섬이 일치하지 않습니다.');
  }
  if (!frames) fail('LZ4 프레임이 없습니다.');
  return output.slice(0, used);
}

function compressBlock(bytes) {
  const output = new Uint8Array(bytes.length + Math.ceil(bytes.length / 255) + 16);
  const previous = new Int32Array(65536).fill(-1);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let written = 0, cursor = 0, anchor = 0, misses = 0;
  const hash = (offset) => (Math.imul(view.getUint32(offset, true), 0x9e3779b1) >>> 16);
  const extra = (length) => {
    while (length >= 255) { output[written++] = 255; length -= 255; }
    output[written++] = length;
  };
  const emit = (end, distance, matchLength) => {
    const literals = end - anchor, match = distance ? matchLength - 4 : 0;
    output[written++] = (Math.min(literals, 15) << 4) | Math.min(match, 15);
    if (literals >= 15) extra(literals - 15);
    output.set(bytes.subarray(anchor, end), written); written += literals;
    if (distance) {
      output[written++] = distance & 255; output[written++] = distance >>> 8;
      if (match >= 15) extra(match - 15);
    }
  };
  while (cursor <= bytes.length - 12) {
    const key = hash(cursor), candidate = previous[key]; previous[key] = cursor;
    if (candidate < 0 || cursor - candidate > 65535 || view.getUint32(candidate, true) !== view.getUint32(cursor, true)) {
      cursor += 1 + (misses++ >>> 6); continue;
    }
    let length = 4;
    while (cursor + length < bytes.length - 5 && bytes[candidate + length] === bytes[cursor + length]) length++;
    emit(cursor, cursor - candidate, length);
    const end = cursor + length;
    // Accelerate incompressible spans and only seed the tail of a long match.
    // Scanning every skipped byte adds cost without changing the emitted match.
    if (end - 2 <= bytes.length - 12) previous[hash(end - 2)] = end - 2;
    misses = 0;
    cursor = anchor = end;
  }
  emit(bytes.length, 0, 0);
  return output.subarray(0, written);
}

export function compress(bytes) {
  checkInput(bytes);
  // Independent 4 MiB blocks preserve the existing frame family. Always checksum output.
  const blocks = [], size = BLOCK_SIZES[7];
  let length = 15; // Magic + descriptor + end mark + content checksum.
  for (let offset = 0; offset < bytes.length; offset += size) {
    const plain = bytes.subarray(offset, offset + size), packed = compressBlock(plain);
    const stored = packed.length >= plain.length;
    // Release oversized compression scratch; stored blocks already share the input.
    const data = stored ? plain : packed.slice();
    blocks.push({ data, stored }); length += 4 + data.length;
  }
  const output = new Uint8Array(length), view = new DataView(output.buffer);
  view.setUint32(0, MAGIC, true); output[4] = 0x64; output[5] = 0x70;
  output[6] = (xxhash32(output.subarray(4, 6)) >>> 8) & 255;
  let offset = 7;
  for (const { data, stored } of blocks) {
    view.setUint32(offset, data.length + (stored ? 0x80000000 : 0), true); offset += 4;
    output.set(data, offset); offset += data.length;
  }
  view.setUint32(offset + 4, xxhash32(bytes), true);
  return output;
}
