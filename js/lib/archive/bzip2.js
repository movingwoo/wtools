// bzip2 stream reader: Huffman, run-length MTF, inverse BWT, RLE and CRC-32/BZIP2.
import { RANDOM_NUMBERS } from './bzip2-random.js';

const INPUT_LIMIT = 256 * 1024 * 1024, OUTPUT_LIMIT = 128 * 1024 * 1024;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, byte) => {
  let value = byte << 24;
  for (let i = 0; i < 8; i++) value = (value << 1) ^ (value < 0 ? 0x04c11db7 : 0);
  return value >>> 0;
});

export function decompress(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Bzip2 입력은 바이트 배열이어야 합니다.');
  if (bytes.length > INPUT_LIMIT) throw new Error('Bzip2 입력이 안전 한도 256 MiB를 넘습니다.');
  const maxOutputLength = options.maxOutputLength ?? Math.min(OUTPUT_LIMIT, bytes.length * 200);
  if (!Number.isSafeInteger(maxOutputLength) || maxOutputLength < 0 || maxOutputLength > OUTPUT_LIMIT)
    throw new Error('Bzip2 해제 한도는 0~128 MiB의 정수여야 합니다.');
  let bit = 0, buffered = 0, buffer = 0, position = 0, used = 0, output = new Uint8Array(0);
  const fail = (message) => { throw new Error(`Bzip2 비트 ${bit}: ${message}`); };
  const peek = (count) => {
    if (bit + count > bytes.length * 8) fail('데이터가 잘렸습니다.');
    while (buffered < count) { buffer = (buffer << 8) | bytes[position++]; buffered += 8; }
    return (buffer >>> (buffered - count)) & ((1 << count) - 1);
  };
  const read = (count) => {
    // Two halves keep the accumulator within 31 bits, including prefetched Huffman bits.
    if (count === 32) return read(16) * 65536 + read(16);
    const value = peek(count);
    buffered -= count; bit += count;
    return value;
  };
  const reserve = (count) => {
    const next = used + count;
    if (next > maxOutputLength) fail('해제 결과가 크기 또는 압축률 안전 한도를 넘습니다.');
    if (next > output.length) {
      const replacement = new Uint8Array(Math.min(maxOutputLength, Math.max(next, 65536, output.length * 2)));
      replacement.set(output.subarray(0, used)); output = replacement;
    }
  };
  do {
    if (read(24) !== 0x425a68) fail('Bzip2 헤더가 올바르지 않습니다.');
    const level = read(8) - 48;
    if (level < 1 || level > 9) fail('블록 크기는 1~9여야 합니다.');
    const blockLimit = level * 100000;
    let combinedCrc = 0;
    for (;;) {
      const marker = read(24), markerTail = read(24);
      if (marker === 0x177245 && markerTail === 0x385090) {
        if (read(32) !== combinedCrc) fail('스트림 체크섬이 일치하지 않습니다.');
        if (bit & 7) { if (read(8 - (bit & 7))) fail('끝 패딩이 올바르지 않습니다.'); }
        break;
      }
      if (marker !== 0x314159 || markerTail !== 0x265359) fail('블록 매직이 올바르지 않습니다.');
      const expectedCrc = read(32), randomized = read(1), primary = read(24);
      const groupsUsed = read(16), alphabet = [];
      for (let group = 0; group < 16; group++) {
        if (!(groupsUsed & (0x8000 >>> group))) continue;
        const mask = read(16);
        for (let j = 0; j < 16; j++) if (mask & (0x8000 >>> j)) alphabet.push(group * 16 + j);
      }
      if (!alphabet.length) fail('사용 문자 집합이 비어 있습니다.');
      const groupCount = read(3), selectorCount = read(15);
      if (groupCount < 2 || groupCount > 6 || !selectorCount) fail('Huffman 그룹 또는 선택자 수가 올바르지 않습니다.');
      const selectors = new Uint8Array(selectorCount), order = Array.from({ length: groupCount }, (_, i) => i);
      for (let i = 0; i < selectorCount; i++) {
        let index = 0;
        while (read(1)) { if (++index >= groupCount) fail('Huffman 선택자가 올바르지 않습니다.'); }
        const group = order.splice(index, 1)[0]; order.unshift(group); selectors[i] = group;
      }
      const symbolCount = alphabet.length + 2, tables = [];
      for (let group = 0; group < groupCount; group++) {
        let length = read(5);
        const lengths = new Uint8Array(symbolCount), counts = new Uint16Array(21);
        for (let i = 0; i < symbolCount; i++) {
          for (;;) {
            if (length < 1 || length > 20) fail('Huffman 코드 길이가 올바르지 않습니다.');
            if (!read(1)) break;
            length += read(1) ? -1 : 1;
          }
          lengths[i] = length; counts[length]++;
        }
        const first = new Uint32Array(21), start = new Uint16Array(21), sorted = [];
        let code = 0;
        for (let n = 1; n <= 20; n++) {
          code = (code + counts[n - 1]) * 2;
          if (code + counts[n] > 2 ** n) fail('Huffman 코드가 겹칩니다.');
          first[n] = code; start[n] = sorted.length;
          for (let i = 0; i < symbolCount; i++) if (lengths[i] === n) sorted.push(i);
        }
        const lookup = new Uint16Array(1024);
        for (let n = 1; n <= 10; n++) {
          for (let i = 0; i < counts[n]; i++) {
            const prefix = (first[n] + i) << (10 - n);
            lookup.fill((sorted[start[n] + i] << 5) | n, prefix, prefix + (1 << (10 - n)));
          }
        }
        tables.push({ first, start, counts, sorted, lookup });
      }
      let symbolsRead = 0, table;
      const symbol = () => {
        if (symbolsRead % 50 === 0) {
          const index = symbolsRead / 50;
          if (index >= selectorCount) fail('Huffman 선택자가 부족합니다.');
          table = tables[selectors[index]];
        }
        symbolsRead++;
        const entry = table.lookup[peek(10)];
        if (entry) {
          const length = entry & 31;
          buffered -= length; bit += length;
          return entry >>> 5;
        }
        let code = read(10);
        for (let length = 11; length <= 20; length++) {
          code = code * 2 + read(1);
          const index = code - table.first[length];
          if (index >= 0 && index < table.counts[length]) return table.sorted[table.start[length] + index];
        }
        fail('Huffman 코드가 올바르지 않습니다.');
      };
      const column = new Uint8Array(blockLimit), frequencies = new Uint32Array(256), mtf = Uint8Array.from(alphabet);
      let count = 0, token = symbol();
      const append = (byte, length) => {
        if (length > blockLimit - count) fail('복원 블록이 선언된 크기를 넘습니다.');
        column.fill(byte, count, count + length); count += length; frequencies[byte] += length;
      };
      while (token !== symbolCount - 1) {
        if (token < 2) {
          let length = 0, weight = 1;
          do {
            length += (token + 1) * weight;
            if (length > blockLimit - count) fail('반복 길이가 블록 한도를 넘습니다.');
            weight *= 2; token = symbol();
          } while (token < 2);
          append(mtf[0], length);
        } else {
          const index = token - 1;
          if (index >= alphabet.length) fail('문자 순위가 올바르지 않습니다.');
          const byte = mtf[index];
          if (index < 16) { for (let i = index; i > 0; i--) mtf[i] = mtf[i - 1]; }
          else mtf.copyWithin(1, 0, index);
          mtf[0] = byte;
          if (count === blockLimit) fail('복원 블록이 선언된 크기를 넘습니다.');
          column[count++] = byte; frequencies[byte]++;
          token = symbol();
        }
      }
      if (!count || primary >= count) fail('BWT 시작 위치가 올바르지 않습니다.');
      const starts = new Uint32Array(256);
      for (let i = 1; i < 256; i++) starts[i] = starts[i - 1] + frequencies[i - 1];
      const next = new Uint32Array(count);
      // The block ceiling fits each BWT row and its byte in one 32-bit entry.
      for (let i = 0; i < count; i++) next[starts[column[i]]++] = (i << 8) | column[i];
      let row = primary, randomIndex = 0, randomRemaining = 0;
      let crc = 0xffffffff, previous = -1, repeats = 0;
      for (let i = 0; i < count; i++) {
        const entry = next[row];
        let byte = entry & 255; row = entry >>> 8;
        if (randomized) {
          if (!randomRemaining) { randomRemaining = RANDOM_NUMBERS[randomIndex]; randomIndex = (randomIndex + 1) & 511; }
          randomRemaining--;
          if (randomRemaining === 1) byte ^= 1;
        }
        if (repeats === 4) {
          reserve(byte); output.fill(previous, used, used + byte); used += byte;
          for (let j = 0; j < byte; j++) crc = (crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ previous) & 255];
          repeats = 0; previous = -1;
        } else {
          if (used === output.length) reserve(1);
          output[used++] = byte;
          crc = (crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 255];
          repeats = byte === previous ? repeats + 1 : 1; previous = byte;
        }
      }
      if (repeats === 4) fail('반복 횟수 데이터가 잘렸습니다.');
      crc = (~crc) >>> 0;
      if (crc !== expectedCrc) fail('블록 체크섬이 일치하지 않습니다.');
      combinedCrc = (((combinedCrc << 1) | (combinedCrc >>> 31)) ^ crc) >>> 0;
    }
  } while (bit < bytes.length * 8);
  return output.slice(0, used);
}
