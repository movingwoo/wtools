function joinChunks(chunks) {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export function readExif(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let tiff = null;
  let offset = 2;
  while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === 'Exif') {
      tiff = offset + 10;
      break;
    }
    offset += 2 + length;
  }
  if (tiff == null || tiff + 8 > bytes.length) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset + tiff, bytes.byteLength - tiff);
  const littleEndian = view.getUint16(0) === 0x4949;
  const uint16 = (position) => view.getUint16(position, littleEndian);
  const uint32 = (position) => view.getUint32(position, littleEndian);
  const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  function readValue(type, count, position) {
    if (type === 2) {
      let value = '';
      for (let index = 0; index < count; index++) {
        const code = view.getUint8(position + index);
        if (!code) break;
        value += String.fromCharCode(code);
      }
      return value.trim();
    }
    const readNumber = (index) =>
      type === 3 ? uint16(index) : type === 4 ? uint32(index) :
      type === 9 ? view.getInt32(index, littleEndian) :
      type === 5 ? uint32(index) / (uint32(index + 4) || 1) :
      type === 10 ? view.getInt32(index, littleEndian) /
        (view.getInt32(index + 4, littleEndian) || 1) : view.getUint8(index);
    const values = [];
    for (let index = 0; index < Math.min(count, 16); index++)
      values.push(readNumber(position + index * typeSizes[type]));
    return count === 1 ? values[0] : values;
  }

  function readIfd(position) {
    const entries = {};
    if (position + 2 > view.byteLength) return entries;
    const count = uint16(position);
    for (let index = 0; index < count; index++) {
      const base = position + 2 + index * 12;
      if (base + 12 > view.byteLength) break;
      const tag = uint16(base);
      const type = uint16(base + 2);
      const itemCount = uint32(base + 4);
      if (!typeSizes[type]) continue;
      const size = typeSizes[type] * itemCount;
      const valueOffset = size <= 4 ? base + 8 : uint32(base + 8);
      if (valueOffset + size > view.byteLength) continue;
      entries[tag] = readValue(type, itemCount, valueOffset);
    }
    return entries;
  }

  const ifd0 = readIfd(uint32(4));
  return {
    ifd0,
    exif: ifd0[0x8769] != null ? readIfd(ifd0[0x8769]) : {},
    gps: ifd0[0x8825] != null ? readIfd(ifd0[0x8825]) : {},
  };
}

export function stripJpegMetadata(bytes) {
  const kept = [bytes.subarray(0, 2)];
  const removed = [];
  const metadataMarkers = { 0xe1: 'APP1', 0xed: 'APP13', 0xfe: 'COM' };
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) {
      kept.push(bytes.subarray(offset));
      break;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const label = metadataMarkers[marker];
    if (label) {
      if (!removed.includes(label)) removed.push(label);
    } else {
      kept.push(bytes.subarray(offset, offset + 2 + length));
    }
    offset += 2 + length;
  }
  return { bytes: joinChunks(kept), removed };
}

export function stripPngMetadata(bytes) {
  const kept = [bytes.subarray(0, 8)];
  const removed = [];
  const metadataChunks = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = (
      (bytes[offset] << 24) | (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) | bytes[offset + 3]
    ) >>> 0;
    const type = String.fromCharCode(
      bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7],
    );
    if (metadataChunks.has(type)) {
      if (!removed.includes(type)) removed.push(type);
    } else {
      kept.push(bytes.subarray(offset, offset + 12 + length));
    }
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return { bytes: joinChunks(kept), removed };
}

export function buildIco(pngs, sizes) {
  let offset = 6 + 16 * pngs.length;
  const output = new Uint8Array(offset + pngs.reduce((total, png) => total + png.length, 0));
  const view = new DataView(output.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, pngs.length, true);
  pngs.forEach((png, index) => {
    const entry = 6 + index * 16;
    output[entry] = sizes[index] >= 256 ? 0 : sizes[index];
    output[entry + 1] = sizes[index] >= 256 ? 0 : sizes[index];
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    output.set(png, offset);
    offset += png.length;
  });
  return output;
}
