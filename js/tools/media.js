// 이미지 / 미디어 / QR
import {
  tool, makeIO, h, formLabel, kvTable, download,
  downloadZip, copyBtn, bytesToB64, throwIfAborted, requireFeature, formatBytes, createAsyncRunner,
} from '../core.js';

const CAT = '이미지 / 미디어 / QR';
const IMAGE_LIMITS = Object.freeze({
  maxPixels: 40_000_000,
  maxTotalPixels: 100_000_000,
  maxDimension: 16_384,
});
const bytesToAscii = (bytes) => String.fromCharCode(...bytes);
let imageDataModule = null;
let qrModule = null;

function loadImageDataModule() {
  return imageDataModule ??= import('../lib/media/image-data.js').catch((cause) => {
    imageDataModule = null;
    throw new Error('이미지 포맷 모듈을 불러오지 못했습니다.', { cause });
  });
}

function loadQrModule() {
  return qrModule ??= import('../lib/qr/encoder.js').catch((cause) => {
    qrModule = null;
    throw new Error('QR 코드 생성 모듈을 불러오지 못했습니다.', { cause });
  });
}

function assertImageDimensions(name, width, height, currentTotal = 0) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error(`${name}: 이미지 크기를 확인할 수 없습니다.`);
  if (width > IMAGE_LIMITS.maxDimension || height > IMAGE_LIMITS.maxDimension)
    throw new Error(`${name}: 가로·세로는 각각 ${IMAGE_LIMITS.maxDimension.toLocaleString()}픽셀 이하여야 합니다.`);
  const pixels = width * height;
  if (pixels > IMAGE_LIMITS.maxPixels)
    throw new Error(`${name}: 픽셀 수 ${pixels.toLocaleString()}개가 단일 이미지 한도 ${IMAGE_LIMITS.maxPixels.toLocaleString()}개를 넘습니다.`);
  if (currentTotal + pixels > IMAGE_LIMITS.maxTotalPixels)
    throw new Error(`선택한 이미지의 총 픽셀 수가 ${IMAGE_LIMITS.maxTotalPixels.toLocaleString()}개를 넘습니다.`);
  return pixels;
}

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker))
      return { width: (bytes[offset + 7] << 8) | bytes[offset + 8], height: (bytes[offset + 5] << 8) | bytes[offset + 6] };
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
}

async function imageDimensions(file) {
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50)
    return { bytes, width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
    return { bytes, width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d)
    return { bytes, width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
  if (bytes.length >= 30 && bytesToAscii(bytes.subarray(0, 4)) === 'RIFF' && bytesToAscii(bytes.subarray(8, 12)) === 'WEBP') {
    const kind = bytesToAscii(bytes.subarray(12, 16));
    if (kind === 'VP8X') return {
      bytes,
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
    if (kind === 'VP8L' && bytes[20] === 0x2f) return {
      bytes,
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
    for (let offset = 20; offset + 6 < bytes.length; offset++) {
      if (bytes[offset] === 0x9d && bytes[offset + 1] === 0x01 && bytes[offset + 2] === 0x2a)
        return { bytes, width: view.getUint16(offset + 3, true) & 0x3fff, height: view.getUint16(offset + 5, true) & 0x3fff };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const dimensions = jpegDimensions(bytes) || {};
    return { bytes, ...dimensions };
  }
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    const text = new TextDecoder().decode(bytes);
    const tag = text.match(/<svg\b[^>]*>/i)?.[0] || '';
    const number = (name) => Number(tag.match(new RegExp(`\\b${name}=["']([0-9.]+)`, 'i'))?.[1]);
    let width = number('width'), height = number('height');
    const viewBox = tag.match(/\bviewBox=["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)/i);
    if ((!width || !height) && viewBox) { width ||= Number(viewBox[1]); height ||= Number(viewBox[2]); }
    return { bytes, width, height };
  }
  return { bytes, width: 0, height: 0 };
}

async function safeCreateImageBitmap(source, options) {
  requireFeature('imagebitmap', typeof createImageBitmap === 'function');
  if (source instanceof Blob) {
    const dimensions = await imageDimensions(source);
    assertImageDimensions(source.name || '이미지', dimensions.width, dimensions.height);
  }
  const bitmap = await createImageBitmap(source, options);
  try { assertImageDimensions(source.name || '이미지', bitmap.width, bitmap.height); }
  catch (error) { bitmap.close?.(); throw error; }
  return bitmap;
}

async function makeQR(text, ecl, size) {
  const { encodeQr } = await loadQrModule();
  const qr = encodeQr(text, { level: ecl });
  const count = qr.size;
  const cell = Math.max(2, Math.floor(size / (count + 8)));
  const margin = cell * 4;
  const dim = count * cell + margin * 2;
  const canvas = h('canvas', { width: dim, height: dim, role: 'img', 'aria-label': '생성된 QR 코드' });
  const ctx = canvas.getContext('2d');
  requireFeature('canvas', !!ctx);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = '#000';
  for (let r = 0; r < count; r++)
    for (let c = 0; c < count; c++)
      if (qr.modules[r][c]) ctx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
  return canvas;
}

tool({
  id: 'qr-generate', cat: CAT, name: 'QR 코드 생성기',
  desc: '텍스트나 URL을 QR 코드로 생성하고 PNG로 저장합니다.',
  keywords: 'qr code generate url png',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '텍스트 / URL', rows: 3, value: 'https://wtools.movingwoo.com' }],
      options: [
        { id: 'ecl', label: '오류 복원 레벨', type: 'select', values: [['M', 'M (15%)'], ['L', 'L (7%)'], ['Q', 'Q (25%)'], ['H', 'H (30%)']] },
        { id: 'size', label: '크기(px)', type: 'number', value: 320, size: 80 },
      ],
      outputHTML: true, runOnLoad: true,
      async process(text, o) {
        if (!text.trim()) return '';
        const canvas = await makeQR(text, o.ecl, +o.size);
        const dl = h('button', { class: 'btn', type: 'button', onclick: () => canvas.toBlob((b) => download('qrcode.png', b)) }, 'PNG 다운로드');
        return h('div', null, h('div', { style: { marginBottom: '10px' } }, canvas), h('div', { class: 'btn-row' }, dl));
      },
    });
  },
});

tool({
  id: 'wifi-qr', cat: CAT, name: 'WiFi QR 코드 생성기',
  desc: 'WiFi 접속 정보를 QR 코드로 만들어 스캔으로 연결할 수 있게 합니다.',
  keywords: 'wifi qr wireless password ssid',
  render(root) {
    makeIO(root, {
      inputs: null,
      options: [
        { id: 'ssid', label: 'SSID(네트워크명)', type: 'text', size: 180, value: 'MyWiFi' },
        { id: 'pass', label: '비밀번호', type: 'text', size: 180, value: '' },
        { id: 'enc', label: '보안', type: 'select', values: [['WPA', 'WPA/WPA2'], ['WEP', 'WEP'], ['nopass', '없음(개방)']] },
        { id: 'hidden', label: '숨김 네트워크', type: 'checkbox' },
      ],
      outputHTML: true, runOnLoad: true,
      async process(_, o) {
        if (!o.ssid) return '';
        const esc = (s) => s.replace(/([\\;,:"])/g, '\\$1');
        const payload = `WIFI:T:${o.enc === 'nopass' ? 'nopass' : o.enc};S:${esc(o.ssid)};${o.enc === 'nopass' ? '' : 'P:' + esc(o.pass) + ';'}${o.hidden ? 'H:true;' : ''};`;
        const canvas = await makeQR(payload, 'M', 320);
        const dl = h('button', { class: 'btn', type: 'button', onclick: () => canvas.toBlob((b) => download('wifi-qr.png', b)) }, 'PNG 다운로드');
        return h('div', null, canvas, h('p', { class: 'mono', style: { fontSize: '12px', color: 'var(--muted)' } }, payload), h('div', { class: 'btn-row' }, dl));
      },
    });
  },
});

tool({
  id: 'base64-image', cat: CAT, name: 'Base64 ↔ 이미지',
  desc: '이미지를 Base64 데이터 URI로 변환하거나, Data URI를 이미지로 미리보고 저장합니다.',
  keywords: 'base64 image data uri encode decode',
  transfer: {
    inputs: [{ id: 'input', label: 'Base64 또는 Data URI', accepts: ['base64', 'data-uri'] }],
    outputs: [{ id: 'data-uri', label: '이미지 Data URI', type: 'data-uri' }],
  },
  render(root) {
    // 이미지 → Base64
    root.append(h('h3', null, '이미지 → Base64'));
    const fileOut = h('div');
    const file = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Base64로 변환할 이미지 선택' });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const uri = reader.result;
        const ta = h('textarea', { class: 'mono', rows: 6, readonly: true });
        ta.value = uri;
        fileOut.innerHTML = '';
        fileOut.append(
          h('div', { class: 'out-head' }, formLabel(ta, `Data URI (${f.type}, ${(uri.length / 1024).toFixed(1)} KB)`, { class: 'io-label' }), copyBtn(() => ta.value)),
          ta, h('img', { src: uri, class: 'img-preview', alt: `${f.name} 미리보기`, style: { maxHeight: '200px', marginTop: '8px' } }));
      };
      reader.readAsDataURL(f);
    });
    root.append(h('div', { class: 'io' }, file, fileOut));

    // Base64 → 이미지
    root.append(h('h3', { style: { marginTop: '26px' } }, 'Base64 → 이미지'));
    makeIO(root, {
      inputs: [{ id: 'input', label: 'Base64 또는 Data URI', rows: 4, placeholder: 'data:image/png;base64,iVBOR... 또는 순수 Base64' }],
      options: [{ id: 'mime', label: '(순수 Base64인 경우) MIME', type: 'select', values: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'] }],
      outputHTML: true,
      transferOutput: {
        id: 'data-uri',
        when: ({ input }) => !!String(input).trim(),
        value: ({ input, opts }) => String(input).trim().startsWith('data:')
          ? String(input).trim()
          : `data:${opts.mime};base64,${String(input).replace(/\s/g, '')}`,
      },
      process(text, o) {
        text = text.trim();
        if (!text) return '';
        const uri = text.startsWith('data:') ? text : `data:${o.mime};base64,${text.replace(/\s/g, '')}`;
        const img = h('img', { src: uri, class: 'img-preview', alt: '입력한 Base64 이미지 미리보기', style: { maxHeight: '300px' } });
        img.onerror = () => { img.replaceWith(h('span', { class: 'error' }, '이미지를 표시할 수 없습니다.')); };
        const ext = (uri.match(/data:image\/(\w+)/) || [])[1] || 'png';
        const dl = h('button', { class: 'btn', type: 'button', onclick: () => download('image.' + ext, dataUriToBlob(uri)) }, '이미지 저장');
        return h('div', null, img, h('div', { class: 'btn-row', style: { marginTop: '8px' } }, dl));
      },
    });
  },
});

function dataUriToBlob(uri) {
  const [meta, data] = uri.split(',');
  const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = meta.includes('base64') ? atob(data) : decodeURIComponent(data);
  const arr = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new Blob([arr], { type: mime });
}

// BMP 24비트 무압축 인코더 (canvas.toBlob이 지원하지 않는 포맷)
function encodeBMP({ data, width, height }) {
  const rowSize = Math.ceil(width * 3 / 4) * 4;
  const dataSize = rowSize * height;
  const buf = new ArrayBuffer(54 + dataSize);
  const dv = new DataView(buf);
  dv.setUint16(0, 0x424d, false); // 'BM'
  dv.setUint32(2, 54 + dataSize, true);
  dv.setUint32(10, 54, true); // 픽셀 데이터 오프셋
  dv.setUint32(14, 40, true); // BITMAPINFOHEADER
  dv.setInt32(18, width, true);
  dv.setInt32(22, height, true);
  dv.setUint16(26, 1, true); // planes
  dv.setUint16(28, 24, true); // bpp
  dv.setUint32(34, dataSize, true);
  const px = new Uint8Array(buf, 54);
  for (let y = 0; y < height; y++) {
    let off = (height - 1 - y) * rowSize; // BMP는 아래 행부터 저장
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      px[off++] = data[i + 2]; px[off++] = data[i + 1]; px[off++] = data[i]; // BGR
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

async function encodeGIF(imageData, signal) {
  throwIfAborted(signal);
  const worker = new Worker(new URL('../workers/gif-encode.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException('GIF 인코딩이 취소되었습니다.', 'AbortError'));
    };
    worker.onmessage = ({ data }) => {
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(new Blob([data.bytes], { type: 'image/gif' }));
    };
    worker.onerror = () => {
      finish();
      reject(new Error('GIF 인코딩 모듈을 불러오지 못했습니다.'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    worker.postMessage({
      id: 1, rgba: imageData.data.buffer, width: imageData.width, height: imageData.height,
    }, [imageData.data.buffer]);
  });
}

function encodeSVG(canvas) {
  const uri = canvas.toDataURL('image/png');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image width="${canvas.width}" height="${canvas.height}" href="${uri}"/></svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

function imageEditControls(labelPrefix = '') {
  const rotation = h('select', null, [['0', '0°'], ['90', '90° 시계 방향'], ['180', '180°'], ['270', '270° 시계 방향']]
    .map(([value, label]) => h('option', { value }, label)));
  const flipHorizontal = h('input', { type: 'checkbox' });
  const flipVertical = h('input', { type: 'checkbox' });
  const cropMode = h('select', null,
    h('option', { value: 'none' }, '자르지 않음'),
    h('option', { value: 'square' }, '가운데 정사각형'),
    h('option', { value: 'custom' }, '사용자 지정 (%)'));
  const cropX = h('input', { type: 'number', min: 0, max: 99.9, step: 0.1, value: 0, style: { width: '68px' } });
  const cropY = h('input', { type: 'number', min: 0, max: 99.9, step: 0.1, value: 0, style: { width: '68px' } });
  const cropWidth = h('input', { type: 'number', min: 0.1, max: 100, step: 0.1, value: 100, style: { width: '68px' } });
  const cropHeight = h('input', { type: 'number', min: 0.1, max: 100, step: 0.1, value: 100, style: { width: '68px' } });
  const customCrop = h('span', { class: 'opt-item hidden' },
    formLabel(cropX, `${labelPrefix}자르기 X(%)`), cropX,
    formLabel(cropY, `${labelPrefix}Y(%)`), cropY,
    formLabel(cropWidth, `${labelPrefix}폭(%)`), cropWidth,
    formLabel(cropHeight, `${labelPrefix}높이(%)`), cropHeight);
  const controls = {
    rotation, flipHorizontal, flipVertical, cropMode, cropX, cropY, cropWidth, cropHeight, customCrop,
  };
  controls.node = h('div', { class: 'opt-row image-edit-controls' },
    h('span', { class: 'opt-item' }, formLabel(rotation, `${labelPrefix}회전`), rotation),
    h('span', { class: 'opt-item' }, formLabel(flipHorizontal, `${labelPrefix}좌우 반전`), flipHorizontal),
    h('span', { class: 'opt-item' }, formLabel(flipVertical, `${labelPrefix}상하 반전`), flipVertical),
    h('span', { class: 'opt-item' }, formLabel(cropMode, `${labelPrefix}자르기`), cropMode),
    customCrop);
  controls.syncCrop = () => customCrop.classList.toggle('hidden', cropMode.value !== 'custom');
  controls.syncCrop();
  return controls;
}

function copyImageEditControls(from, to) {
  for (const key of ['rotation', 'cropMode', 'cropX', 'cropY', 'cropWidth', 'cropHeight']) to[key].value = from[key].value;
  to.flipHorizontal.checked = from.flipHorizontal.checked;
  to.flipVertical.checked = from.flipVertical.checked;
  to.syncCrop();
}

function imageEditSettings(controls) {
  const percent = (input, label, min, max) => {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < min || value > max)
      throw new Error(`${label}은(는) ${min}~${max}% 범위로 입력하세요.`);
    return value;
  };
  const settings = {
    rotation: Number(controls.rotation.value),
    flipHorizontal: controls.flipHorizontal.checked,
    flipVertical: controls.flipVertical.checked,
    cropMode: controls.cropMode.value,
    cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100,
  };
  if (settings.cropMode === 'custom') {
    settings.cropX = percent(controls.cropX, '자르기 X', 0, 99.9);
    settings.cropY = percent(controls.cropY, '자르기 Y', 0, 99.9);
    settings.cropWidth = percent(controls.cropWidth, '자르기 폭', 0.1, 100);
    settings.cropHeight = percent(controls.cropHeight, '자르기 높이', 0.1, 100);
    if (settings.cropX + settings.cropWidth > 100 || settings.cropY + settings.cropHeight > 100)
      throw new Error('자르기 영역은 이미지 경계(100%) 안에 있어야 합니다.');
  }
  return settings;
}

function imageCropRect(width, height, settings) {
  if (settings.cropMode === 'square') {
    const size = Math.min(width, height);
    return { x: (width - size) / 2, y: (height - size) / 2, width: size, height: size };
  }
  if (settings.cropMode !== 'custom') return { x: 0, y: 0, width, height };
  const x = Math.floor(width * settings.cropX / 100);
  const y = Math.floor(height * settings.cropY / 100);
  const right = Math.min(width, Math.ceil(width * (settings.cropX + settings.cropWidth) / 100));
  const bottom = Math.min(height, Math.ceil(height * (settings.cropY + settings.cropHeight) / 100));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

async function canvasBlob(canvas, type, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error('이 브라우저는 해당 포맷 인코딩을 지원하지 않습니다.');
  if (type !== 'image/webp') return blob;
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const ascii = (start, end) => String.fromCharCode(...header.subarray(start, end));
  if (blob.type.toLowerCase() !== 'image/webp'
    || header.length < 12 || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') {
    throw new Error('이 브라우저는 WebP 인코딩을 지원하지 않아 PNG로 대체할 수 있습니다. 출력 포맷을 PNG로 선택하세요.');
  }
  return blob;
}

tool({
  id: 'image-convert', cat: CAT, name: '이미지 포맷 변환기',
  desc: '이미지를 회전·반전·자르기·크기 조절한 뒤 다시 인코딩하고 여러 결과를 ZIP으로 내려받습니다.',
  keywords: 'image convert png jpeg webp gif bmp svg resize crop rotate flip compress quality metadata exif orientation 회전 반전 자르기',
  render(root) {
    const out = h('div');
    const convertStatus = h('div', {
      class: 'io-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
    });
    const file = h('input', {
      type: 'file', accept: 'image/*', multiple: true,
      'data-file-max-count': 50,
      'data-file-budget-note': `이미지당 ${IMAGE_LIMITS.maxPixels.toLocaleString()}픽셀, 전체 ${IMAGE_LIMITS.maxTotalPixels.toLocaleString()}픽셀까지 처리합니다.`,
    });
    const fmt = h('select', null, [['original', '원본 포맷 유지 (재인코딩)'], ['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP'], ['image/gif', 'GIF (단일 프레임)'], ['image/bmp', 'BMP'], ['image/svg+xml', 'SVG (PNG 포함)']]
      .map(([v, l]) => h('option', { value: v, selected: v === 'image/png' }, l)));
    const quality = h('input', { type: 'range', min: 10, max: 100, value: 90, style: { width: '120px' } });
    const qualityValue = h('span', { class: 'mono' }, '90');
    const background = h('input', { type: 'color', value: '#ffffff' });
    const resizeMode = h('select', null,
      h('option', { value: 'percent' }, '비율(%)'), h('option', { value: 'max' }, '최대 폭·높이'));
    const scale = h('input', { type: 'number', value: 100, style: { width: '70px' } });
    const maxWidth = h('input', { type: 'number', min: 1, value: 1920, style: { width: '80px' } });
    const maxHeight = h('input', { type: 'number', min: 1, value: 1080, style: { width: '80px' } });
    const noUpscale = h('input', { type: 'checkbox' });
    noUpscale.checked = true;
    const commonEdit = imageEditControls('공통 ');
    const fileEdits = h('div', { class: 'image-file-edits' });
    const percentOpt = h('span', { class: 'opt-item' }, formLabel(scale, '크기(%)'), scale);
    const maxOpts = h('span', { class: 'opt-item', style: { display: 'none' } },
      formLabel(maxWidth, '최대 폭'), maxWidth, formLabel(maxHeight, '높이'), maxHeight);
    const info = h('span', { style: { color: 'var(--muted)' } });
    let items = []; // [{ file, name, type, size, width, height, orientation, edit }]
    let outUrls = [];
    let seq = 0;
    let active = true;
    let converting = false, convertPending = false;
    let convertScheduled = false;
    let conversionController = null;
    let pendingItems = null;
    const cancelButton = h('button', { class: 'btn small hidden', type: 'button' }, '취소');

    function scheduleConvert() {
      if (convertScheduled) return;
      convertScheduled = true;
      queueMicrotask(() => {
        convertScheduled = false;
        if (active) convert();
      });
    }

    function dimensions(sourceWidth, sourceHeight) {
      let s;
      if (resizeMode.value === 'max') {
        const mw = +maxWidth.value, mh = +maxHeight.value;
        if (mw <= 0 || mh <= 0) throw new Error('최대 폭과 높이는 1 이상이어야 합니다.');
        s = Math.min(mw / sourceWidth, mh / sourceHeight);
      } else {
        if (+scale.value <= 0) throw new Error('크기 비율은 1 이상이어야 합니다.');
        s = +scale.value / 100;
      }
      if (noUpscale.checked) s = Math.min(1, s);
      const result = {
        w: Math.max(1, Math.round(sourceWidth * s)),
        hgt: Math.max(1, Math.round(sourceHeight * s)),
      };
      assertImageDimensions('출력 이미지', result.w, result.hgt);
      return result;
    }

    async function convertOne(item, type, q, signal) {
      requireFeature('imagebitmap', typeof createImageBitmap === 'function');
      throwIfAborted(signal);
      const bitmap = await safeCreateImageBitmap(item.file, { imageOrientation: 'from-image' });
      assertImageDimensions(item.name, bitmap.width, bitmap.height);
      throwIfAborted(signal);
      try {
      const controls = item.useEdit?.checked ? item.edit : commonEdit;
      const edit = imageEditSettings(controls);
      const crop = imageCropRect(bitmap.width, bitmap.height, edit);
      const turns = edit.rotation === 90 || edit.rotation === 270;
      const sourceWidth = turns ? crop.height : crop.width;
      const sourceHeight = turns ? crop.width : crop.height;
      const { w, hgt } = dimensions(sourceWidth, sourceHeight);
      const canvas = h('canvas', { width: w, height: hgt });
      const ctx = canvas.getContext('2d');
      requireFeature('canvas', !!ctx);
      // 투명도를 보존하지 않는 출력은 사용자가 고른 배경색으로 먼저 합성한다.
      if (type === 'image/jpeg' || type === 'image/bmp' || type === 'image/gif') { ctx.fillStyle = background.value; ctx.fillRect(0, 0, w, hgt); }
      ctx.save();
      ctx.translate(w / 2, hgt / 2);
      ctx.scale(edit.flipHorizontal ? -1 : 1, edit.flipVertical ? -1 : 1);
      ctx.scale(w / sourceWidth, hgt / sourceHeight);
      ctx.rotate(edit.rotation * Math.PI / 180);
      ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height,
        -crop.width / 2, -crop.height / 2, crop.width, crop.height);
      ctx.restore();
      let blob;
      if (type === 'image/bmp') blob = encodeBMP(ctx.getImageData(0, 0, w, hgt));
      else if (type === 'image/gif') blob = await encodeGIF(ctx.getImageData(0, 0, w, hgt), signal);
      else if (type === 'image/svg+xml') blob = encodeSVG(canvas);
      else blob = await canvasBlob(canvas, type, q);
      return { blob, w, hgt };
      } finally {
        bitmap.close?.();
      }
    }

    async function convert(requestedItems = items) {
      if (!requestedItems.length) return;
      if (converting) {
        convertPending = true;
        pendingItems = requestedItems;
        conversionController?.abort();
        seq++;
        out.setAttribute('aria-busy', 'true');
        convertStatus.className = 'io-status active';
        convertStatus.textContent = '변경된 설정으로 다시 처리 중…';
        out.replaceChildren(h('p', { class: 'note' }, '변경된 설정으로 다시 변환 중...'));
        return;
      }
      converting = true;
      conversionController = new AbortController();
      const signal = conversionController.signal;
      const batch = [...requestedItems];
      const my = ++seq;
      out.setAttribute('aria-busy', 'true');
      convertStatus.className = 'io-status active';
      convertStatus.textContent = '처리 중…';
      cancelButton.classList.remove('hidden');
      try {
        const q = +quality.value / 100;
        const progress = h('p', { class: 'note' }, '변환 중...');
        out.replaceChildren(progress);
        const staleUrls = outUrls;
        outUrls = [];
        setTimeout(() => staleUrls.forEach((url) => URL.revokeObjectURL(url)), 0);
        const frag = h('div');
        const results = []; // ZIP용 [{name, data}]
        const failedItems = [];
        for (let i = 0; i < batch.length; i++) {
          throwIfAborted(signal);
          if (batch.length > 1) {
            progress.textContent = `변환 중... (${i + 1}/${batch.length})`;
            convertStatus.textContent = `처리 중… (${i + 1}/${batch.length})`;
          }
          const item = batch[i];
          try {
            let type = fmt.value === 'original' ? item.type : fmt.value;
            if (type === 'image/jpg') type = 'image/jpeg';
            if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml'].includes(type))
              throw new Error('이 파일의 원본 포맷은 출력할 수 없습니다. 다른 출력 포맷을 선택하세요.');
            const { blob, w, hgt } = await convertOne(item, type, q, signal);
            throwIfAborted(signal);
            if (my !== seq) return;
            const ext = type === 'image/svg+xml' ? 'svg' : type === 'image/jpeg' ? 'jpg' : type.split('/')[1];
            const outName = batch.length === 1 && items.length === 1 ? 'converted.' + ext : item.name.replace(/\.[^.]+$/, '') + '.' + ext;
            const uri = URL.createObjectURL(blob);
            outUrls.push(uri);
            results.push({ name: outName, data: blob });
            const change = item.size ? (1 - blob.size / item.size) * 100 : null;
            const sizeText = `${(item.size / 1024).toFixed(1)} KB → ${(blob.size / 1024).toFixed(1)} KB` +
              (change == null ? '' : ` (${change >= 0 ? change.toFixed(1) + '% 감소' : (-change).toFixed(1) + '% 증가'})`);
            frag.append(h('div', { style: { marginBottom: '14px' } },
              h('img', { src: uri, class: 'img-preview', alt: `${item.name} 변환 미리보기`, style: { maxHeight: batch.length > 1 ? '160px' : '260px' } }),
              h('p', null, `${batch.length > 1 || items.length > 1 ? item.name + ' → ' + outName + ' — ' : ''}${w} × ${hgt}, ${sizeText} `,
                h('button', { class: 'btn small', type: 'button', onclick: () => download(outName, blob) }, '다운로드'))));
          } catch (e) {
            if (e?.name === 'AbortError') throw e;
            if (my !== seq) return;
            failedItems.push(item);
            frag.append(h('p', null, h('span', { class: 'error' }, `${item.name} 변환 실패: ${e.message}`)));
          }
        }
        if (my !== seq) return;
        out.innerHTML = '';
        const zipError = h('span', { class: 'zip-error', role: 'alert' });
        const actions = h('div', { class: 'btn-row', style: { marginBottom: '10px' } });
        if (results.length > 1) actions.append(h('button', {
          class: 'btn primary', type: 'button',
          onclick: async () => {
            zipError.textContent = '';
            try { await downloadZip('converted.zip', results); }
            catch (error) { zipError.textContent = 'ZIP 생성 실패: ' + error.message; }
          },
        }, `전체 ZIP 다운로드 (${results.length}개)`));
        if (failedItems.length) actions.append(h('button', {
          class: 'btn', type: 'button', onclick: () => convert(failedItems),
        }, `실패 항목 다시 시도 (${failedItems.length}개)`));
        if (actions.childNodes.length) out.append(actions, zipError);
        out.append(h('p', { class: 'note', tabindex: -1 }, '변환이 완료되었습니다.'), frag);
        out.querySelector('[tabindex]')?.focus();
        convertStatus.className = failedItems.length ? 'io-status active error' : 'io-status active';
        convertStatus.textContent = failedItems.length
          ? `변환이 완료되었지만 ${failedItems.length}개 파일은 실패했습니다.`
          : '처리가 완료되었습니다.';
      } catch (e) {
        if (my === seq) {
          out.innerHTML = '';
          const aborted = e?.name === 'AbortError';
          out.append(h('span', { class: aborted ? 'note' : 'error' }, aborted ? '작업이 취소되었습니다.' : e?.message || String(e)));
          convertStatus.className = `io-status active${aborted ? '' : ' error'}`;
          convertStatus.textContent = aborted ? '작업이 취소되었습니다.' : '처리 실패: ' + (e?.message || String(e));
        }
      } finally {
        converting = false;
        conversionController = null;
        cancelButton.classList.add('hidden');
        out.setAttribute('aria-busy', 'false');
        if (convertPending && active) {
          const nextItems = pendingItems || items;
          convertPending = false;
          pendingItems = null;
          convert(nextItems);
        }
      }
    }

    cancelButton.addEventListener('click', () => {
      convertPending = false;
      pendingItems = null;
      conversionController?.abort();
    });

    file.addEventListener('change', async () => {
      const list = [...file.files];
      if (!list.length) return;
      file.disabled = true;
      info.textContent = '이미지 로딩 중...';
      conversionController?.abort();
      items = [];
      fileEdits.innerHTML = '';
      let readExif;
      try { ({ readExif } = await loadImageDataModule()); }
      catch (error) {
        file.disabled = false;
        info.textContent = error.message;
        return;
      }
      const failed = [];
      let totalPixels = 0;
      for (const f of list) {
        try {
          const dimensions = await imageDimensions(f);
          const pixels = assertImageDimensions(f.name, dimensions.width, dimensions.height, totalPixels);
          totalPixels += pixels;
          let orientation = 1;
          try { orientation = Number(readExif(dimensions.bytes)?.ifd0?.[0x0112]) || 1; } catch { /* 손상된 EXIF는 크기 검사를 막지 않는다. */ }
          if (!active) return;
          const swapsAxes = orientation >= 5 && orientation <= 8;
          items.push({
            file: f, name: f.name, type: f.type, size: f.size, orientation,
            width: swapsAxes ? dimensions.height : dimensions.width,
            height: swapsAxes ? dimensions.width : dimensions.height,
          });
        } catch (error) {
          failed.push(`${f.name}: ${error.message}`);
        }
      }
      file.disabled = false;
      info.textContent = (items.length === 1
        ? `원본: ${items[0].width} × ${items[0].height}` +
          (items[0].orientation >= 2 && items[0].orientation <= 8 ? ` — EXIF 방향 ${items[0].orientation} 적용됨` : '')
        : `${items.length}개 파일 선택됨`) +
        (failed.length ? ` — 로드 실패: ${failed.join(', ')}` : '');
      for (const item of items) {
        const useEdit = h('input', { type: 'checkbox' });
        const edit = imageEditControls(`${item.name} `);
        const fieldset = h('fieldset', { class: 'image-file-edit-fields', disabled: true }, edit.node);
        let initialized = false;
        useEdit.addEventListener('change', () => {
          if (useEdit.checked && !initialized) { copyImageEditControls(commonEdit, edit); initialized = true; }
          fieldset.disabled = !useEdit.checked;
          scheduleConvert();
        });
        for (const control of [edit.rotation, edit.flipHorizontal, edit.flipVertical, edit.cropMode, edit.cropX, edit.cropY, edit.cropWidth, edit.cropHeight]) {
          control.addEventListener('input', () => { edit.syncCrop(); scheduleConvert(); });
        }
        item.useEdit = useEdit;
        item.edit = edit;
        fileEdits.append(h('details', { class: 'image-file-edit' },
          h('summary', null, `${item.name} 개별 편집 설정`),
          h('div', { class: 'image-file-edit-toggle' }, formLabel(useEdit, `${item.name} 개별 편집 설정 사용`), useEdit),
          fieldset));
      }
      convert();
    });
    resizeMode.addEventListener('change', () => {
      percentOpt.style.display = resizeMode.value === 'percent' ? '' : 'none';
      maxOpts.style.display = resizeMode.value === 'max' ? '' : 'none';
      scheduleConvert();
    });
    quality.addEventListener('input', () => { qualityValue.textContent = quality.value; scheduleConvert(); });
    [fmt, background, scale, maxWidth, maxHeight, noUpscale]
      .forEach((el) => el.addEventListener('input', scheduleConvert));
    for (const control of [commonEdit.rotation, commonEdit.flipHorizontal, commonEdit.flipVertical, commonEdit.cropMode,
      commonEdit.cropX, commonEdit.cropY, commonEdit.cropWidth, commonEdit.cropHeight]) {
      control.addEventListener('input', () => { commonEdit.syncCrop(); scheduleConvert(); });
    }
    root.append(
      h('div', { class: 'io' },
        formLabel(file, '이미지 선택 (여러 장 가능)', { class: 'io-label' }), file, info,
        h('div', { class: 'opt-row', style: { marginTop: '10px' } },
          h('span', { class: 'opt-item' }, formLabel(fmt, '출력 포맷'), fmt),
          h('span', { class: 'opt-item' }, formLabel(quality, '품질(JPEG/WebP)'), quality, qualityValue),
          h('span', { class: 'opt-item' }, formLabel(background, 'JPEG/GIF/BMP 배경색'), background),
          h('span', { class: 'opt-item' }, formLabel(resizeMode, '크기 방식'), resizeMode),
          percentOpt, maxOpts,
          h('span', { class: 'opt-item' }, formLabel(noUpscale, '확대하지 않기'), noUpscale)),
        h('h4', { style: { marginBottom: '8px' } }, '공통 편집 설정'), commonEdit.node,
        h('div', { class: 'note image-convert-note' },
          h('p', { style: { margin: '0 0 6px' } }, 'EXIF 방향 정보는 파일을 읽을 때 픽셀에 한 번 적용되며 미리보기와 다운로드 결과가 같은 방향을 사용합니다. 자르기는 EXIF 방향 적용 후, 사용자 회전·반전 전에 수행됩니다. 여러 파일에서는 공통 편집 설정을 기본으로 사용하고, 파일별 설정을 켠 파일은 회전·반전·자르기 설정 전체를 개별 값으로 대체합니다. 출력 포맷·품질·크기는 항상 공통입니다.'),
          h('p', { style: { margin: 0 } }, '원본 포맷 유지를 선택해도 결과는 캔버스로 다시 인코딩되어 EXIF·GPS 등 메타데이터가 제거됩니다. 화질을 유지한 채 메타데이터만 삭제하려면 EXIF 뷰어 / 메타데이터 제거 도구를 사용하세요. WebP 인코딩을 지원하지 않는 브라우저에서는 PNG 대체 파일을 잘못된 .webp 이름으로 저장하지 않고 PNG 선택을 안내합니다. GIF 출력은 단일 프레임이며 애니메이션 입력도 정지 이미지 한 장으로 바뀝니다. SVG 출력은 벡터화가 아니라 PNG 이미지를 포함한 SVG 파일입니다.')),
        fileEdits,
        h('div', { class: 'btn-row' }, cancelButton), convertStatus, out));
    return () => {
      active = false;
      seq++;
      conversionController?.abort();
      outUrls.forEach((url) => URL.revokeObjectURL(url));
      items = [];
      outUrls = [];
    };
  },
});

tool({
  id: 'bg-remove', cat: CAT, name: '배경 투명화',
  desc: '단색 배경(로고, 도장, 스캔 이미지 등)을 투명하게 만들어 PNG로 저장합니다.',
  keywords: 'background transparent remove alpha chroma key png',
  render(root) {
    const file = h('input', { type: 'file', accept: 'image/*' });
    const tol = h('input', { type: 'range', min: 0, max: 100, value: 12, style: { width: '140px' } });
    const feather = h('input', { type: 'range', min: 0, max: 50, value: 10, style: { width: '120px' } });
    const swatch = h('span', { style: { display: 'inline-block', width: '18px', height: '18px', borderRadius: '4px', border: '1px solid var(--border)', verticalAlign: 'middle' } });
    const keyLabel = h('span', { class: 'mono', style: { marginLeft: '6px', color: 'var(--muted)' } }, '(이미지를 선택하세요)');
    const out = h('div');
    let src = null; // 원본 ImageData
    let key = null; // 배경색 [r, g, b]

    const dist = (d, i, r, g, b) => {
      const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };
    // 네 모서리 중 다른 모서리들과 가장 비슷한 색을 배경색으로 추정
    function autoKey() {
      const d = src.data, w = src.width, hgt = src.height;
      const corners = [0, (w - 1) * 4, (hgt - 1) * w * 4, ((hgt - 1) * w + w - 1) * 4]
        .map((i) => [d[i], d[i + 1], d[i + 2]]);
      let best = 0, bestScore = -1;
      corners.forEach((c, i) => {
        const score = corners.filter((o, j) => j !== i && dist(o, 0, c[0], c[1], c[2]) < 30).length;
        if (score > bestScore) { bestScore = score; best = i; }
      });
      return corners[best];
    }
    function setKeyLabel() {
      const hex = '#' + key.map((v) => v.toString(16).padStart(2, '0')).join('');
      swatch.style.background = hex;
      keyLabel.textContent = hex + ' (미리보기를 클릭하면 그 지점 색으로 변경)';
    }

    function apply() {
      if (!src) return;
      const w = src.width, hgt = src.height;
      const t0 = (+tol.value / 100) * 300; // RGB 거리 0~300
      const f = Math.max(1, (+feather.value / 100) * 300);
      const [kr, kg, kb] = key;
      const d = new Uint8ClampedArray(src.data);
      let removed = 0;
      for (let i = 0; i < d.length; i += 4) {
        const ds = dist(d, i, kr, kg, kb);
        if (ds <= t0) { d[i + 3] = 0; removed++; }
        else if (ds < t0 + f) d[i + 3] = Math.min(d[i + 3], Math.round(255 * (ds - t0) / f));
      }
      const canvas = h('canvas', {
        width: w, height: hgt,
        style: {
          maxWidth: '100%', maxHeight: '300px', cursor: 'crosshair', borderRadius: '6px',
          background: 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 16px 16px', // 투명 확인용 체커보드
        },
      });
      canvas.getContext('2d').putImageData(new ImageData(d, w, hgt), 0, 0);
      canvas.addEventListener('click', (ev) => {
        const x = Math.floor(ev.offsetX * (w / canvas.clientWidth));
        const y = Math.floor(ev.offsetY * (hgt / canvas.clientHeight));
        const i = (Math.min(y, hgt - 1) * w + Math.min(x, w - 1)) * 4;
        key = [src.data[i], src.data[i + 1], src.data[i + 2]];
        setKeyLabel();
        apply();
      });
      out.innerHTML = '';
      out.append(canvas,
        h('p', null, `${w} × ${hgt}, ${((removed / (w * hgt)) * 100).toFixed(1)}% 투명 처리 `,
          h('button', { class: 'btn small', type: 'button', onclick: () => canvas.toBlob((b) => download('transparent.png', b), 'image/png') }, 'PNG 다운로드')));
    }

    let raf = 0, inputUrl = null, active = true;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
    [tol, feather].forEach((el) => el.addEventListener('input', schedule));

    file.addEventListener('change', () => {
      const f = file.files[0];
      if (!f) return;
      if (inputUrl) URL.revokeObjectURL(inputUrl);
      const img = new Image();
      const url = URL.createObjectURL(f);
      inputUrl = url;
      img.onload = () => {
        if (!active || inputUrl !== url) return;
        const canvas = h('canvas', { width: img.naturalWidth, height: img.naturalHeight });
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        src = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
        key = autoKey();
        setKeyLabel();
        apply();
        URL.revokeObjectURL(url);
        inputUrl = null;
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (inputUrl === url) inputUrl = null;
      };
      img.src = url;
    });

    root.append(
      h('div', { class: 'io' },
        formLabel(file, '이미지 선택 (브라우저 밖으로 전송되지 않습니다)', { class: 'io-label' }), file,
        h('div', { class: 'opt-row', style: { marginTop: '10px' } },
          h('span', { class: 'opt-item' }, h('span', null, '배경색'), swatch, keyLabel),
          h('span', { class: 'opt-item' }, formLabel(tol, '허용 오차'), tol),
          h('span', { class: 'opt-item' }, formLabel(feather, '경계 부드럽게'), feather)),
        h('p', { class: 'note' }, '배경색은 모서리에서 자동 감지합니다. 결과가 이상하면 미리보기에서 배경 부분을 클릭해 색을 다시 지정하세요.'),
        out));
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      if (inputUrl) URL.revokeObjectURL(inputUrl);
      inputUrl = null;
    };
  },
});

/* ---------- QR / 바코드 리더 ---------- */
const BARCODE_FORMATS = {
  qr_code: 'QR 코드', data_matrix: 'Data Matrix', aztec: 'Aztec', pdf417: 'PDF417',
  code_128: 'Code 128', code_39: 'Code 39', code_93: 'Code 93', codabar: 'Codabar',
  ean_13: 'EAN-13', ean_8: 'EAN-8', itf: 'ITF', upc_a: 'UPC-A', upc_e: 'UPC-E',
};

function showCodeResult(out, text, format = 'qr_code') {
  out.innerHTML = '';
  const rows = [['내용', text], ['길이', text.length + '자'], ['코드 형식', BARCODE_FORMATS[format] || format]];
  if (/^https?:\/\//i.test(text)) rows.push(['유형', 'URL']);
  else if (text.startsWith('WIFI:')) {
    rows.push(['유형', 'WiFi 접속 정보']);
    const g = (key) => (text.match(new RegExp(key + ':((?:\\\\.|[^;])*)')) || [])[1]?.replace(/\\(.)/g, '$1');
    for (const [key, label] of [['S', 'SSID'], ['P', '비밀번호'], ['T', '보안']])
      if (g(key)) rows.push([label, g(key)]);
  } else if (text.startsWith('mailto:')) rows.push(['유형', '이메일']);
  else if (text.startsWith('tel:')) rows.push(['유형', '전화번호']);
  out.append(kvTable(rows));
  if (/^https?:\/\//i.test(text))
    out.append(h('p', null, h('a', { href: text, target: '_blank', rel: 'noopener noreferrer' }, '확인 후 URL 열기')));
}

function cameraErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError')
    return '카메라 권한이 거부되었습니다. 브라우저의 사이트 설정에서 카메라 권한을 허용한 뒤 다시 시도하세요.';
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError')
    return '사용 가능한 카메라를 찾지 못했습니다.';
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError')
    return '카메라를 사용할 수 없습니다. 다른 앱이 카메라를 사용 중인지 확인하세요.';
  if (error?.name === 'OverconstrainedError' || error?.name === 'ConstraintNotSatisfiedError')
    return '선택한 카메라를 사용할 수 없습니다. 다른 카메라를 선택해 주세요.';
  if (error?.name === 'SecurityError')
    return '카메라는 HTTPS 또는 localhost 같은 보안 환경에서만 사용할 수 있습니다.';
  return '카메라 시작 실패: ' + (error?.message || '알 수 없는 오류');
}

tool({
  id: 'qr-read', cat: CAT, name: 'QR 코드 리더',
  desc: '카메라로 QR·바코드를 실시간 스캔하거나 이미지와 클립보드의 QR 코드를 해독합니다.',
  keywords: 'qr barcode code 128 ean data matrix camera read scan decode reader wifi',
  render(root) {
    const imageOut = h('div', { class: 'scan-result', 'aria-live': 'polite' });
    let qrWorker = null, qrRequest = 0;
    const qrPending = new Map();

    function ensureQrWorker() {
      if (qrWorker) return qrWorker;
      qrWorker = new Worker(new URL('../workers/qr-decode.js', import.meta.url), { type: 'module' });
      qrWorker.onmessage = ({ data }) => {
        const pending = qrPending.get(data.id);
        if (!pending) return;
        qrPending.delete(data.id);
        if (data.error) pending.reject(new Error(data.error));
        else pending.resolve(data.result);
      };
      qrWorker.onerror = () => {
        for (const pending of qrPending.values()) pending.reject(new Error('QR 해독 모듈을 불러오지 못했습니다.'));
        qrPending.clear();
        qrWorker?.terminate();
        qrWorker = null;
      };
      return qrWorker;
    }

    function decodeQrPixels(imageData) {
      const worker = ensureQrWorker();
      const id = ++qrRequest;
      return new Promise((resolve, reject) => {
        qrPending.set(id, { resolve, reject });
        worker.postMessage({
          id, pixels: imageData.data.buffer, width: imageData.width, height: imageData.height,
        }, [imageData.data.buffer]);
      });
    }

    async function decode(src) {
      imageOut.innerHTML = '해독 중...';
      try {
        const bmp = await safeCreateImageBitmap(src);
        // 너무 큰 이미지는 축소 (해상도가 충분히 크면 인식률에 영향 없음)
        const scale = Math.min(1, 1500 / Math.max(bmp.width, bmp.height));
        const w = Math.round(bmp.width * scale), hgt = Math.round(bmp.height * scale);
        const ctx = h('canvas', { width: w, height: hgt }).getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bmp, 0, 0, w, hgt);
        bmp.close?.();
        const res = w < 21 || hgt < 21 ? null : await decodeQrPixels(ctx.getImageData(0, 0, w, hgt));
        if (!res?.data) {
          imageOut.innerHTML = '';
          imageOut.append(h('span', { class: 'error' }, 'QR 코드를 찾지 못했습니다. 이미지가 선명한지, 코드 주변에 여백이 있는지 확인하세요.'));
          return;
        }
        showCodeResult(imageOut, res.data);
      } catch (e) {
        imageOut.innerHTML = '';
        imageOut.append(h('span', { class: 'error' }, '해독 실패: ' + e.message));
      }
    }

    const video = h('video', { class: 'scanner-video', playsinline: true, muted: true, autoplay: true, 'aria-label': '카메라 스캔 미리보기' });
    const cameraSelect = h('select', { disabled: true, 'aria-label': '카메라 선택' });
    cameraSelect.append(h('option', { value: '' }, '카메라 시작 후 선택 가능'));
    const cameraStatus = h('p', { class: 'note camera-status', role: 'status', 'aria-live': 'polite' },
      '카메라는 사용자가 시작 버튼을 누른 뒤에만 켜지며 영상은 브라우저 밖으로 전송되지 않습니다.');
    const formatInfo = h('p', { class: 'sub scanner-formats' }, '인식 형식: QR 코드');
    const cameraOut = h('div', { class: 'scan-result', 'aria-live': 'polite' });
    let stream = null, detector = null, nativeFormats = [], cameras = [];
    let raf = 0, generation = 0, scanning = false, detecting = false, destroyed = false, lastFrame = 0;
    const scanCanvas = h('canvas');
    const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

    const startBtn = h('button', { class: 'btn primary', type: 'button' }, '카메라 시작');
    const pauseBtn = h('button', { class: 'btn', type: 'button', disabled: true }, '스캔 일시정지');
    const switchBtn = h('button', { class: 'btn', type: 'button', disabled: true }, '카메라 전환');
    const stopBtn = h('button', { class: 'btn', type: 'button', disabled: true }, '카메라 끄기');

    function releaseStream() {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
    }

    function updateButtons(running) {
      startBtn.disabled = running;
      pauseBtn.disabled = !running;
      stopBtn.disabled = !running;
      cameraSelect.disabled = !running || cameras.length < 2;
      switchBtn.disabled = !running || cameras.length < 2;
    }

    function stopCamera(message = '카메라가 꺼졌습니다.') {
      generation++;
      scanning = false;
      detecting = false;
      cancelAnimationFrame(raf);
      releaseStream();
      pauseBtn.textContent = '스캔 일시정지';
      updateButtons(false);
      if (message) cameraStatus.textContent = message;
    }

    async function prepareDetector() {
      detector = null;
      nativeFormats = [];
      if ('BarcodeDetector' in window) {
        try {
          const supported = await BarcodeDetector.getSupportedFormats();
          nativeFormats = Object.keys(BARCODE_FORMATS).filter((format) => supported.includes(format));
          if (nativeFormats.length) detector = new BarcodeDetector({ formats: nativeFormats });
        } catch { detector = null; nativeFormats = []; }
      }
      if (!nativeFormats.includes('qr_code')) ensureQrWorker();
      const formats = ['qr_code', ...nativeFormats.filter((format) => format !== 'qr_code')];
      formatInfo.textContent = '인식 형식: ' + formats.map((format) => BARCODE_FORMATS[format]).join(', ');
    }

    async function refreshCameras(selectedId) {
      try {
        cameras = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
      } catch { cameras = []; }
      cameraSelect.replaceChildren(...(cameras.length
        ? cameras.map((camera, index) => h('option', {
          value: camera.deviceId, selected: camera.deviceId === selectedId,
        }, camera.label || `카메라 ${index + 1}`))
        : [h('option', { value: '' }, '사용 중인 카메라')]));
      if (selectedId && cameras.some((camera) => camera.deviceId === selectedId)) cameraSelect.value = selectedId;
      updateButtons(!!stream);
    }

    function showDetected(text, format) {
      scanning = false;
      pauseBtn.textContent = '스캔 계속';
      cameraStatus.textContent = '코드를 인식했습니다. 내용을 확인한 뒤 스캔을 계속할 수 있습니다.';
      showCodeResult(cameraOut, text, format);
    }

    async function scanFrame(now, token) {
      if (destroyed || token !== generation) return;
      raf = requestAnimationFrame((nextNow) => scanFrame(nextNow, token));
      if (!scanning || detecting || now - lastFrame < 120 || video.readyState < 2) return;
      detecting = true;
      lastFrame = now;
      try {
        if (detector) {
          const codes = await detector.detect(video);
          const code = codes.find((item) => item.rawValue);
          if (code && scanning) { showDetected(code.rawValue, code.format); return; }
        }
        if (!nativeFormats.includes('qr_code') && scanning) {
          const width = video.videoWidth, height = video.videoHeight;
          if (!width || !height) return;
          const scale = Math.min(1, 960 / Math.max(width, height));
          scanCanvas.width = Math.max(1, Math.round(width * scale));
          scanCanvas.height = Math.max(1, Math.round(height * scale));
          scanCtx.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
          const data = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
          const result = await decodeQrPixels(data);
          if (result?.data && scanning) showDetected(result.data, 'qr_code');
        }
      } catch (error) {
        cameraStatus.textContent = '코드 인식 중 오류가 발생했습니다: ' + error.message;
        scanning = false;
        pauseBtn.textContent = '스캔 계속';
      } finally { detecting = false; }
    }

    async function startCamera(deviceId = '') {
      if (!window.isSecureContext) {
        cameraStatus.textContent = '카메라는 HTTPS 또는 localhost 같은 보안 환경에서만 사용할 수 있습니다.';
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        cameraStatus.textContent = '이 브라우저는 카메라 접근을 지원하지 않습니다. QR 이미지 선택을 이용하세요.';
        return;
      }
      const token = ++generation;
      scanning = false;
      cancelAnimationFrame(raf);
      releaseStream();
      updateButtons(false);
      startBtn.disabled = true;
      cameraStatus.textContent = '카메라 권한을 확인하고 있습니다...';
      try {
        await prepareDetector();
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } },
        });
        if (destroyed || token !== generation) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = nextStream;
        video.srcObject = stream;
        await video.play();
        const selected = stream.getVideoTracks?.()[0]?.getSettings?.().deviceId || deviceId;
        await refreshCameras(selected);
        scanning = true;
        pauseBtn.textContent = '스캔 일시정지';
        cameraOut.innerHTML = '';
        const extraFormats = nativeFormats.filter((format) => format !== 'qr_code').map((format) => BARCODE_FORMATS[format]);
        cameraStatus.textContent = extraFormats.length
          ? `스캔 중입니다. QR 코드와 ${extraFormats.join(', ')} 바코드를 인식할 수 있습니다.`
          : '스캔 중입니다. 이 브라우저에서는 QR 코드를 인식할 수 있습니다.';
        updateButtons(true);
        raf = requestAnimationFrame((now) => scanFrame(now, token));
      } catch (error) {
        if (destroyed || token !== generation) return;
        releaseStream();
        updateButtons(false);
        cameraStatus.textContent = cameraErrorMessage(error);
      }
    }

    startBtn.addEventListener('click', () => startCamera());
    stopBtn.addEventListener('click', () => stopCamera());
    pauseBtn.addEventListener('click', () => {
      scanning = !scanning;
      pauseBtn.textContent = scanning ? '스캔 일시정지' : '스캔 계속';
      cameraStatus.textContent = scanning ? '스캔을 계속합니다.' : '스캔을 일시정지했습니다. 카메라는 켜져 있습니다.';
    });
    cameraSelect.addEventListener('change', () => startCamera(cameraSelect.value));
    switchBtn.addEventListener('click', () => {
      if (cameras.length < 2) return;
      const index = Math.max(0, cameras.findIndex((camera) => camera.deviceId === cameraSelect.value));
      startCamera(cameras[(index + 1) % cameras.length].deviceId);
    });

    const file = h('input', { type: 'file', accept: 'image/*' });
    file.addEventListener('change', () => file.files[0] && decode(file.files[0]));
    root.append(h('div', { class: 'io' },
      h('h3', null, '실시간 카메라 스캔'),
      h('div', { class: 'scanner-preview' }, video, h('div', { class: 'scanner-guide', 'aria-hidden': 'true' })),
      h('div', { class: 'opt-row' },
        h('span', { class: 'opt-item' }, formLabel(cameraSelect, '카메라'), cameraSelect)),
      h('div', { class: 'btn-row' }, startBtn, pauseBtn, switchBtn, stopBtn),
      cameraStatus, formatInfo, cameraOut,
      h('h3', { style: { marginTop: '24px' } }, '이미지에서 QR 읽기'),
      formLabel(file, 'QR 이미지 선택 (브라우저 밖으로 전송되지 않습니다)', { class: 'io-label' }), file,
      imageOut));
    return () => {
      destroyed = true;
      stopCamera('');
      for (const pending of qrPending.values()) pending.reject(new DOMException('QR 해독이 취소되었습니다.', 'AbortError'));
      qrPending.clear();
      qrWorker?.terminate();
      qrWorker = null;
    };
  },
});

/* ---------- EXIF 뷰어 / 메타데이터 제거 (JPEG APP1 · TIFF IFD 직접 파싱) ---------- */
const EXIF_TAGS = {
  0x010f: '제조사', 0x0110: '카메라 모델', 0x0112: '회전(Orientation)', 0x0131: '소프트웨어',
  0x0132: '수정 일시', 0x013b: '작성자', 0x8298: '저작권',
  0x829a: '노출 시간', 0x829d: 'F값(조리개)', 0x8827: 'ISO 감도',
  0x9003: '촬영 일시', 0x9004: '디지털화 일시', 0x9207: '측광 모드', 0x9209: '플래시',
  0x920a: '초점 거리', 0xa002: '이미지 너비', 0xa003: '이미지 높이',
  0xa403: '화이트밸런스', 0xa405: '35mm 환산 초점거리', 0xa433: '렌즈 제조사', 0xa434: '렌즈 모델',
};
const EXIF_METADATA_LABELS = {
  APP1: 'APP1 (EXIF/XMP)',
  APP13: 'APP13 (IPTC)',
  COM: 'COM (주석)',
};
function exifRows({ ifd0, exif, gps }) {
  const fmtVal = (tag, v) => {
    if (tag === 0x829a && v > 0 && v < 1) return `1/${Math.round(1 / v)} 초`;
    if (tag === 0x829d) return 'f/' + (+v).toFixed(1);
    if (tag === 0x920a) return (+v).toFixed(1) + ' mm';
    if (tag === 0xa405) return v + ' mm';
    return Array.isArray(v) ? v.join(', ') : String(v);
  };
  const rows = [];
  for (const src of [ifd0, exif])
    for (const [tag, v] of Object.entries(src)) {
      const name = EXIF_TAGS[+tag];
      if (name) rows.push([name, fmtVal(+tag, v)]);
    }
  if (Array.isArray(gps[2]) && Array.isArray(gps[4])) {
    const dms = (a) => a[0] + a[1] / 60 + a[2] / 3600;
    const lat = dms(gps[2]) * (gps[1] === 'S' ? -1 : 1);
    const lon = dms(gps[4]) * (gps[3] === 'W' ? -1 : 1);
    rows.push(['GPS 좌표 ⚠', lat.toFixed(6) + ', ' + lon.toFixed(6)]);
    if (gps[6] != null) rows.push(['GPS 고도', (+gps[6]).toFixed(1) + ' m']);
  }
  return rows;
}

tool({
  id: 'exif-viewer', cat: CAT, name: 'EXIF 뷰어 / 메타데이터 제거',
  desc: '사진의 EXIF(촬영 정보, GPS 위치)를 확인하고, 재압축 없이 메타데이터만 제거합니다.',
  keywords: 'exif metadata gps remove strip privacy jpeg png 위치정보',
  render(root) {
    const out = h('div');
    const file = h('input', {
      type: 'file', accept: 'image/jpeg,image/png', multiple: true,
      'data-file-max-count': 100,
    });
    const wrap = h('div', { class: 'io' },
      formLabel(file, '사진 선택 (여러 장 가능, 브라우저 밖으로 전송되지 않습니다)', { class: 'io-label' }), file,
      h('p', { class: 'note' }, '메타데이터 세그먼트만 삭제하고 픽셀 데이터는 건드리지 않으므로 화질이 그대로 유지됩니다.'), out);
    const runner = createAsyncRunner(wrap, { controls: () => [file], errorOut: out });
    file.addEventListener('change', () => runner.run(async (task) => {
      const list = [...file.files];
      if (!list.length) throw new Error('확인할 사진을 선택하세요.');
      const { readExif, stripJpegMetadata, stripPngMetadata } = await loadImageDataModule();
      out.innerHTML = '';
      const many = list.length > 1;
      const zipRow = h('div', { class: 'btn-row', style: { marginBottom: '10px' } });
      const cleans = []; // ZIP용 [{name, data}]
      const failures = [];
      if (many) out.append(zipRow);
      for (let index = 0; index < list.length; index++) {
        throwIfAborted(task.signal);
        task.progress(`메타데이터를 검사하는 중… (${index + 1}/${list.length})`);
        const f = list[index];
        const sec = h('div', { style: many ? { marginBottom: '18px' } : null });
        out.append(sec);
        if (many) sec.append(h('h4', { class: 'mono' }, f.name));
        try {
          const bytes = new Uint8Array(await f.arrayBuffer());
          throwIfAborted(task.signal);
          const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
          const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
          if (!isJpeg && !isPng) throw new Error('JPEG 또는 PNG 파일만 지원합니다.');
          if (isJpeg) {
            const meta = readExif(bytes);
            const rows = meta ? exifRows(meta) : [];
            sec.append(h('h4', null, 'EXIF 정보'),
              rows.length ? kvTable(rows) : h('p', { class: 'note' }, meta ? '주요 EXIF 태그가 비어 있습니다.' : 'EXIF 데이터가 없습니다.'));
          }
          const stripped = isJpeg ? stripJpegMetadata(bytes) : stripPngMetadata(bytes);
          const blob = new Blob([stripped.bytes], { type: isJpeg ? 'image/jpeg' : 'image/png' });
          const removed = stripped.removed.map((name) => EXIF_METADATA_LABELS[name] || name);
          const saved = f.size - blob.size;
          const cleanName = f.name.replace(/(\.[^.]+)?$/, (m) => '_clean' + m);
          if (removed.length) {
            cleans.push({ name: cleanName, data: blob });
            sec.append(
              h('p', null, `제거할 메타데이터: ${removed.join(', ')} — ${saved.toLocaleString()} bytes 감소`),
              h('div', { class: 'btn-row' }, h('button', {
                class: 'btn' + (many ? ' small' : ' primary'), type: 'button',
                onclick: () => download(cleanName, blob),
              }, '메타데이터 제거본 다운로드')));
          } else {
            sec.append(h('p', { class: 'note' }, '제거할 메타데이터 세그먼트가 없습니다.'));
          }
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          failures.push(f);
          sec.append(h('span', { class: 'error' }, `${f.name}: ${error.message}`));
        }
      }
      const zipError = h('span', { role: 'alert' });
      if (cleans.length > 1) {
        zipRow.append(h('button', {
          class: 'btn primary', type: 'button',
          onclick: async () => {
            zipError.textContent = '';
            try { await downloadZip('metadata_clean.zip', cleans); }
            catch (error) { zipError.textContent = 'ZIP 생성 실패: ' + error.message; }
          },
        }, `제거본 전체 ZIP 다운로드 (${cleans.length}개)`), zipError);
      }
      if (failures.length) zipRow.append(h('button', {
        class: 'btn', type: 'button', onclick: () => {
          const transfer = new DataTransfer();
          failures.forEach((item) => transfer.items.add(item));
          file.files = transfer.files;
          file.dispatchEvent(new Event('change', { bubbles: true }));
        },
      }, `실패 항목 다시 시도 (${failures.length}개)`));
    }));
    root.append(wrap);
  },
});

/* ---------- 파비콘 생성기 ---------- */
tool({
  id: 'favicon-gen', cat: CAT, name: '파비콘 생성기',
  desc: '이미지 한 장으로 favicon.ico와 여러 크기의 PNG 파비콘, HTML 태그를 만듭니다.',
  keywords: 'favicon ico png apple touch icon generator site',
  render(root) {
    const SIZES = [16, 32, 48, 180, 192, 512];
    const NAMES = { 180: 'apple-touch-icon.png' };
    const out = h('div');
    const file = h('input', { type: 'file', accept: 'image/*' });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      out.innerHTML = '생성 중...';
      try {
        const { buildIco } = await loadImageDataModule();
        const bmp = await safeCreateImageBitmap(f);
        const sq = Math.min(bmp.width, bmp.height); // 정사각형이 아니면 중앙 크롭
        const sx = (bmp.width - sq) / 2, sy = (bmp.height - sq) / 2;
        const canvases = SIZES.map((s) => {
          const c = h('canvas', { width: s, height: s });
          c.getContext('2d').drawImage(bmp, sx, sy, sq, sq, 0, 0, s, s);
          return c;
        });
        const pngBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));
        const icoPngs = await Promise.all(canvases.slice(0, 3).map(async (c) => new Uint8Array(await (await pngBlob(c)).arrayBuffer())));
        const ico = new Blob([buildIco(icoPngs, [16, 32, 48])], { type: 'image/x-icon' });
        out.innerHTML = '';
        const row = h('div', { style: { display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end', margin: '10px 0' } });
        canvases.forEach((c, i) => {
          const s = SIZES[i];
          const name = NAMES[s] || `favicon-${s}.png`;
          c.style.cssText = 'border:1px solid var(--border);border-radius:4px;image-rendering:pixelated;width:' + Math.min(s, 96) + 'px;height:' + Math.min(s, 96) + 'px';
          row.append(h('div', { style: { textAlign: 'center' } }, c,
            h('div', null, h('button', {
              class: 'btn small', type: 'button',
              onclick: async () => download(name, await pngBlob(c)),
            }, `${s}px`))));
        });
        const snippet = [
          '<link rel="icon" href="/favicon.ico" sizes="32x32">',
          '<link rel="icon" type="image/png" href="/favicon-192.png" sizes="192x192">',
          '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
        ].join('\n');
        const ta = h('textarea', { class: 'mono', rows: 4, readonly: true });
        ta.value = snippet;
        out.append(row,
          h('div', { class: 'btn-row' }, h('button', {
            class: 'btn primary', type: 'button',
            onclick: () => download('favicon.ico', ico),
          }, 'favicon.ico 다운로드 (16+32+48)')),
          h('div', { class: 'out-head', style: { marginTop: '12px' } }, formLabel(ta, 'HTML 태그', { class: 'io-label' }), copyBtn(() => ta.value)),
          ta);
      } catch (e) {
        out.innerHTML = '';
        out.append(h('span', { class: 'error' }, '생성 실패: ' + e.message));
      }
    });
    root.append(h('div', { class: 'io' },
      formLabel(file, '이미지 선택 (512px 이상 정사각형 권장)', { class: 'io-label' }), file, out));
  },
});

/* ---------- 이미지 색상 팔레트 추출 (median cut) ---------- */
function extractPalette(imageData, n) {
  const d = imageData.data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) px.push([d[i], d[i + 1], d[i + 2]]);
  if (!px.length) return [];
  let buckets = [px];
  while (buckets.length < n) {
    // 색 범위가 가장 넓은 버킷을 골라 해당 채널 중앙값에서 분할
    let bi = -1, bc = 0, best = -1;
    buckets.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let mn = 255, mx = 0;
        for (const p of b) { if (p[c] < mn) mn = p[c]; if (p[c] > mx) mx = p[c]; }
        if (mx - mn > best) { best = mx - mn; bi = i; bc = c; }
      }
    });
    // 색이 하나뿐인 버킷만 남으면 더 나눠도 같은 색이 중복될 뿐이므로 멈춘다
    if (bi < 0 || best <= 0) break;
    const b = buckets[bi].sort((x, y) => x[bc] - y[bc]);
    const mid = b.length >> 1;
    buckets.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  // 서로 다른 버킷이 같은 대표색을 내면 한 항목으로 합친다 (같은 색이 여러 번 나오지 않도록)
  const merged = new Map();
  for (const b of buckets) {
    const avg = [0, 1, 2].map((c) => Math.round(b.reduce((a, p) => a + p[c], 0) / b.length));
    const hex = '#' + avg.map((v) => v.toString(16).padStart(2, '0')).join('');
    merged.set(hex, (merged.get(hex) || 0) + b.length);
  }
  return [...merged].map(([hex, count]) => ({ hex, share: count / px.length }))
    .sort((a, b) => b.share - a.share);
}

tool({
  id: 'image-palette', cat: CAT, name: '이미지 색상 팔레트 추출',
  desc: '이미지에서 대표 색상 팔레트를 추출합니다. (median cut 방식)',
  keywords: 'palette color extract dominant image 색상 추출',
  render(root) {
    const out = h('div');
    const file = h('input', { type: 'file', accept: 'image/*' });
    const countSel = h('select', null, [4, 6, 8, 12, 16].map((v) => h('option', { value: v, selected: v === 8 }, v + '색')));
    let bmp = null;
    async function run() {
      if (!bmp) return;
      const scale = Math.min(1, 96 / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale)), hgt = Math.max(1, Math.round(bmp.height * scale));
      const ctx = h('canvas', { width: w, height: hgt }).getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, w, hgt);
      const palette = extractPalette(ctx.getImageData(0, 0, w, hgt), +countSel.value);
      out.innerHTML = '';
      if (!palette.length) { out.append(h('span', { class: 'error' }, '색상을 추출할 수 없습니다 (전부 투명한 이미지).')); return; }
      const bar = h('div', { style: { display: 'flex', height: '44px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', margin: '10px 0' } },
        palette.map((p) => h('div', { title: p.hex, style: { flex: String(Math.max(p.share, 0.02)), background: p.hex } })));
      out.append(bar, kvTable(palette.map((p) => [p.hex, (p.share * 100).toFixed(1) + ' %'])),
        h('p', { class: 'note' }, 'CSS: ' + palette.map((p) => p.hex).join(', ')));
    }
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      bmp = await safeCreateImageBitmap(f);
      run();
    });
    countSel.addEventListener('change', run);
    root.append(h('div', { class: 'io' },
      formLabel(file, '이미지 선택 (브라우저 밖으로 전송되지 않습니다)', { class: 'io-label' }), file,
      h('div', { class: 'opt-row', style: { marginTop: '8px' } }, h('span', { class: 'opt-item' }, formLabel(countSel, '추출 색상 수'), countSel)),
      out));
  },
});

/* ---------- 이미지 → 아스키아트 ---------- */
// 문자셋은 어두운 픽셀 → 밀도 높은 문자(예: '@') 순서로 나열한다 (밝은 픽셀 → 성긴 문자).
const ASCII_RAMPS = {
  simple: ['@', '%', '#', '*', '+', '=', '-', ':', '.', ' '],
  detailed: [
    '$', '@', 'B', '%', '8', '&', 'W', 'M', '#', '*', 'o', 'a', 'h', 'k', 'b', 'd', 'p', 'q', 'w', 'm',
    'Z', 'O', '0', 'Q', 'L', 'C', 'J', 'U', 'Y', 'X', 'z', 'c', 'v', 'u', 'n', 'x', 'r', 'j', 'f', 't',
    '/', '\\', '|', '(', ')', '1', '{', '}', '[', ']', '?', '-', '_', '+', '~', '<', '>', 'i', '!', 'l',
    'I', ';', ':', ',', '"', '^', '`', "'", '.', ' ',
  ],
  blocks: ['█', '▓', '▒', '░', ' '],
};
const ASCII_CHAR_ASPECT = 0.5; // 모노스페이스 글자 셀의 대략적인 너비/높이 비율 (세로 보정용)
const ASCII_MAX_COLS = 300;
const ASCII_CELL_W = 7, ASCII_CELL_H = 14; // 컬러 캔버스 렌더링용 글자 셀 크기(px)

function analyzeAscii(bmp, cols, ramp) {
  const rows = Math.max(1, Math.min(ASCII_MAX_COLS, Math.round((bmp.height / bmp.width) * cols * ASCII_CHAR_ASPECT)));
  const canvas = h('canvas', { width: cols, height: rows });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // 투명 픽셀은 흰 배경과 합성해 밝은 영역(공백)으로 취급한다.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cols, rows);
  ctx.drawImage(bmp, 0, 0, cols, rows);
  const { data } = ctx.getImageData(0, 0, cols, rows);
  const lines = [], colorLines = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    const colorLine = [];
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      line += ramp[Math.min(ramp.length - 1, Math.floor((lum / 255) * ramp.length))];
      colorLine.push(`rgb(${r},${g},${b})`);
    }
    lines.push(line);
    colorLines.push(colorLine);
  }
  return { lines, colorLines, cols, rows };
}

function renderAsciiColorCanvas(lines, colorLines, cols, rows) {
  const canvas = h('canvas', { width: cols * ASCII_CELL_W, height: rows * ASCII_CELL_H });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${ASCII_CELL_H}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textBaseline = 'top';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = lines[y][x];
      if (ch === ' ') continue;
      ctx.fillStyle = colorLines[y][x];
      ctx.fillText(ch, x * ASCII_CELL_W, y * ASCII_CELL_H, ASCII_CELL_W);
    }
  }
  return canvas;
}

tool({
  id: 'image-ascii-art', cat: CAT, name: '이미지 아스키아트 변환기',
  desc: '이미지의 밝기를 분석해 아스키아트(텍스트 그림)로 바꿉니다. 문자 수(세부 정도), 문자셋, 색상 유지 여부를 조절할 수 있습니다.',
  keywords: 'ascii art image to text 텍스트 아트 아스키 그림 변환기',
  render(root) {
    const out = h('div');
    const file = h('input', { type: 'file', accept: 'image/*' });
    const width = h('input', { type: 'number', min: 10, max: ASCII_MAX_COLS, value: 100, style: { width: '80px' } });
    const charset = h('select', null,
      [['simple', '기본 (10단계)'], ['detailed', '상세 (70단계)'], ['blocks', '블록 문자 (░▒▓█)']]
        .map(([v, l]) => h('option', { value: v, selected: v === 'simple' }, l)));
    const invert = h('input', { type: 'checkbox' });
    const colorMode = h('input', { type: 'checkbox' });
    let bmp = null;

    function run() {
      if (!bmp) return;
      out.innerHTML = '';
      try {
        const cols = Math.round(+width.value);
        if (!Number.isFinite(cols) || cols < 10 || cols > ASCII_MAX_COLS)
          throw new Error(`가로 문자 수는 10~${ASCII_MAX_COLS} 사이여야 합니다.`);
        const ramp = invert.checked ? [...ASCII_RAMPS[charset.value]].reverse() : ASCII_RAMPS[charset.value];
        const { lines, colorLines, rows } = analyzeAscii(bmp, cols, ramp);
        const text = lines.join('\n');
        const btnRow = h('div', { class: 'btn-row' },
          copyBtn(() => text, '텍스트 복사'),
          h('button', {
            class: 'btn small', type: 'button',
            onclick: () => download('ascii-art.txt', text, 'text/plain;charset=utf-8'),
          }, 'TXT 다운로드'));
        out.append(h('p', { class: 'note' }, `${cols} × ${rows} 문자 (총 ${(cols * rows).toLocaleString('ko-KR')}자)`), btnRow);
        if (colorMode.checked) {
          const canvas = renderAsciiColorCanvas(lines, colorLines, cols, rows);
          canvas.style.maxWidth = '100%';
          btnRow.append(h('button', {
            class: 'btn small', type: 'button',
            onclick: () => canvas.toBlob((b) => download('ascii-art.png', b, 'image/png')),
          }, 'PNG 다운로드'));
          out.append(h('div', { style: { overflowX: 'auto', marginTop: '10px', background: '#000', borderRadius: '8px' } }, canvas));
        } else {
          out.append(h('pre', {
            class: 'out-html mono',
            style: { whiteSpace: 'pre', overflowX: 'auto', lineHeight: '1', fontSize: '9px', marginTop: '10px' },
          }, text));
        }
      } catch (e) {
        out.append(h('span', { class: 'error' }, e?.message || String(e)));
      }
    }

    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      bmp = await safeCreateImageBitmap(f);
      run();
    });
    [width, charset, invert, colorMode].forEach((el) => el.addEventListener('input', run));
    root.append(h('div', { class: 'io' },
      formLabel(file, '이미지 선택 (브라우저 밖으로 전송되지 않습니다)', { class: 'io-label' }), file,
      h('div', { class: 'opt-row', style: { marginTop: '8px' } },
        h('span', { class: 'opt-item' }, formLabel(width, '가로 문자 수(세부 정도)'), width),
        h('span', { class: 'opt-item' }, formLabel(charset, '문자셋'), charset),
        h('span', { class: 'opt-item' }, formLabel(invert, '밝기 반전'), invert),
        h('span', { class: 'opt-item' }, formLabel(colorMode, '원본 색상 유지'), colorMode)),
      out));
  },
});
