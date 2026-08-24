// GIF89a palette quantization, LZW encoding, and frame writer.

function rgbaBytes(input) {
  if (!ArrayBuffer.isView(input)) throw new TypeError('GIF 입력은 RGBA 픽셀 배열이어야 합니다.');
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function makeBox(colors, indices) {
  let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0, total = 0;
  for (const index of indices) {
    const color = colors[index];
    minR = Math.min(minR, color.r); maxR = Math.max(maxR, color.r);
    minG = Math.min(minG, color.g); maxG = Math.max(maxG, color.g);
    minB = Math.min(minB, color.b); maxB = Math.max(maxB, color.b);
    total += color.count;
  }
  const ranges = [maxR - minR, maxG - minG, maxB - minB];
  const channel = ranges.indexOf(Math.max(...ranges));
  return { indices, total, channel, score: ranges[channel] * Math.sqrt(total) };
}

function splitBox(box, colors) {
  const channel = ['r', 'g', 'b'][box.channel];
  box.indices.sort((left, right) => colors[left][channel] - colors[right][channel]);
  const middle = box.total / 2;
  let sum = 0, split = 1;
  for (; split < box.indices.length; split++) {
    sum += colors[box.indices[split - 1]].count;
    if (sum >= middle) break;
  }
  split = Math.max(1, Math.min(box.indices.length - 1, split));
  return [makeBox(colors, box.indices.slice(0, split)), makeBox(colors, box.indices.slice(split))];
}

function paletteColor(box, colors) {
  let red = 0, green = 0, blue = 0, total = 0;
  for (const index of box.indices) {
    const color = colors[index];
    red += color.r * color.count;
    green += color.g * color.count;
    blue += color.b * color.count;
    total += color.count;
  }
  return [Math.round(red / total), Math.round(green / total), Math.round(blue / total)];
}

export function quantizeRgba(input, maximumColors = 256, options = {}) {
  const rgba = rgbaBytes(input);
  if (rgba.length % 4) throw new RangeError('GIF RGBA 배열 길이는 4의 배수여야 합니다.');
  maximumColors = Number(maximumColors);
  if (!Number.isInteger(maximumColors) || maximumColors < 2 || maximumColors > 256)
    throw new RangeError('GIF 팔레트 색상 수는 2~256이어야 합니다.');
  const alphaThreshold = options.alphaThreshold == null ? 1 : Number(options.alphaThreshold);
  if (!Number.isFinite(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255)
    throw new RangeError('GIF 투명도 기준값은 0~255여야 합니다.');

  const counts = new Uint32Array(32768);
  const red = new Float64Array(32768), green = new Float64Array(32768), blue = new Float64Array(32768);
  let transparent = false;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if (rgba[offset + 3] < alphaThreshold) { transparent = true; continue; }
    const key = (rgba[offset] >>> 3) * 1024 + (rgba[offset + 1] >>> 3) * 32 + (rgba[offset + 2] >>> 3);
    counts[key]++;
    red[key] += rgba[offset]; green[key] += rgba[offset + 1]; blue[key] += rgba[offset + 2];
  }
  const colors = [];
  for (let key = 0; key < counts.length; key++) if (counts[key]) colors.push({
    key, count: counts[key], r: red[key] / counts[key], g: green[key] / counts[key], b: blue[key] / counts[key],
  });
  const opaqueLimit = maximumColors - (transparent ? 1 : 0);
  if (!colors.length) {
    return { palette: Uint8Array.of(0, 0, 0, 0, 0, 0), transparentIndex: 0 };
  }
  let boxes = [makeBox(colors, colors.map((_, index) => index))];
  while (boxes.length < opaqueLimit) {
    let selected = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].indices.length > 1 && (selected < 0 || boxes[i].score > boxes[selected].score)) selected = i;
    }
    if (selected < 0) break;
    boxes.splice(selected, 1, ...splitBox(boxes[selected], colors));
  }
  const paletteValues = [];
  let transparentIndex = null;
  if (transparent) {
    transparentIndex = 0;
    paletteValues.push(0, 0, 0);
  }
  for (const box of boxes) paletteValues.push(...paletteColor(box, colors));
  while (paletteValues.length < 6) paletteValues.push(0, 0, 0);
  return { palette: Uint8Array.from(paletteValues), transparentIndex };
}

export function applyGifPalette(input, paletteInput, options = {}) {
  const rgba = rgbaBytes(input);
  const palette = rgbaBytes(paletteInput);
  if (rgba.length % 4 || palette.length % 3 || palette.length < 6 || palette.length > 768)
    throw new RangeError('GIF 픽셀 또는 팔레트 배열 길이가 올바르지 않습니다.');
  const transparentIndex = options.transparentIndex == null ? null : Number(options.transparentIndex);
  const alphaThreshold = options.alphaThreshold == null ? 1 : Number(options.alphaThreshold);
  const colorCount = palette.length / 3;
  if (transparentIndex != null && (!Number.isInteger(transparentIndex) || transparentIndex < 0 || transparentIndex >= colorCount))
    throw new RangeError('GIF 투명 팔레트 인덱스가 올바르지 않습니다.');
  const cache = new Int16Array(32768);
  cache.fill(-1);
  const result = new Uint8Array(rgba.length / 4);
  for (let offset = 0, pixel = 0; offset < rgba.length; offset += 4, pixel++) {
    if (transparentIndex != null && rgba[offset + 3] < alphaThreshold) {
      result[pixel] = transparentIndex;
      continue;
    }
    const key = (rgba[offset] >>> 3) * 1024 + (rgba[offset + 1] >>> 3) * 32 + (rgba[offset + 2] >>> 3);
    let best = cache[key];
    if (best < 0) {
      let distance = Infinity;
      for (let index = 0; index < colorCount; index++) {
        if (index === transparentIndex) continue;
        const paletteOffset = index * 3;
        const red = rgba[offset] - palette[paletteOffset];
        const green = rgba[offset + 1] - palette[paletteOffset + 1];
        const blue = rgba[offset + 2] - palette[paletteOffset + 2];
        const candidate = red * red * 2 + green * green * 3 + blue * blue;
        if (candidate < distance) { distance = candidate; best = index; }
      }
      cache[key] = best;
    }
    result[pixel] = best;
  }
  return result;
}

function tableSize(palette) {
  const colors = palette.length / 3;
  if (!Number.isInteger(colors) || colors < 2 || colors > 256)
    throw new RangeError('GIF 팔레트는 2~256개의 RGB 색상이어야 합니다.');
  let size = 2, bits = 1;
  while (size < colors) { size *= 2; bits++; }
  return { colors, size, bits };
}

function writeColorTable(output, palette) {
  const { size } = tableSize(palette);
  output.push(...palette);
  for (let i = palette.length; i < size * 3; i++) output.push(0);
}

function lzwEncode(indices, minimumCodeSize) {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let nextCode, codeSize, dictionary;
  const bytes = [];
  let bitBuffer = 0, bitLength = 0;
  const writeCode = (code) => {
    bitBuffer |= code << bitLength;
    bitLength += codeSize;
    while (bitLength >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>>= 8; bitLength -= 8;
    }
  };
  const reset = () => {
    dictionary = new Map();
    nextCode = endCode + 1;
    codeSize = minimumCodeSize + 1;
  };
  reset();
  writeCode(clearCode);
  const growCodeSize = () => {
    if (nextCode > (1 << codeSize) - 1 && codeSize < 12) codeSize++;
  };
  if (indices.length) {
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const symbol = indices[i];
      const key = prefix * 256 + symbol;
      const known = dictionary.get(key);
      if (known != null) { prefix = known; continue; }
      writeCode(prefix);
      growCodeSize();
      if (nextCode < 4096) {
        dictionary.set(key, nextCode++);
      } else {
        writeCode(clearCode);
        reset();
      }
      prefix = symbol;
    }
    writeCode(prefix);
    growCodeSize();
  }
  writeCode(endCode);
  if (bitLength) bytes.push(bitBuffer & 0xff);
  return bytes;
}

function word(output, value) {
  output.push(value & 0xff, (value >>> 8) & 0xff);
}

function ascii(output, value) {
  for (let i = 0; i < value.length; i++) output.push(value.charCodeAt(i));
}

export class GifWriter {
  constructor(width, height, options = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535)
      throw new RangeError('GIF 가로·세로는 1~65,535픽셀이어야 합니다.');
    this.width = width;
    this.height = height;
    this.output = [];
    this.finished = false;
    this.frames = 0;
    this.palette = options.palette ? rgbaBytes(options.palette).slice() : null;
    ascii(this.output, 'GIF89a');
    word(this.output, width); word(this.output, height);
    if (this.palette) {
      const { bits } = tableSize(this.palette);
      this.output.push(0x80 | 0x70 | (bits - 1), 0, 0);
      writeColorTable(this.output, this.palette);
    } else this.output.push(0x70, 0, 0);
    if (options.loop != null) {
      const loop = Number(options.loop);
      if (!Number.isInteger(loop) || loop < 0 || loop > 65535)
        throw new RangeError('GIF 반복 횟수는 0~65,535여야 합니다.');
      this.output.push(0x21, 0xff, 0x0b);
      ascii(this.output, 'NETSCAPE2.0');
      this.output.push(3, 1); word(this.output, loop); this.output.push(0);
    }
  }

  addFrame(indicesInput, options = {}) {
    if (this.finished) throw new Error('이미 완료한 GIF에는 프레임을 추가할 수 없습니다.');
    const indices = rgbaBytes(indicesInput);
    const left = Number(options.left || 0), top = Number(options.top || 0);
    const width = Number(options.width || this.width), height = Number(options.height || this.height);
    if (![left, top, width, height].every(Number.isInteger) || left < 0 || top < 0 || width < 1 || height < 1
      || left + width > this.width || top + height > this.height || indices.length !== width * height)
      throw new RangeError('GIF 프레임 위치·크기 또는 픽셀 수가 올바르지 않습니다.');
    const palette = options.palette ? rgbaBytes(options.palette) : null;
    if (!palette && !this.palette) throw new Error('GIF 프레임에는 전역 또는 로컬 팔레트가 필요합니다.');
    const activePalette = palette || this.palette;
    const { colors, bits } = tableSize(activePalette);
    if (indices.some((index) => index >= colors)) throw new RangeError('GIF 픽셀이 팔레트 범위를 벗어났습니다.');
    const delay = Number(options.delay || 0);
    const disposal = Number(options.disposal || 0);
    const transparentIndex = options.transparentIndex == null ? null : Number(options.transparentIndex);
    if (!Number.isInteger(delay) || delay < 0 || delay > 65535 || !Number.isInteger(disposal) || disposal < 0 || disposal > 7)
      throw new RangeError('GIF 프레임 지연 또는 폐기 방식이 올바르지 않습니다.');
    if (transparentIndex != null && (!Number.isInteger(transparentIndex) || transparentIndex < 0 || transparentIndex >= colors))
      throw new RangeError('GIF 투명 팔레트 인덱스가 올바르지 않습니다.');

    this.output.push(0x21, 0xf9, 4, (disposal << 2) | (transparentIndex == null ? 0 : 1));
    word(this.output, delay);
    this.output.push(transparentIndex || 0, 0);
    this.output.push(0x2c);
    word(this.output, left); word(this.output, top); word(this.output, width); word(this.output, height);
    this.output.push(palette ? 0x80 | (bits - 1) : 0);
    if (palette) writeColorTable(this.output, palette);
    const minimumCodeSize = Math.max(2, bits);
    this.output.push(minimumCodeSize);
    const compressed = lzwEncode(indices, minimumCodeSize);
    for (let offset = 0; offset < compressed.length; offset += 255) {
      const length = Math.min(255, compressed.length - offset);
      this.output.push(length, ...compressed.slice(offset, offset + length));
    }
    this.output.push(0);
    this.frames++;
  }

  finish() {
    if (!this.finished) {
      if (!this.frames) throw new Error('GIF에는 프레임이 하나 이상 필요합니다.');
      this.output.push(0x3b);
      this.finished = true;
    }
    return Uint8Array.from(this.output);
  }
}

export function encodeGif(rgba, width, height, options = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || rgbaBytes(rgba).length !== width * height * 4)
    throw new RangeError('GIF 크기와 RGBA 픽셀 수가 일치하지 않습니다.');
  const quantized = quantizeRgba(rgba, options.maximumColors || 256, options);
  const indices = applyGifPalette(rgba, quantized.palette, { ...options, transparentIndex: quantized.transparentIndex });
  const writer = new GifWriter(width, height, { palette: quantized.palette, loop: options.loop });
  writer.addFrame(indices, {
    delay: options.delay, disposal: options.disposal, transparentIndex: quantized.transparentIndex,
  });
  return writer.finish();
}
