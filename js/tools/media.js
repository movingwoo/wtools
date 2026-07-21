// 이미지 / 미디어 / QR
import { tool, makeIO, h, kvTable, loadScript, LIB, download, downloadZip, copyBtn, bytesToB64 } from '../core.js';

const CAT = '이미지 / 미디어 / QR';

async function makeQR(text, ecl, size) {
  await loadScript(LIB.qrcode);
  const qr = qrcode(0, ecl);
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cell = Math.max(2, Math.floor(size / (count + 8)));
  const margin = cell * 4;
  const dim = count * cell + margin * 2;
  const canvas = h('canvas', { width: dim, height: dim });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = '#000';
  for (let r = 0; r < count; r++)
    for (let c = 0; c < count; c++)
      if (qr.isDark(r, c)) ctx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
  return canvas;
}

tool({
  id: 'qr-generate', cat: CAT, name: 'QR 코드 생성기',
  desc: '텍스트나 URL을 QR 코드로 생성하고 PNG로 저장합니다.',
  keywords: 'qr code generate url png',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '텍스트 / URL', rows: 3, value: 'https://github.com' }],
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
  render(root) {
    // 이미지 → Base64
    root.append(h('h3', null, '이미지 → Base64'));
    const fileOut = h('div');
    const file = h('input', { type: 'file', accept: 'image/*' });
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
          h('div', { class: 'out-head' }, h('label', { class: 'io-label' }, `Data URI (${f.type}, ${(uri.length / 1024).toFixed(1)} KB)`), copyBtn(() => ta.value)),
          ta, h('img', { src: uri, class: 'img-preview', style: { maxHeight: '200px', marginTop: '8px' } }));
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
      process(text, o) {
        text = text.trim();
        if (!text) return '';
        const uri = text.startsWith('data:') ? text : `data:${o.mime};base64,${text.replace(/\s/g, '')}`;
        const img = h('img', { src: uri, class: 'img-preview', style: { maxHeight: '300px' } });
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

let gifenc = null;
async function encodeGIF(imageData) {
  gifenc ??= await import('https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm');
  const palette = gifenc.quantize(imageData.data, 256);
  const index = gifenc.applyPalette(imageData.data, palette);
  const gif = gifenc.GIFEncoder();
  gif.writeFrame(index, imageData.width, imageData.height, { palette });
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

function encodeSVG(canvas) {
  const uri = canvas.toDataURL('image/png');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image width="${canvas.width}" height="${canvas.height}" href="${uri}"/></svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

tool({
  id: 'image-convert', cat: CAT, name: '이미지 포맷 변환기',
  desc: '이미지 포맷·품질·크기를 조정하고 여러 결과를 ZIP으로 내려받습니다.',
  keywords: 'image convert png jpeg webp gif bmp svg resize compress quality metadata',
  render(root) {
    const out = h('div');
    const file = h('input', { type: 'file', accept: 'image/*', multiple: true });
    const fmt = h('select', null, [['original', '원본 포맷 유지'], ['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP'], ['image/gif', 'GIF'], ['image/bmp', 'BMP'], ['image/svg+xml', 'SVG']]
      .map(([v, l]) => h('option', { value: v, selected: v === 'image/png' }, l)));
    const quality = h('input', { type: 'range', min: 10, max: 100, value: 90, style: { width: '120px' } });
    const qualityValue = h('span', { class: 'mono' }, '90');
    const resizeMode = h('select', null,
      h('option', { value: 'percent' }, '비율(%)'), h('option', { value: 'max' }, '최대 폭·높이'));
    const scale = h('input', { type: 'number', value: 100, style: { width: '70px' } });
    const maxWidth = h('input', { type: 'number', min: 1, value: 1920, style: { width: '80px' } });
    const maxHeight = h('input', { type: 'number', min: 1, value: 1080, style: { width: '80px' } });
    const noUpscale = h('input', { type: 'checkbox' });
    noUpscale.checked = true;
    const percentOpt = h('span', { class: 'opt-item' }, h('label', null, '크기(%)'), scale);
    const maxOpts = h('span', { class: 'opt-item', style: { display: 'none' } },
      h('label', null, '최대 폭'), maxWidth, h('label', null, '높이'), maxHeight);
    const info = h('span', { style: { color: 'var(--muted)' } });
    let items = []; // [{ name, type, size, img, url }]
    let outUrls = [];
    let seq = 0;

    function dimensions(img) {
      let s;
      if (resizeMode.value === 'max') {
        const mw = +maxWidth.value, mh = +maxHeight.value;
        if (mw <= 0 || mh <= 0) throw new Error('최대 폭과 높이는 1 이상이어야 합니다.');
        s = Math.min(mw / img.naturalWidth, mh / img.naturalHeight);
      } else {
        if (+scale.value <= 0) throw new Error('크기 비율은 1 이상이어야 합니다.');
        s = +scale.value / 100;
      }
      if (noUpscale.checked) s = Math.min(1, s);
      return {
        w: Math.max(1, Math.round(img.naturalWidth * s)),
        hgt: Math.max(1, Math.round(img.naturalHeight * s)),
      };
    }

    async function convertOne(img, type, q) {
      const { w, hgt } = dimensions(img);
      const canvas = h('canvas', { width: w, height: hgt });
      const ctx = canvas.getContext('2d');
      // 투명도가 없는 포맷은 흰 배경으로 합성
      if (type === 'image/jpeg' || type === 'image/bmp' || type === 'image/gif') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hgt); }
      ctx.drawImage(img, 0, 0, w, hgt);
      let blob;
      if (type === 'image/bmp') blob = encodeBMP(ctx.getImageData(0, 0, w, hgt));
      else if (type === 'image/gif') blob = await encodeGIF(ctx.getImageData(0, 0, w, hgt));
      else if (type === 'image/svg+xml') blob = encodeSVG(canvas);
      else blob = await new Promise((res) => canvas.toBlob(res, type, q));
      if (!blob) throw new Error('이 브라우저는 해당 포맷 인코딩을 지원하지 않습니다.');
      return { blob, w, hgt };
    }

    async function convert() {
      if (!items.length) return;
      const my = ++seq;
      const q = +quality.value / 100;
      const progress = h('p', { class: 'note' }, '변환 중...');
      outUrls.forEach((u) => URL.revokeObjectURL(u));
      outUrls = [];
      out.innerHTML = '';
      out.append(progress);
      const frag = h('div');
      const results = []; // ZIP용 [{name, data}]
      for (let i = 0; i < items.length; i++) {
        if (items.length > 1) progress.textContent = `변환 중... (${i + 1}/${items.length})`;
        const item = items[i];
        try {
          let type = fmt.value === 'original' ? item.type : fmt.value;
          if (type === 'image/jpg') type = 'image/jpeg';
          if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml'].includes(type))
            throw new Error('이 파일의 원본 포맷은 출력할 수 없습니다. 다른 출력 포맷을 선택하세요.');
          const { blob, w, hgt } = await convertOne(item.img, type, q);
          if (my !== seq) return;
          const ext = type === 'image/svg+xml' ? 'svg' : type === 'image/jpeg' ? 'jpg' : type.split('/')[1];
          const outName = items.length === 1 ? 'converted.' + ext : item.name.replace(/\.[^.]+$/, '') + '.' + ext;
          const uri = URL.createObjectURL(blob);
          outUrls.push(uri);
          results.push({ name: outName, data: blob });
          const change = item.size ? (1 - blob.size / item.size) * 100 : null;
          const sizeText = `${(item.size / 1024).toFixed(1)} KB → ${(blob.size / 1024).toFixed(1)} KB` +
            (change == null ? '' : ` (${change >= 0 ? change.toFixed(1) + '% 감소' : (-change).toFixed(1) + '% 증가'})`);
          frag.append(h('div', { style: { marginBottom: '14px' } },
            h('img', { src: uri, class: 'img-preview', style: { maxHeight: items.length > 1 ? '160px' : '260px' } }),
            h('p', null, `${items.length > 1 ? item.name + ' → ' + outName + ' — ' : ''}${w} × ${hgt}, ${sizeText} `,
              h('button', { class: 'btn small', type: 'button', onclick: () => download(outName, blob) }, '다운로드'))));
        } catch (e) {
          if (my !== seq) return;
          frag.append(h('p', null, h('span', { class: 'error' }, `${item.name} 변환 실패: ${e.message}`)));
        }
      }
      if (my !== seq) return;
      out.innerHTML = '';
      if (results.length > 1)
        out.append(h('div', { class: 'btn-row', style: { marginBottom: '10px' } },
          h('button', {
            class: 'btn primary', type: 'button',
            onclick: () => downloadZip('converted.zip', results).catch((e) => alert('ZIP 생성 실패: ' + e.message)),
          }, `전체 ZIP 다운로드 (${results.length}개)`)));
      out.append(frag);
    }

    file.addEventListener('change', async () => {
      const list = [...file.files];
      if (!list.length) return;
      info.textContent = '이미지 로딩 중...';
      items.forEach((it) => URL.revokeObjectURL(it.url));
      items = [];
      const failed = [];
      for (const f of list) {
        const img = new Image();
        const url = URL.createObjectURL(f);
        const ok = await new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = url; });
        if (ok) items.push({ name: f.name, type: f.type, size: f.size, img, url });
        else { URL.revokeObjectURL(url); failed.push(f.name); }
      }
      info.textContent = (items.length === 1
        ? `원본: ${items[0].img.naturalWidth} × ${items[0].img.naturalHeight}`
        : `${items.length}개 파일 선택됨`) +
        (failed.length ? ` — 로드 실패: ${failed.join(', ')}` : '');
      convert();
    });
    resizeMode.addEventListener('change', () => {
      percentOpt.style.display = resizeMode.value === 'percent' ? '' : 'none';
      maxOpts.style.display = resizeMode.value === 'max' ? '' : 'none';
      convert();
    });
    quality.addEventListener('input', () => { qualityValue.textContent = quality.value; convert(); });
    [fmt, scale, maxWidth, maxHeight, noUpscale].forEach((el) => el.addEventListener('input', convert));
    root.append(
      h('div', { class: 'io' },
        h('label', { class: 'io-label' }, '이미지 선택 (여러 장 가능)'), file, info,
        h('div', { class: 'opt-row', style: { marginTop: '10px' } },
          h('span', { class: 'opt-item' }, h('label', null, '출력 포맷'), fmt),
          h('span', { class: 'opt-item' }, h('label', null, '품질(JPEG/WebP)'), quality, qualityValue),
          h('span', { class: 'opt-item' }, h('label', null, '크기 방식'), resizeMode),
          percentOpt, maxOpts,
          h('span', { class: 'opt-item' }, h('label', null, '확대하지 않기'), noUpscale)),
        h('p', { class: 'note' }, '결과는 캔버스로 다시 인코딩되어 EXIF·GPS 등 원본 메타데이터가 제거됩니다. 화질을 유지한 채 메타데이터만 삭제하려면 EXIF 뷰어 / 메타데이터 제거 도구를 사용하세요. GIF는 첫 프레임만 처리되며 SVG 출력은 PNG를 내장한 파일입니다.'),
        out));
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

    let raf = 0;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
    [tol, feather].forEach((el) => el.addEventListener('input', schedule));

    file.addEventListener('change', () => {
      const f = file.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        const canvas = h('canvas', { width: img.naturalWidth, height: img.naturalHeight });
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        src = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
        key = autoKey();
        setKeyLabel();
        apply();
      };
      img.src = URL.createObjectURL(f);
    });

    root.append(
      h('div', { class: 'io' },
        h('label', { class: 'io-label' }, '이미지 선택 (브라우저 밖으로 전송되지 않습니다)'), file,
        h('div', { class: 'opt-row', style: { marginTop: '10px' } },
          h('span', { class: 'opt-item' }, h('label', null, '배경색'), swatch, keyLabel),
          h('span', { class: 'opt-item' }, h('label', null, '허용 오차'), tol),
          h('span', { class: 'opt-item' }, h('label', null, '경계 부드럽게'), feather)),
        h('p', { class: 'note' }, '배경색은 모서리에서 자동 감지합니다. 결과가 이상하면 미리보기에서 배경 부분을 클릭해 색을 다시 지정하세요.'),
        out));
  },
});

/* ---------- QR 코드 리더 ---------- */
tool({
  id: 'qr-read', cat: CAT, name: 'QR 코드 리더',
  desc: 'QR 코드 이미지를 업로드하거나 클립보드에서 붙여넣어 내용을 해독합니다.',
  keywords: 'qr code read scan decode reader wifi',
  render(root) {
    const out = h('div');
    async function decode(src) {
      out.innerHTML = '해독 중...';
      try {
        await loadScript(LIB.jsqr);
        const bmp = await createImageBitmap(src);
        // 너무 큰 이미지는 축소 (해상도가 충분히 크면 인식률에 영향 없음)
        const scale = Math.min(1, 1500 / Math.max(bmp.width, bmp.height));
        const w = Math.round(bmp.width * scale), hgt = Math.round(bmp.height * scale);
        const ctx = h('canvas', { width: w, height: hgt }).getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bmp, 0, 0, w, hgt);
        const res = jsQR(ctx.getImageData(0, 0, w, hgt).data, w, hgt);
        out.innerHTML = '';
        if (!res?.data) {
          out.append(h('span', { class: 'error' }, 'QR 코드를 찾지 못했습니다. 이미지가 선명한지, 코드 주변에 여백이 있는지 확인하세요.'));
          return;
        }
        const text = res.data;
        const rows = [['내용', text], ['길이', text.length + '자']];
        if (/^https?:\/\//i.test(text)) rows.push(['유형', 'URL']);
        else if (text.startsWith('WIFI:')) {
          rows.push(['유형', 'WiFi 접속 정보']);
          const g = (k) => (text.match(new RegExp(k + ':((?:\\\\.|[^;])*)')) || [])[1]?.replace(/\\(.)/g, '$1');
          for (const [key, label] of [['S', 'SSID'], ['P', '비밀번호'], ['T', '보안']])
            if (g(key)) rows.push([label, g(key)]);
        } else if (text.startsWith('mailto:')) rows.push(['유형', '이메일']);
        else if (text.startsWith('tel:')) rows.push(['유형', '전화번호']);
        out.append(kvTable(rows));
        if (/^https?:\/\//i.test(text))
          out.append(h('p', null, h('a', { href: text, target: '_blank', rel: 'noopener noreferrer' }, text)));
      } catch (e) {
        out.innerHTML = '';
        out.append(h('span', { class: 'error' }, '해독 실패: ' + e.message));
      }
    }
    const file = h('input', { type: 'file', accept: 'image/*' });
    file.addEventListener('change', () => file.files[0] && decode(file.files[0]));
    const pasteBtn = h('button', {
      class: 'btn', type: 'button',
      onclick: async () => {
        try {
          for (const item of await navigator.clipboard.read()) {
            const type = item.types.find((t) => t.startsWith('image/'));
            if (type) return decode(await item.getType(type));
          }
          out.innerHTML = '';
          out.append(h('span', { class: 'error' }, '클립보드에 이미지가 없습니다.'));
        } catch {
          out.innerHTML = '';
          out.append(h('span', { class: 'error' }, '클립보드 읽기가 거부되었습니다. 파일 선택을 이용하세요.'));
        }
      },
    }, '클립보드 이미지 붙여넣기');
    root.append(h('div', { class: 'io' },
      h('label', { class: 'io-label' }, 'QR 이미지 선택 (브라우저 밖으로 전송되지 않습니다)'), file,
      h('div', { class: 'btn-row', style: { marginTop: '8px' } }, pasteBtn), out));
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
function readExif(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let tiff = null, i = 2;
  while (i + 4 < bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker === 0xda) break;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(i + 4, i + 8)) === 'Exif') { tiff = i + 10; break; }
    i += 2 + len;
  }
  if (tiff == null) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset + tiff);
  const le = dv.getUint16(0) === 0x4949;
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  function readVal(type, count, off) {
    if (type === 2) {
      let s = '';
      for (let k = 0; k < count; k++) { const c = dv.getUint8(off + k); if (!c) break; s += String.fromCharCode(c); }
      return s.trim();
    }
    const rd = (o) =>
      type === 3 ? u16(o) : type === 4 ? u32(o) : type === 9 ? dv.getInt32(o, le) :
      type === 5 ? u32(o) / (u32(o + 4) || 1) : type === 10 ? dv.getInt32(o, le) / (dv.getInt32(o + 4, le) || 1) :
      dv.getUint8(o);
    const vals = [];
    for (let k = 0; k < Math.min(count, 16); k++) vals.push(rd(off + k * SIZE[type]));
    return count === 1 ? vals[0] : vals;
  }
  function readIFD(offset) {
    const entries = {};
    if (offset + 2 > dv.byteLength) return entries;
    const n = u16(offset);
    for (let e = 0; e < n; e++) {
      const base = offset + 2 + e * 12;
      if (base + 12 > dv.byteLength) break;
      const tag = u16(base), type = u16(base + 2), count = u32(base + 4);
      if (!SIZE[type]) continue;
      const size = SIZE[type] * count;
      const off = size <= 4 ? base + 8 : u32(base + 8);
      if (off + size > dv.byteLength) continue;
      entries[tag] = readVal(type, count, off);
    }
    return entries;
  }
  const ifd0 = readIFD(u32(4));
  return {
    ifd0,
    exif: ifd0[0x8769] != null ? readIFD(ifd0[0x8769]) : {},
    gps: ifd0[0x8825] != null ? readIFD(ifd0[0x8825]) : {},
  };
}
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
function stripJpeg(bytes) {
  const keep = [bytes.subarray(0, 2)];
  const removed = [];
  const META = { 0xe1: 'APP1 (EXIF/XMP)', 0xed: 'APP13 (IPTC)', 0xfe: 'COM (주석)' };
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker === 0xda) { keep.push(bytes.subarray(i)); break; } // SOS부터 끝까지 그대로
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (META[marker]) { if (!removed.includes(META[marker])) removed.push(META[marker]); }
    else keep.push(bytes.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return { blob: new Blob(keep, { type: 'image/jpeg' }), removed };
}
function stripPng(bytes) {
  const keep = [bytes.subarray(0, 8)];
  const removed = [];
  const STRIP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
  let i = 8;
  while (i + 8 <= bytes.length) {
    const len = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    if (STRIP.has(type)) { if (!removed.includes(type)) removed.push(type); }
    else keep.push(bytes.subarray(i, i + 12 + len));
    i += 12 + len;
    if (type === 'IEND') break;
  }
  return { blob: new Blob(keep, { type: 'image/png' }), removed };
}

tool({
  id: 'exif-viewer', cat: CAT, name: 'EXIF 뷰어 / 메타데이터 제거',
  desc: '사진의 EXIF(촬영 정보, GPS 위치)를 확인하고, 재압축 없이 메타데이터만 제거합니다.',
  keywords: 'exif metadata gps remove strip privacy jpeg png 위치정보',
  render(root) {
    const out = h('div');
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png', multiple: true });
    file.addEventListener('change', async () => {
      const list = [...file.files];
      if (!list.length) return;
      out.innerHTML = '';
      const many = list.length > 1;
      const zipRow = h('div', { class: 'btn-row', style: { marginBottom: '10px' } });
      const cleans = []; // ZIP용 [{name, data}]
      if (many) out.append(zipRow);
      for (const f of list) {
        const sec = h('div', { style: many ? { marginBottom: '18px' } : null });
        out.append(sec);
        if (many) sec.append(h('h4', { class: 'mono' }, f.name));
        const bytes = new Uint8Array(await f.arrayBuffer());
        const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
        if (!isJpeg && !isPng) {
          sec.append(h('span', { class: 'error' }, 'JPEG 또는 PNG 파일만 지원합니다.'));
          continue;
        }
        if (isJpeg) {
          const meta = readExif(bytes);
          const rows = meta ? exifRows(meta) : [];
          sec.append(h('h4', null, 'EXIF 정보'),
            rows.length ? kvTable(rows) : h('p', { class: 'note' }, meta ? '주요 EXIF 태그가 비어 있습니다.' : 'EXIF 데이터가 없습니다.'));
        }
        const { blob, removed } = isJpeg ? stripJpeg(bytes) : stripPng(bytes);
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
      }
      if (cleans.length > 1)
        zipRow.append(h('button', {
          class: 'btn primary', type: 'button',
          onclick: () => downloadZip('metadata_clean.zip', cleans).catch((e) => alert('ZIP 생성 실패: ' + e.message)),
        }, `제거본 전체 ZIP 다운로드 (${cleans.length}개)`));
    });
    root.append(h('div', { class: 'io' },
      h('label', { class: 'io-label' }, '사진 선택 (여러 장 가능, 브라우저 밖으로 전송되지 않습니다)'), file,
      h('p', { class: 'note' }, '메타데이터 세그먼트만 삭제하고 픽셀 데이터는 건드리지 않으므로 화질이 그대로 유지됩니다.'), out));
  },
});

/* ---------- 파비콘 생성기 (PNG 내장 ICO 빌더) ---------- */
function buildICO(pngs, sizes) {
  let offset = 6 + 16 * pngs.length;
  const buf = new Uint8Array(offset + pngs.reduce((a, p) => a + p.length, 0));
  const dv = new DataView(buf.buffer);
  dv.setUint16(2, 1, true); // type: icon
  dv.setUint16(4, pngs.length, true);
  pngs.forEach((p, i) => {
    const e = 6 + i * 16;
    buf[e] = sizes[i] >= 256 ? 0 : sizes[i];
    buf[e + 1] = sizes[i] >= 256 ? 0 : sizes[i];
    dv.setUint16(e + 4, 1, true); // planes
    dv.setUint16(e + 6, 32, true); // bpp
    dv.setUint32(e + 8, p.length, true);
    dv.setUint32(e + 12, offset, true);
    buf.set(p, offset);
    offset += p.length;
  });
  return new Blob([buf], { type: 'image/x-icon' });
}

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
        const bmp = await createImageBitmap(f);
        const sq = Math.min(bmp.width, bmp.height); // 정사각형이 아니면 중앙 크롭
        const sx = (bmp.width - sq) / 2, sy = (bmp.height - sq) / 2;
        const canvases = SIZES.map((s) => {
          const c = h('canvas', { width: s, height: s });
          c.getContext('2d').drawImage(bmp, sx, sy, sq, sq, 0, 0, s, s);
          return c;
        });
        const pngBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));
        const icoPngs = await Promise.all(canvases.slice(0, 3).map(async (c) => new Uint8Array(await (await pngBlob(c)).arrayBuffer())));
        const ico = buildICO(icoPngs, [16, 32, 48]);
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
          h('div', { class: 'out-head', style: { marginTop: '12px' } }, h('label', { class: 'io-label' }, 'HTML 태그'), copyBtn(() => ta.value)),
          ta);
      } catch (e) {
        out.innerHTML = '';
        out.append(h('span', { class: 'error' }, '생성 실패: ' + e.message));
      }
    });
    root.append(h('div', { class: 'io' },
      h('label', { class: 'io-label' }, '이미지 선택 (512px 이상 정사각형 권장)'), file, out));
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
    if (bi < 0) break;
    const b = buckets[bi].sort((x, y) => x[bc] - y[bc]);
    const mid = b.length >> 1;
    buckets.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return buckets.map((b) => {
    const avg = [0, 1, 2].map((c) => Math.round(b.reduce((a, p) => a + p[c], 0) / b.length));
    return { hex: '#' + avg.map((v) => v.toString(16).padStart(2, '0')).join(''), share: b.length / px.length };
  }).sort((a, b) => b.share - a.share);
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
      bmp = await createImageBitmap(f);
      run();
    });
    countSel.addEventListener('change', run);
    root.append(h('div', { class: 'io' },
      h('label', { class: 'io-label' }, '이미지 선택 (브라우저 밖으로 전송되지 않습니다)'), file,
      h('div', { class: 'opt-row', style: { marginTop: '8px' } }, h('span', { class: 'opt-item' }, h('label', null, '추출 색상 수'), countSel)),
      out));
  },
});
