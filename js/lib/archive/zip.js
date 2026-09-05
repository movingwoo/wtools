// First-party ZIP reader/writer for classic (non-ZIP64) archives.
// Supports stored and DEFLATE entries, UTF-8/CP437 names, Info-ZIP Unicode
// path fields, optional data descriptors, and CRC-32 verification.

import { crc32, deflateRaw, inflateRaw } from './deflate.js';

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const DESCRIPTOR_SIGNATURE = 0x08074b50;
const EOCD_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const DESCRIPTOR_FLAG = 0x0008;
const UNSAFE_FLAGS = 0x2061; // traditional/strong encryption and patched data
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;
const DEFAULT_LIMITS = Object.freeze({
  maxEntries: 1000,
  maxTotalBytes: 256 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxRatio: 200,
});
const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const CP437_HIGH = Array.from(
  'ÇüéâäàåçêëèïîìÄÅ'
  + 'ÉæÆôöòûùÿÖÜ¢£¥₧ƒ'
  + 'áíóúñÑªº¿⌐¬½¼¡«»'
  + '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐'
  + '└┴┬├─┼╞╟╚╔╩╦╠═╬╧'
  + '╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀'
  + 'αßΓπΣσµτΦΘΩδ∞φε∩'
  + '≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ',
);

function asBytes(value, label = 'ZIP 입력') {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError(`${label}은 바이트 배열이어야 합니다.`);
}

function readU16(view, offset) {
  return view.getUint16(offset, true);
}

function readU32(view, offset) {
  return view.getUint32(offset, true);
}

function sameBytes(first, second) {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

function checkedAdd(...values) {
  const result = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(result) || result > UINT32_MAX)
    throw new Error('ZIP 크기가 32비트 형식 한도를 넘습니다. ZIP64는 지원하지 않습니다.');
  return result;
}

function normalizeLimits(values = {}) {
  const limits = { ...DEFAULT_LIMITS, ...values };
  for (const key of ['maxEntries', 'maxTotalBytes', 'maxEntryBytes', 'maxRatio']) {
    const value = Number(limits[key]);
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`ZIP ${key} 한도가 올바르지 않습니다.`);
    limits[key] = value;
  }
  return limits;
}

export function normalizeZipPath(value) {
  const original = String(value);
  const normalized = original.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/')
      || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').some((part) => part === '..')) {
    throw new Error(`안전하지 않은 아카이브 경로입니다: ${original || '(빈 이름)'}`);
  }
  return normalized;
}

function decodeUtf8(bytes, label) {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    throw new Error(`${label}의 UTF-8 인코딩이 올바르지 않습니다.`);
  }
}

function decodeCp437(bytes) {
  let output = '';
  for (const byte of bytes) output += byte < 0x80 ? String.fromCharCode(byte) : CP437_HIGH[byte - 0x80];
  return output;
}

function unicodePathFromExtra(extra, rawName, label) {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let offset = 0, path = null;
  while (offset < extra.length) {
    if (offset + 4 > extra.length) throw new Error(`${label}의 추가 필드가 잘렸습니다.`);
    const id = readU16(view, offset);
    const size = readU16(view, offset + 2);
    offset += 4;
    if (offset + size > extra.length) throw new Error(`${label}의 추가 필드 길이가 올바르지 않습니다.`);
    if (id === 0x7075 && size >= 5 && extra[offset] === 1) {
      const expected = readU32(view, offset + 1);
      if (expected === crc32(rawName)) path = decodeUtf8(extra.subarray(offset + 5, offset + size), label);
    }
    offset += size;
  }
  return path;
}

function decodeName(rawName, extra, flags, label) {
  if (flags & UTF8_FLAG) return decodeUtf8(rawName, label);
  return unicodePathFromExtra(extra, rawName, label) || decodeCp437(rawName);
}

function findEocd(bytes, view) {
  const start = Math.max(0, bytes.length - 22 - UINT16_MAX);
  for (let offset = bytes.length - 22; offset >= start; offset--) {
    if (readU32(view, offset) !== EOCD_SIGNATURE) continue;
    const commentLength = readU16(view, offset + 20);
    if (offset + 22 + commentLength === bytes.length) return offset;
  }
  throw new Error('ZIP 중앙 디렉터리를 찾지 못했습니다. 파일이 손상되었을 수 있습니다.');
}

function rejectUnsupported(flags, compression) {
  if (flags & UNSAFE_FLAGS) throw new Error('암호화되었거나 패치된 ZIP 항목은 안전하게 해제할 수 없습니다.');
  if (compression !== 0 && compression !== 8)
    throw new Error(`지원하지 않는 ZIP 압축 방식입니다: ${compression}`);
}

function descriptorSize(bytes, view, offset, entry, boundary) {
  const matches = (at) => at + 12 <= boundary
    && readU32(view, at) === entry.crc
    && readU32(view, at + 4) === entry.compressedSize
    && readU32(view, at + 8) === entry.size;
  if (offset + 16 <= boundary && readU32(view, offset) === DESCRIPTOR_SIGNATURE && matches(offset + 4)) return 16;
  if (matches(offset)) return 12;
  throw new Error(`ZIP 데이터 디스크립터 검증에 실패했습니다: ${entry.name}`);
}

function enforceLimits(entries, archiveSize, limits) {
  if (entries.length > limits.maxEntries)
    throw new Error(`아카이브 항목 수가 안전 한도 ${limits.maxEntries.toLocaleString()}개를 넘습니다.`);
  let total = 0;
  for (const entry of entries) {
    if (entry.size > limits.maxEntryBytes)
      throw new Error(`“${entry.name}”의 해제 크기가 항목 한도 ${(limits.maxEntryBytes / 1024 / 1024).toFixed(1)} MiB를 넘습니다.`);
    if (entry.size && entry.size / Math.max(1, entry.compressedSize) > limits.maxRatio)
      throw new Error(`“${entry.name}”의 예상 압축률이 안전 한도 ${limits.maxRatio}:1을 넘습니다. 압축 폭탄 가능성이 있어 중단했습니다.`);
    total += entry.size;
    if (total > limits.maxTotalBytes)
      throw new Error(`총 해제 크기가 안전 한도 ${(limits.maxTotalBytes / 1024 / 1024).toFixed(1)} MiB를 넘습니다.`);
  }
  if (total && total / Math.max(1, archiveSize) > limits.maxRatio)
    throw new Error(`예상 압축률이 안전 한도 ${limits.maxRatio}:1을 넘습니다. 압축 폭탄 가능성이 있어 중단했습니다.`);
  return total;
}

export function inspectZip(input, options = {}) {
  const bytes = asBytes(input);
  if (bytes.length < 22) throw new Error('올바른 ZIP 파일이 아니거나 파일이 잘렸습니다.');
  const limits = normalizeLimits(options.limits);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes, view);
  const disk = readU16(view, eocd + 4);
  const directoryDisk = readU16(view, eocd + 6);
  const diskCount = readU16(view, eocd + 8);
  const count = readU16(view, eocd + 10);
  const directorySize = readU32(view, eocd + 12);
  const directoryOffset = readU32(view, eocd + 16);
  if (disk || directoryDisk || diskCount !== count) throw new Error('여러 디스크로 나뉜 ZIP은 지원하지 않습니다.');
  if (count === UINT16_MAX || directorySize === UINT32_MAX || directoryOffset === UINT32_MAX)
    throw new Error('ZIP64 형식은 이 도구의 안전 해제 범위에서 지원하지 않습니다.');
  if (directoryOffset + directorySize > eocd)
    throw new Error('ZIP 중앙 디렉터리 범위가 올바르지 않습니다.');
  if (count > limits.maxEntries)
    throw new Error(`아카이브 항목 수가 안전 한도 ${limits.maxEntries.toLocaleString()}개를 넘습니다.`);

  const entries = [];
  const names = new Set();
  let offset = directoryOffset;
  const directoryEnd = directoryOffset + directorySize;
  for (let index = 0; index < count; index++) {
    const label = `ZIP ${index + 1}번째 중앙 디렉터리 항목`;
    if (offset + 46 > directoryEnd || readU32(view, offset) !== CENTRAL_SIGNATURE)
      throw new Error(`${label}이 손상되었습니다.`);
    const versionMade = readU16(view, offset + 4);
    const flags = readU16(view, offset + 8);
    const compression = readU16(view, offset + 10);
    const crc = readU32(view, offset + 16);
    const compressedSize = readU32(view, offset + 20);
    const size = readU32(view, offset + 24);
    const nameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const diskStart = readU16(view, offset + 34);
    const externalAttributes = readU32(view, offset + 38);
    const localOffset = readU32(view, offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > directoryEnd) throw new Error(`${label}이 잘렸습니다.`);
    if ([compressedSize, size, localOffset].includes(UINT32_MAX))
      throw new Error('ZIP64 형식은 이 도구의 안전 해제 범위에서 지원하지 않습니다.');
    if (diskStart) throw new Error('여러 디스크로 나뉜 ZIP은 지원하지 않습니다.');
    rejectUnsupported(flags, compression);
    const rawName = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const extra = bytes.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
    const name = normalizeZipPath(decodeName(rawName, extra, flags, label));
    if (names.has(name)) throw new Error(`중복된 ZIP 항목 이름은 덮어쓰기 위험 때문에 해제하지 않습니다: ${name}`);
    names.add(name);
    const host = versionMade >>> 8;
    const unixType = host === 3 ? (externalAttributes >>> 16) & 0xf000 : 0;
    if (unixType === 0xa000) throw new Error(`심볼릭 링크 ZIP 항목은 안전하게 해제하지 않습니다: ${name}`);
    const directory = name.endsWith('/');
    if (directory && size) throw new Error(`ZIP 디렉터리 항목의 크기가 0이 아닙니다: ${name}`);
    entries.push({
      name, size, compressedSize, crc, compression, flags, directory,
      utf8: !!(flags & UTF8_FLAG), localOffset, rawName: rawName.slice(),
    });
    offset = next;
  }
  if (offset !== directoryEnd) throw new Error('ZIP 중앙 디렉터리 크기와 항목 목록이 일치하지 않습니다.');
  enforceLimits(entries, bytes.length, limits);

  const ranges = [];
  for (const entry of entries) {
    const local = entry.localOffset;
    if (local + 30 > directoryOffset || readU32(view, local) !== LOCAL_SIGNATURE)
      throw new Error(`ZIP 로컬 헤더가 손상되었습니다: ${entry.name}`);
    const flags = readU16(view, local + 6);
    const compression = readU16(view, local + 8);
    const localCrc = readU32(view, local + 14);
    const localCompressedSize = readU32(view, local + 18);
    const localSize = readU32(view, local + 22);
    const nameLength = readU16(view, local + 26);
    const extraLength = readU16(view, local + 28);
    const dataOffset = local + 30 + nameLength + extraLength;
    if (dataOffset > directoryOffset) throw new Error(`ZIP 로컬 헤더가 잘렸습니다: ${entry.name}`);
    if (flags !== entry.flags || compression !== entry.compression)
      throw new Error(`ZIP 로컬 헤더와 중앙 디렉터리가 일치하지 않습니다: ${entry.name}`);
    const localName = bytes.subarray(local + 30, local + 30 + nameLength);
    if (!sameBytes(localName, entry.rawName))
      throw new Error(`ZIP 로컬 파일명과 중앙 디렉터리가 일치하지 않습니다: ${entry.name}`);
    if ([localCompressedSize, localSize].includes(UINT32_MAX))
      throw new Error('ZIP64 형식은 이 도구의 안전 해제 범위에서 지원하지 않습니다.');
    if (!(flags & DESCRIPTOR_FLAG)
        && (localCrc !== entry.crc || localCompressedSize !== entry.compressedSize || localSize !== entry.size))
      throw new Error(`ZIP 로컬 헤더의 크기 또는 CRC-32가 중앙 디렉터리와 다릅니다: ${entry.name}`);
    if (flags & DESCRIPTOR_FLAG
        && ((localCrc && localCrc !== entry.crc)
          || (localCompressedSize && localCompressedSize !== entry.compressedSize)
          || (localSize && localSize !== entry.size)))
      throw new Error(`ZIP 데이터 디스크립터와 로컬 헤더 값이 일치하지 않습니다: ${entry.name}`);
    const dataEnd = dataOffset + entry.compressedSize;
    if (dataEnd > directoryOffset) throw new Error(`ZIP 항목 데이터가 잘렸습니다: ${entry.name}`);
    const descriptorLength = flags & DESCRIPTOR_FLAG
      ? descriptorSize(bytes, view, dataEnd, entry, directoryOffset) : 0;
    entry.dataOffset = dataOffset;
    entry.dataEnd = dataEnd;
    entry.descriptor = !!descriptorLength;
    ranges.push({ start: local, end: dataEnd + descriptorLength, name: entry.name });
  }
  ranges.sort((first, second) => first.start - second.start);
  for (let index = 1; index < ranges.length; index++) {
    if (ranges[index].start < ranges[index - 1].end)
      throw new Error(`ZIP 항목 범위가 서로 겹칩니다: ${ranges[index].name}`);
  }
  return { entries, directoryOffset, directorySize, commentLength: bytes.length - eocd - 22 };
}

export function extractZip(input, options = {}) {
  const bytes = asBytes(input);
  const inspected = inspectZip(bytes, options);
  const result = [];
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  for (let index = 0; index < inspected.entries.length; index++) {
    const entry = inspected.entries[index];
    const body = bytes.subarray(entry.dataOffset, entry.dataEnd);
    let data;
    if (entry.compression === 0) {
      if (entry.compressedSize !== entry.size)
        throw new Error(`저장 방식 ZIP 항목의 압축·원본 크기가 다릅니다: ${entry.name}`);
      data = body.slice();
    } else {
      try {
        data = inflateRaw(body, { maxOutputLength: entry.size });
      } catch (error) {
        if (error?.message?.includes('안전 한도')) throw error;
        throw new Error(`ZIP 항목을 해제하지 못했습니다: ${entry.name} (${error?.message || error})`);
      }
    }
    if (data.length !== entry.size)
      throw new Error(`ZIP 항목 크기가 중앙 디렉터리와 다릅니다: ${entry.name}`);
    if (crc32(data) !== entry.crc) throw new Error(`ZIP CRC-32 검증에 실패했습니다: ${entry.name}`);
    result.push({
      name: entry.name, size: entry.size, compressedSize: entry.compressedSize,
      directory: entry.directory, utf8: entry.utf8, descriptor: entry.descriptor, data,
    });
    onProgress({ phase: 'extract', completed: index + 1, total: inspected.entries.length });
  }
  return result;
}

function dosDateTime(value) {
  const candidate = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  const date = Number.isFinite(candidate.getTime()) ? candidate : new Date();
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = year === date.getFullYear() ? date.getMonth() + 1 : 1;
  const day = year === date.getFullYear() ? date.getDate() : 1;
  const time = year === date.getFullYear()
    ? (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >>> 1) : 0;
  return { date: ((year - 1980) << 9) | (month << 5) | day, time };
}

function writeLocal(view, offset, entry) {
  view.setUint32(offset, LOCAL_SIGNATURE, true);
  view.setUint16(offset + 4, 20, true);
  view.setUint16(offset + 6, UTF8_FLAG, true);
  view.setUint16(offset + 8, entry.compression, true);
  view.setUint16(offset + 10, entry.time, true);
  view.setUint16(offset + 12, entry.date, true);
  view.setUint32(offset + 14, entry.crc, true);
  view.setUint32(offset + 18, entry.compressedSize, true);
  view.setUint32(offset + 22, entry.size, true);
  view.setUint16(offset + 26, entry.nameBytes.length, true);
  view.setUint16(offset + 28, 0, true);
}

function writeCentral(view, offset, entry) {
  view.setUint32(offset, CENTRAL_SIGNATURE, true);
  view.setUint16(offset + 4, 0x0314, true); // PKZIP 2.0, Unix host attributes.
  view.setUint16(offset + 6, 20, true);
  view.setUint16(offset + 8, UTF8_FLAG, true);
  view.setUint16(offset + 10, entry.compression, true);
  view.setUint16(offset + 12, entry.time, true);
  view.setUint16(offset + 14, entry.date, true);
  view.setUint32(offset + 16, entry.crc, true);
  view.setUint32(offset + 20, entry.compressedSize, true);
  view.setUint32(offset + 24, entry.size, true);
  view.setUint16(offset + 28, entry.nameBytes.length, true);
  view.setUint16(offset + 30, 0, true);
  view.setUint16(offset + 32, 0, true);
  view.setUint16(offset + 34, 0, true);
  view.setUint16(offset + 36, 0, true);
  const mode = entry.directory ? 0x41ed : 0x81a4;
  view.setUint32(offset + 38, (mode * 0x10000 + (entry.directory ? 0x10 : 0)) >>> 0, true);
  view.setUint32(offset + 42, entry.localOffset, true);
}

export function createZip(inputEntries, options = {}) {
  if (!Array.isArray(inputEntries)) throw new TypeError('ZIP 항목 목록은 배열이어야 합니다.');
  const limits = normalizeLimits(options.limits);
  if (inputEntries.length > Math.min(UINT16_MAX - 1, limits.maxEntries))
    throw new Error(`아카이브 항목 수가 안전 한도 ${Math.min(UINT16_MAX - 1, limits.maxEntries).toLocaleString()}개를 넘습니다.`);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const level = Math.max(1, Math.min(9, Number(options.level) || 6));
  const names = new Set();
  const entries = [];
  let total = 0;
  for (let index = 0; index < inputEntries.length; index++) {
    const source = inputEntries[index] || {};
    const name = normalizeZipPath(source.name);
    if (names.has(name)) throw new Error(`중복된 ZIP 항목 이름은 만들 수 없습니다: ${name}`);
    names.add(name);
    const directory = name.endsWith('/');
    const data = asBytes(source.data ?? new Uint8Array(), `ZIP 항목 “${name}”`);
    if (directory && data.length) throw new Error(`ZIP 디렉터리 항목의 크기가 0이 아닙니다: ${name}`);
    if (data.length > limits.maxEntryBytes)
      throw new Error(`“${name}”의 크기가 항목 한도 ${(limits.maxEntryBytes / 1024 / 1024).toFixed(1)} MiB를 넘습니다.`);
    total += data.length;
    if (total > limits.maxTotalBytes)
      throw new Error(`총 입력 크기가 안전 한도 ${(limits.maxTotalBytes / 1024 / 1024).toFixed(1)} MiB를 넘습니다.`);
    const nameBytes = UTF8_ENCODER.encode(name);
    if (nameBytes.length > UINT16_MAX) throw new Error(`ZIP 파일명이 너무 깁니다: ${name}`);
    const packed = directory || !data.length ? new Uint8Array() : deflateRaw(data, { level });
    const compressed = packed.length < data.length;
    const body = compressed ? packed : data;
    const timestamp = dosDateTime(source.mtime);
    entries.push({
      name, nameBytes, directory, body, compression: compressed ? 8 : 0,
      size: data.length, compressedSize: body.length, crc: crc32(data), ...timestamp,
    });
    onProgress({ phase: 'compress', completed: index + 1, total: inputEntries.length });
  }

  let localSize = 0, centralSize = 0;
  for (const entry of entries) {
    entry.localOffset = localSize;
    localSize = checkedAdd(localSize, 30, entry.nameBytes.length, entry.compressedSize);
    centralSize = checkedAdd(centralSize, 46, entry.nameBytes.length);
  }
  const archiveSize = checkedAdd(localSize, centralSize, 22);
  const output = new Uint8Array(archiveSize);
  const view = new DataView(output.buffer);
  let offset = 0;
  for (const entry of entries) {
    writeLocal(view, offset, entry);
    offset += 30;
    output.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;
    output.set(entry.body, offset);
    offset += entry.compressedSize;
  }
  const directoryOffset = offset;
  for (const entry of entries) {
    writeCentral(view, offset, entry);
    offset += 46;
    output.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;
  }
  view.setUint32(offset, EOCD_SIGNATURE, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, directoryOffset, true);
  view.setUint16(offset + 20, 0, true);
  return output;
}
