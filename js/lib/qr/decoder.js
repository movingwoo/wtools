// QR Code Model 2 detector and decoder. DOM-independent and browser-native.
import {
  qrAlignmentPositions, qrBlockInfo, qrFunctionModules, qrMaskBit,
} from './encoder.js';

const FORMAT_LEVELS = ['M', 'L', 'H', 'Q'];
const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

{
  let value = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = value;
    GF_LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < GF_EXP.length; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMultiply(left, right) {
  return left && right ? GF_EXP[GF_LOG[left] + GF_LOG[right]] : 0;
}

function gfDivide(left, right) {
  if (!right) throw new Error('QR Reed–Solomon 계산에서 0으로 나눌 수 없습니다.');
  if (!left) return 0;
  return GF_EXP[(GF_LOG[left] - GF_LOG[right] + 255) % 255];
}

function alphaPower(power) {
  return GF_EXP[((power % 255) + 255) % 255];
}

function polynomialValue(coefficients, value) {
  let result = 0;
  for (let i = coefficients.length - 1; i >= 0; i--)
    result = gfMultiply(result, value) ^ coefficients[i];
  return result;
}

function syndromes(codewords, count) {
  const result = new Uint8Array(count);
  for (let degree = 0; degree < count; degree++) {
    const point = alphaPower(degree);
    let value = 0;
    for (const codeword of codewords) value = gfMultiply(value, point) ^ codeword;
    result[degree] = value;
  }
  return result;
}

function errorLocator(values) {
  const capacity = values.length + 1;
  let current = new Uint8Array(capacity);
  let previous = new Uint8Array(capacity);
  current[0] = previous[0] = 1;
  let length = 0, shift = 1, lastDiscrepancy = 1;

  for (let index = 0; index < values.length; index++) {
    let discrepancy = values[index];
    for (let i = 1; i <= length; i++) discrepancy ^= gfMultiply(current[i], values[index - i]);
    if (!discrepancy) {
      shift++;
      continue;
    }
    const saved = current.slice();
    const scale = gfDivide(discrepancy, lastDiscrepancy);
    for (let i = 0; i + shift < capacity; i++) {
      if (previous[i]) current[i + shift] ^= gfMultiply(scale, previous[i]);
    }
    if (length * 2 <= index) {
      length = index + 1 - length;
      previous = saved;
      lastDiscrepancy = discrepancy;
      shift = 1;
    } else shift++;
  }
  return current.slice(0, length + 1);
}

function solveMagnitudes(values, locations) {
  const count = locations.length;
  const rows = Array.from({ length: count }, (_, row) => {
    const result = new Uint8Array(count + 1);
    for (let column = 0; column < count; column++)
      result[column] = alphaPower(row * locations[column]);
    result[count] = values[row];
    return result;
  });

  for (let column = 0; column < count; column++) {
    let pivot = column;
    while (pivot < count && !rows[pivot][column]) pivot++;
    if (pivot === count) throw new Error('QR 오류 위치의 값을 계산할 수 없습니다.');
    if (pivot !== column) [rows[pivot], rows[column]] = [rows[column], rows[pivot]];
    const divisor = rows[column][column];
    for (let i = column; i <= count; i++) rows[column][i] = gfDivide(rows[column][i], divisor);
    for (let row = 0; row < count; row++) {
      if (row === column || !rows[row][column]) continue;
      const scale = rows[row][column];
      for (let i = column; i <= count; i++) rows[row][i] ^= gfMultiply(scale, rows[column][i]);
    }
  }
  return Uint8Array.from(rows, (row) => row[count]);
}

function correctBlock(input, errorCount) {
  const codewords = input.slice();
  const values = syndromes(codewords, errorCount);
  if (values.every((value) => value === 0)) return { codewords, corrected: 0 };

  const locator = errorLocator(values);
  const maximum = Math.floor(errorCount / 2);
  const errors = locator.length - 1;
  if (!errors || errors > maximum) throw new Error('QR 오류 복원 한도를 넘었습니다.');
  const positions = [];
  const locations = [];
  for (let position = 0; position < codewords.length; position++) {
    const location = codewords.length - 1 - position;
    if (polynomialValue(locator, alphaPower(-location)) === 0) {
      positions.push(position);
      locations.push(location);
    }
  }
  if (positions.length !== errors) throw new Error('QR 오류 위치를 모두 찾지 못했습니다.');
  const magnitudes = solveMagnitudes(values, locations);
  for (let i = 0; i < positions.length; i++) codewords[positions[i]] ^= magnitudes[i];
  if (!syndromes(codewords, errorCount).every((value) => value === 0))
    throw new Error('QR Reed–Solomon 오류 복원에 실패했습니다.');
  return { codewords, corrected: errors };
}

function bchRemainder(value, polynomial, steps) {
  let remainder = value;
  for (let i = 0; i < steps; i++) remainder = (remainder << 1) ^ ((remainder >>> (steps - 1)) * polynomial);
  return remainder;
}

function hammingDistance(left, right) {
  let value = left ^ right, count = 0;
  while (value) { count++; value &= value - 1; }
  return count;
}

function readFormat(matrix) {
  const size = matrix.length;
  let first = 0, second = 0;
  const put = (target, index, row, column) => target | ((matrix[row][column] ? 1 : 0) << index);
  for (let i = 0; i <= 5; i++) first = put(first, i, i, 8);
  first = put(first, 6, 7, 8);
  first = put(first, 7, 8, 8);
  first = put(first, 8, 8, 7);
  for (let i = 9; i < 15; i++) first = put(first, i, 8, 14 - i);
  for (let i = 0; i < 8; i++) second = put(second, i, 8, size - 1 - i);
  for (let i = 8; i < 15; i++) second = put(second, i, size - 15 + i, 8);

  let best = null;
  for (let data = 0; data < 32; data++) {
    const encoded = ((data << 10) | bchRemainder(data, 0x537, 10)) ^ 0x5412;
    const distance = Math.min(hammingDistance(first, encoded), hammingDistance(second, encoded));
    if (!best || distance < best.distance) best = { data, distance };
  }
  if (best.distance > 3) throw new Error('QR 형식 정보를 복원할 수 없습니다.');
  return { level: FORMAT_LEVELS[best.data >>> 3], mask: best.data & 7 };
}

function extractCodewords(matrix, version, mask, expected) {
  const functions = qrFunctionModules(version);
  const bits = [];
  const size = matrix.length;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let vertical = 0; vertical < size; vertical++) {
      const row = upward ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset++) {
        const column = right - offset;
        if (functions[row][column]) continue;
        bits.push((matrix[row][column] ? 1 : 0) ^ (qrMaskBit(mask, row, column) ? 1 : 0));
      }
    }
    upward = !upward;
  }
  if (bits.length < expected * 8) throw new Error('QR 데이터 모듈 수가 부족합니다.');
  const result = new Uint8Array(expected);
  for (let i = 0; i < result.length * 8; i++) result[i >>> 3] |= bits[i] << (7 - (i & 7));
  return result;
}

function restoreData(raw, version, level) {
  const specs = qrBlockInfo(version, level);
  const blocks = specs.map((spec) => new Uint8Array(spec.total));
  const maximumData = Math.max(...specs.map((spec) => spec.data));
  const maximumError = Math.max(...specs.map((spec) => spec.total - spec.data));
  let offset = 0;
  for (let index = 0; index < maximumData; index++) {
    for (let block = 0; block < blocks.length; block++) {
      if (index < specs[block].data) blocks[block][index] = raw[offset++];
    }
  }
  for (let index = 0; index < maximumError; index++) {
    for (let block = 0; block < blocks.length; block++) {
      if (index < specs[block].total - specs[block].data)
        blocks[block][specs[block].data + index] = raw[offset++];
    }
  }
  if (offset !== raw.length) throw new Error('QR 코드워드 블록 구성이 올바르지 않습니다.');

  const output = new Uint8Array(specs.reduce((sum, spec) => sum + spec.data, 0));
  let outputOffset = 0, corrected = 0;
  for (let i = 0; i < blocks.length; i++) {
    const restored = correctBlock(blocks[i], specs[i].total - specs[i].data);
    output.set(restored.codewords.subarray(0, specs[i].data), outputOffset);
    outputOffset += specs[i].data;
    corrected += restored.corrected;
  }
  return { bytes: output, corrected };
}

class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
  }

  get available() { return this.bytes.length * 8 - this.offset; }

  read(count) {
    if (!Number.isInteger(count) || count < 0 || count > 31 || count > this.available)
      throw new Error('QR 데이터가 중간에서 끝났습니다.');
    let value = 0;
    for (let i = 0; i < count; i++) {
      value = value * 2 + ((this.bytes[this.offset >>> 3] >>> (7 - (this.offset & 7))) & 1);
      this.offset++;
    }
    return value;
  }
}

function countBits(mode, version) {
  const group = version < 10 ? 0 : version < 27 ? 1 : 2;
  if (mode === 1) return [10, 12, 14][group];
  if (mode === 2) return [9, 11, 13][group];
  if (mode === 4) return [8, 16, 16][group];
  if (mode === 8) return [8, 10, 12][group];
  throw new Error('지원하지 않는 QR 데이터 모드입니다.');
}

function decodeBytes(bytes, eci) {
  let encoding = 'utf-8';
  if (eci === 3) encoding = 'iso-8859-1';
  else if (eci === 20) encoding = 'shift_jis';
  else if (eci != null && eci !== 26) throw new Error(`지원하지 않는 QR ECI 문자 집합입니다 (${eci}).`);
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch {
    if (eci == null) return new TextDecoder('iso-8859-1').decode(bytes);
    return new TextDecoder(encoding).decode(bytes);
  }
}

function readEci(reader) {
  const first = reader.read(8);
  if (!(first & 0x80)) return first & 0x7f;
  if (!(first & 0x40)) return ((first & 0x3f) << 8) | reader.read(8);
  if (!(first & 0x20)) return ((first & 0x1f) << 16) | reader.read(16);
  throw new Error('QR ECI 지정자가 올바르지 않습니다.');
}

function parseData(bytes, version) {
  const reader = new BitReader(bytes);
  const parts = [];
  const binary = [];
  let eci = null, fnc1 = false;
  while (reader.available >= 4) {
    const mode = reader.read(4);
    if (mode === 0) break;
    if (mode === 7) { eci = readEci(reader); continue; }
    if (mode === 3) { reader.read(16); continue; } // Structured Append metadata
    if (mode === 5 || mode === 9) { fnc1 = true; continue; }
    if (![1, 2, 4, 8].includes(mode)) throw new Error(`지원하지 않는 QR 데이터 모드입니다 (${mode}).`);
    let length = reader.read(countBits(mode, version));
    if (mode === 1) {
      let text = '';
      while (length >= 3) {
        const value = reader.read(10);
        if (value >= 1000) throw new Error('QR 숫자 데이터가 올바르지 않습니다.');
        text += String(value).padStart(3, '0'); length -= 3;
      }
      if (length === 2) {
        const value = reader.read(7);
        if (value >= 100) throw new Error('QR 숫자 데이터가 올바르지 않습니다.');
        text += String(value).padStart(2, '0');
      } else if (length === 1) {
        const value = reader.read(4);
        if (value >= 10) throw new Error('QR 숫자 데이터가 올바르지 않습니다.');
        text += String(value);
      }
      parts.push(text);
    } else if (mode === 2) {
      let text = '';
      while (length >= 2) {
        const value = reader.read(11);
        if (value >= 45 * 45) throw new Error('QR 영숫자 데이터가 올바르지 않습니다.');
        text += ALPHANUMERIC[Math.floor(value / 45)] + ALPHANUMERIC[value % 45];
        length -= 2;
      }
      if (length) {
        const value = reader.read(6);
        if (value >= 45) throw new Error('QR 영숫자 데이터가 올바르지 않습니다.');
        text += ALPHANUMERIC[value];
      }
      if (fnc1) text = text.replace(/%%/g, '\0').replace(/%/g, '\x1d').replace(/\0/g, '%');
      parts.push(text);
    } else if (mode === 4) {
      const segment = new Uint8Array(length);
      for (let i = 0; i < length; i++) segment[i] = reader.read(8);
      binary.push(...segment);
      parts.push(decodeBytes(segment, eci));
    } else {
      const segment = new Uint8Array(length * 2);
      for (let i = 0; i < length; i++) {
        const value = reader.read(13);
        let assembled = Math.floor(value / 0xc0) * 0x100 + value % 0xc0;
        assembled += assembled < 0x1f00 ? 0x8140 : 0xc140;
        segment[i * 2] = assembled >>> 8;
        segment[i * 2 + 1] = assembled;
      }
      try { parts.push(new TextDecoder('shift_jis').decode(segment)); }
      catch { throw new Error('이 브라우저는 QR 한자 문자 집합을 지원하지 않습니다.'); }
    }
  }
  const data = parts.join('');
  return { data, bytes: binary.length ? Uint8Array.from(binary) : new TextEncoder().encode(data) };
}

function transpose(matrix) {
  return matrix.map((_, row) => Uint8Array.from(matrix, (line) => line[row]));
}

export function decodeQrMatrix(input) {
  const matrix = input.map((row) => Uint8Array.from(row, (value) => value ? 1 : 0));
  const size = matrix.length;
  if (size < 21 || size > 177 || size % 4 !== 1 || matrix.some((row) => row.length !== size))
    throw new Error('QR 모듈 행렬 크기가 올바르지 않습니다.');
  const version = (size - 17) / 4;
  const format = readFormat(matrix);
  const specs = qrBlockInfo(version, format.level);
  const rawLength = specs.reduce((sum, block) => sum + block.total, 0);
  const raw = extractCodewords(matrix, version, format.mask, rawLength);
  const restored = restoreData(raw, version, format.level);
  return { ...parseData(restored.bytes, version), version, ...format, corrected: restored.corrected };
}

function binarize(rgba, width, height, inverted = false) {
  const pixels = width * height;
  const luminance = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const offset = i * 4;
    luminance[i] = (rgba[offset] * 54 + rgba[offset + 1] * 183 + rgba[offset + 2] * 19) >>> 8;
  }
  const blockSize = 8;
  const columns = Math.ceil(width / blockSize), rows = Math.ceil(height / blockSize);
  const points = new Uint8Array(columns * rows);
  for (let blockRow = 0; blockRow < rows; blockRow++) {
    for (let blockColumn = 0; blockColumn < columns; blockColumn++) {
      const startX = blockColumn * blockSize, startY = blockRow * blockSize;
      const endX = Math.min(width, startX + blockSize), endY = Math.min(height, startY + blockSize);
      let sum = 0, minimum = 255, maximum = 0, count = 0;
      for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) {
        const value = luminance[y * width + x];
        sum += value; count++;
        if (value < minimum) minimum = value;
        if (value > maximum) maximum = value;
      }
      let threshold = sum / count;
      if (maximum - minimum <= 24) {
        threshold = minimum / 2;
        if (blockRow && blockColumn) {
          const neighbor = (points[(blockRow - 1) * columns + blockColumn]
            + points[blockRow * columns + blockColumn - 1] * 2
            + points[(blockRow - 1) * columns + blockColumn - 1]) / 4;
          if (minimum < neighbor) threshold = neighbor;
        }
      }
      points[blockRow * columns + blockColumn] = threshold;
    }
  }
  const bitmap = new Uint8Array(pixels);
  for (let blockRow = 0; blockRow < rows; blockRow++) {
    for (let blockColumn = 0; blockColumn < columns; blockColumn++) {
      let sum = 0, count = 0;
      for (let y = Math.max(0, blockRow - 2); y <= Math.min(rows - 1, blockRow + 2); y++) {
        for (let x = Math.max(0, blockColumn - 2); x <= Math.min(columns - 1, blockColumn + 2); x++) {
          sum += points[y * columns + x]; count++;
        }
      }
      const threshold = sum / count;
      const endX = Math.min(width, (blockColumn + 1) * blockSize);
      const endY = Math.min(height, (blockRow + 1) * blockSize);
      for (let y = blockRow * blockSize; y < endY; y++) {
        for (let x = blockColumn * blockSize; x < endX; x++) {
          const dark = luminance[y * width + x] <= threshold;
          bitmap[y * width + x] = dark !== inverted ? 1 : 0;
        }
      }
    }
  }
  return bitmap;
}

function ratioMatches(counts, centerFactor) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total < centerFactor + 4 || counts.some((count) => !count)) return false;
  const unit = total / (centerFactor + 4);
  const tolerance = unit * 0.75;
  return Math.abs(counts[0] - unit) < tolerance
    && Math.abs(counts[1] - unit) < tolerance
    && Math.abs(counts[2] - centerFactor * unit) < centerFactor * tolerance
    && Math.abs(counts[3] - unit) < tolerance
    && Math.abs(counts[4] - unit) < tolerance;
}

function axisCheck(bitmap, width, height, x, y, dx, dy, centerFactor) {
  const inside = (column, row) => column >= 0 && row >= 0 && column < width && row < height;
  const dark = (column, row) => inside(column, row) && bitmap[row * width + column];
  x = Math.round(x); y = Math.round(y);
  if (!dark(x, y)) return null;
  let lowX = x, lowY = y;
  while (dark(lowX - dx, lowY - dy)) { lowX -= dx; lowY -= dy; }
  const centerStart = { x: lowX, y: lowY };
  let counts = [0, 0, 0, 0, 0];
  while (inside(lowX, lowY) && dark(lowX, lowY)) { counts[2]++; lowX -= dx; lowY -= dy; }
  while (inside(lowX, lowY) && !dark(lowX, lowY)) { counts[1]++; lowX -= dx; lowY -= dy; }
  while (inside(lowX, lowY) && dark(lowX, lowY)) { counts[0]++; lowX -= dx; lowY -= dy; }
  let highX = centerStart.x + dx, highY = centerStart.y + dy;
  while (inside(highX, highY) && dark(highX, highY)) { counts[2]++; highX += dx; highY += dy; }
  const centerEnd = { x: highX - dx, y: highY - dy };
  while (inside(highX, highY) && !dark(highX, highY)) { counts[3]++; highX += dx; highY += dy; }
  while (inside(highX, highY) && dark(highX, highY)) { counts[4]++; highX += dx; highY += dy; }
  if (!ratioMatches(counts, centerFactor)) return null;
  return {
    x: (centerStart.x + centerEnd.x) / 2,
    y: (centerStart.y + centerEnd.y) / 2,
    module: counts.reduce((sum, count) => sum + count, 0) / (centerFactor + 4),
  };
}

function rowRuns(bitmap, width, row, start = 0, end = width) {
  const result = [];
  let color = !!bitmap[row * width + start], runStart = start;
  for (let column = start + 1; column <= end; column++) {
    const next = column < end && !!bitmap[row * width + column];
    if (column < end && next === color) continue;
    result.push({ color, start: runStart, length: column - runStart });
    color = next; runStart = column;
  }
  return result;
}

function mergeCandidate(candidates, point) {
  const existing = candidates.find((candidate) => {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    return distance <= Math.max(3, candidate.module * 2)
      && Math.max(candidate.module, point.module) / Math.min(candidate.module, point.module) < 1.8;
  });
  if (existing) {
    const count = existing.count + 1;
    existing.x = (existing.x * existing.count + point.x) / count;
    existing.y = (existing.y * existing.count + point.y) / count;
    existing.module = (existing.module * existing.count + point.module) / count;
    existing.count = count;
  } else if (candidates.length < 128) candidates.push({ ...point, count: 1 });
}

function finderCandidates(bitmap, width, height) {
  const candidates = [];
  for (let row = 0; row < height; row++) {
    const runs = rowRuns(bitmap, width, row);
    for (let index = 0; index + 4 < runs.length; index++) {
      const group = runs.slice(index, index + 5);
      if (!group[0].color || group[1].color || !group[2].color || group[3].color || !group[4].color)
        continue;
      const counts = group.map((run) => run.length);
      if (!ratioMatches(counts, 3)) continue;
      const x = group[2].start + (group[2].length - 1) / 2;
      const vertical = axisCheck(bitmap, width, height, x, row, 0, 1, 3);
      if (!vertical) continue;
      const horizontal = axisCheck(bitmap, width, height, x, vertical.y, 1, 0, 3);
      if (!horizontal) continue;
      mergeCandidate(candidates, {
        x: horizontal.x, y: vertical.y, module: (vertical.module + horizontal.module) / 2,
      });
    }
  }
  return candidates.filter((candidate) => candidate.count >= 2)
    .sort((left, right) => right.count - left.count).slice(0, 16);
}

function selectFinders(candidates) {
  let best = null;
  for (let i = 0; i < candidates.length; i++) for (let j = 0; j < candidates.length; j++) {
    if (j === i) continue;
    for (let k = j + 1; k < candidates.length; k++) {
      if (k === i) continue;
      const topLeft = candidates[i], one = candidates[j], two = candidates[k];
      const ax = one.x - topLeft.x, ay = one.y - topLeft.y;
      const bx = two.x - topLeft.x, by = two.y - topLeft.y;
      const firstLength = Math.hypot(ax, ay), secondLength = Math.hypot(bx, by);
      const module = (topLeft.module + one.module + two.module) / 3;
      if (firstLength < module * 10 || secondLength < module * 10) continue;
      const cosine = Math.abs((ax * bx + ay * by) / (firstLength * secondLength));
      const ratio = Math.abs(Math.log(firstLength / secondLength));
      const moduleRatio = Math.max(topLeft.module, one.module, two.module)
        / Math.min(topLeft.module, one.module, two.module);
      if (cosine > 0.55 || ratio > 0.8 || moduleRatio > 1.8) continue;
      const rawDimension = (firstLength / module + secondLength / module) / 2 + 7;
      const version = Math.max(1, Math.min(40, Math.round((rawDimension - 17) / 4)));
      const dimension = version * 4 + 17;
      if (Math.abs(rawDimension - dimension) > 3.5) continue;
      const score = cosine * 5 + ratio * 2 + Math.abs(rawDimension - dimension) / 2
        + Math.abs(moduleRatio - 1) - Math.log2(topLeft.count + one.count + two.count) * 0.08;
      if (!best || score < best.score) {
        let topRight = one, bottomLeft = two;
        if (ax * by - ay * bx < 0) [topRight, bottomLeft] = [bottomLeft, topRight];
        best = { topLeft, topRight, bottomLeft, module, version, dimension, score };
      }
    }
  }
  return best;
}

function findAlignment(bitmap, width, height, expected, module) {
  const patternErrors = (point) => {
    let errors = 0;
    for (let row = -2; row <= 2; row++) for (let column = -2; column <= 2; column++) {
      const x = Math.round(point.x + column * point.module);
      const y = Math.round(point.y + row * point.module);
      const distance = Math.max(Math.abs(row), Math.abs(column));
      const expectedDark = distance !== 1;
      if (x < 0 || y < 0 || x >= width || y >= height
        || !!bitmap[y * width + x] !== expectedDark) errors++;
    }
    return errors;
  };
  for (const factor of [4, 8, 16]) {
    const radius = Math.ceil(module * factor);
    const startX = Math.max(0, Math.floor(expected.x - radius));
    const endX = Math.min(width, Math.ceil(expected.x + radius + 1));
    const startY = Math.max(0, Math.floor(expected.y - radius));
    const endY = Math.min(height, Math.ceil(expected.y + radius + 1));
    let sampled = null;
    const step = Math.max(1, Math.floor(module / 2));
    for (const candidateModule of [module * 0.8, module, module * 1.2]) {
      for (let y = startY; y < endY; y += step) for (let x = startX; x < endX; x += step) {
        if (!bitmap[Math.round(y) * width + Math.round(x)]) continue;
        const point = { x, y, module: candidateModule };
        const errors = patternErrors(point);
        const distance = Math.hypot(x - expected.x, y - expected.y);
        const score = errors * 20 + distance / module + Math.abs(candidateModule / module - 1);
        if (!sampled || score < sampled.score) sampled = { ...point, errors, distance, score };
      }
    }
    if (sampled?.errors <= 2) {
      let refined = sampled;
      for (let y = Math.max(startY, sampled.y - step); y <= Math.min(endY - 1, sampled.y + step); y++) {
        for (let x = Math.max(startX, sampled.x - step); x <= Math.min(endX - 1, sampled.x + step); x++) {
          if (!bitmap[y * width + x]) continue;
          const point = { x, y, module: sampled.module };
          const errors = patternErrors(point);
          const distance = Math.hypot(x - expected.x, y - expected.y);
          const score = errors * 20 + distance / module;
          if (score < refined.score) refined = { ...point, errors, distance, score };
        }
      }
      return refined;
    }
    let best = null;
    for (let row = startY; row < endY; row++) {
      const runs = rowRuns(bitmap, width, row, startX, endX);
      for (let index = 0; index + 4 < runs.length; index++) {
        const group = runs.slice(index, index + 5);
        if (!group[0].color || group[1].color || !group[2].color || group[3].color || !group[4].color
          || !ratioMatches(group.map((run) => run.length), 1)) continue;
        const x = group[2].start + (group[2].length - 1) / 2;
        const vertical = axisCheck(bitmap, width, height, x, row, 0, 1, 1);
        if (!vertical || Math.max(vertical.module, module) / Math.min(vertical.module, module) > 2) continue;
        const horizontal = axisCheck(bitmap, width, height, x, vertical.y, 1, 0, 1);
        if (!horizontal) continue;
        const point = {
          x: horizontal.x, y: vertical.y, module: (horizontal.module + vertical.module) / 2,
        };
        const errors = patternErrors(point);
        if (errors > 4) continue;
        const distance = Math.hypot(point.x - expected.x, point.y - expected.y);
        const score = distance / module + errors * 4;
        if (!best || score < best.score) best = { ...point, distance, score };
      }
    }
    if (best && best.distance <= module * 3) return best;
  }
  return null;
}

function homography(source, target) {
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = source[i], { x, y } = target[i];
    rows.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
    rows.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++)
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-9) throw new Error('QR 원근 변환을 계산할 수 없습니다.');
    if (pivot !== column) [rows[pivot], rows[column]] = [rows[column], rows[pivot]];
    const divisor = rows[column][column];
    for (let i = column; i < 9; i++) rows[column][i] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const scale = rows[row][column];
      for (let i = column; i < 9; i++) rows[row][i] -= scale * rows[column][i];
    }
  }
  const values = rows.map((row) => row[8]);
  return (x, y) => {
    const denominator = values[6] * x + values[7] * y + 1;
    return {
      x: (values[0] * x + values[1] * y + values[2]) / denominator,
      y: (values[3] * x + values[4] * y + values[5]) / denominator,
    };
  };
}

function sample(bitmap, width, height, finders) {
  const { topLeft, topRight, bottomLeft, dimension, version, module } = finders;
  let sourceFourth = { x: dimension - 3.5, y: dimension - 3.5 };
  let targetFourth = {
    x: topRight.x + bottomLeft.x - topLeft.x,
    y: topRight.y + bottomLeft.y - topLeft.y,
  };
  if (version > 1) {
    const coordinate = qrAlignmentPositions(version).slice(-1)[0] + 0.5;
    const scale = (coordinate - 3.5) / (dimension - 7);
    const expected = {
      x: topLeft.x + (topRight.x - topLeft.x + bottomLeft.x - topLeft.x) * scale,
      y: topLeft.y + (topRight.y - topLeft.y + bottomLeft.y - topLeft.y) * scale,
    };
    const alignment = findAlignment(bitmap, width, height, expected, module);
    if (alignment) {
      sourceFourth = { x: coordinate, y: coordinate };
      targetFourth = alignment;
    }
  }
  const project = homography([
    { x: 3.5, y: 3.5 }, { x: dimension - 3.5, y: 3.5 },
    { x: 3.5, y: dimension - 3.5 }, sourceFourth,
  ], [topLeft, topRight, bottomLeft, targetFourth]);
  const matrix = Array.from({ length: dimension }, () => new Uint8Array(dimension));
  for (let row = 0; row < dimension; row++) for (let column = 0; column < dimension; column++) {
    const point = project(column + 0.5, row + 0.5);
    const x = Math.floor(point.x), y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= width || y >= height) throw new Error('QR 표본 위치가 이미지 밖에 있습니다.');
    matrix[row][column] = bitmap[y * width + x];
  }
  return { matrix, targetFourth };
}

function detectAndDecode(rgba, width, height, inverted) {
  const bitmap = binarize(rgba, width, height, inverted);
  const finders = selectFinders(finderCandidates(bitmap, width, height));
  if (!finders) return null;
  const sampled = sample(bitmap, width, height, finders);
  let decoded;
  try { decoded = decodeQrMatrix(sampled.matrix); }
  catch (firstError) {
    try { decoded = decodeQrMatrix(transpose(sampled.matrix)); }
    catch { throw firstError; }
  }
  return {
    ...decoded,
    location: {
      topLeft: { x: finders.topLeft.x, y: finders.topLeft.y },
      topRight: { x: finders.topRight.x, y: finders.topRight.y },
      bottomLeft: { x: finders.bottomLeft.x, y: finders.bottomLeft.y },
      bottomRight: { x: sampled.targetFourth.x, y: sampled.targetFourth.y },
    },
  };
}

export function decodeQr(rgba, width, height, options = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 21 || height < 21)
    throw new RangeError('QR 이미지 크기는 가로·세로 21픽셀 이상이어야 합니다.');
  if (width * height > (options.maxPixels || 4_000_000))
    throw new RangeError('QR 해독 이미지의 픽셀 수가 처리 한도를 넘습니다.');
  if (!ArrayBuffer.isView(rgba) || rgba.byteLength < width * height * 4)
    throw new TypeError('QR 이미지는 RGBA 픽셀 배열이어야 합니다.');
  const pixels = new Uint8Array(rgba.buffer, rgba.byteOffset, width * height * 4);
  try {
    const result = detectAndDecode(pixels, width, height, false);
    if (result || options.inversionAttempts === 'dontInvert') return result;
  } catch (error) {
    if (options.inversionAttempts === 'dontInvert') throw error;
  }
  try { return detectAndDecode(pixels, width, height, true); }
  catch { return null; }
}
