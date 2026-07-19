// 압축 / 아카이브
import { tool, makeIO, h, kvTable, strToBytes, bytesToStr, bytesToB64, b64ToBytes, bytesToHex, hexToBytes, decodeInput, loadScript, LIB, download } from '../core.js';

const CAT = '압축 / 아카이브';

function outBytes(bytes, fmt) {
  return fmt === 'hex' ? bytesToHex(bytes) : fmt === 'text' ? bytesToStr(bytes) : bytesToB64(bytes);
}
function ratio(orig, comp) {
  return `원본 ${orig}B → ${comp}B (${orig ? ((1 - comp / orig) * 100).toFixed(1) : 0}% 감소)`;
}

/* ---------- pako: gzip / deflate ---------- */
function pakoTool({ id, name, deflate, inflate, desc, keywords, fileExt }) {
  tool({
    id, cat: CAT, name, desc, keywords,
    render(root) {
      if (fileExt) root.append(h('h3', null, '텍스트 / Base64 / Hex'));
      makeIO(root, {
        inputs: [{ id: 'input', label: '입력', rows: 6, value: 'The quick brown fox jumps over the lazy dog. '.repeat(3) }],
        options: [
          { id: 'ifmt', label: '입력 형식', type: 'select', values: [['text', '텍스트'], ['base64', 'Base64'], ['hex', 'Hex']] },
          { id: 'ofmt', label: '출력 형식', type: 'select', values: [['base64', 'Base64'], ['hex', 'Hex'], ['text', '텍스트']] },
          { id: 'level', label: '압축 레벨', type: 'select', values: [['6', '6 (기본)'], ['9', '9 (최대)'], ['1', '1 (빠름)']] },
        ],
        actions: [{ id: 'comp', label: '압축' }, { id: 'decomp', label: '해제' }],
        autorun: false,
        async process(text, o, action) {
          await loadScript(LIB.pako);
          const input = decodeInput(text, o.ifmt);
          if (action === 'decomp') {
            const res = inflate(input);
            return outBytes(res, o.ofmt);
          }
          const res = deflate(input, { level: +o.level });
          const note = ratio(input.length, res.length);
          return outBytes(res, o.ofmt) + `\n\n// ${note}`;
        },
      });

      // 파일 압축/해제
      if (fileExt) {
        root.append(h('h3', { style: { marginTop: '26px' } }, '파일 압축/해제'));
        const fileOut = h('div');
        const picker = h('input', { type: 'file' });
        const handle = async (mode) => {
          const f = picker.files[0];
          if (!f) { fileOut.textContent = '파일을 먼저 선택하세요.'; return; }
          fileOut.textContent = mode === 'comp' ? '압축 중...' : '해제 중...';
          try {
            await loadScript(LIB.pako);
            const buf = new Uint8Array(await f.arrayBuffer());
            let res, outName;
            if (mode === 'comp') {
              res = deflate(buf, { level: 6 });
              outName = f.name + fileExt;
            } else {
              res = inflate(buf);
              outName = f.name.toLowerCase().endsWith(fileExt) ? f.name.slice(0, -fileExt.length) : f.name + '.out';
            }
            download(outName, new Blob([res]));
            fileOut.innerHTML = '';
            fileOut.append(h('p', null,
              `${f.name} (${buf.length.toLocaleString()} B) → ${outName} (${res.length.toLocaleString()} B)`,
              mode === 'comp' ? ` — ${((1 - res.length / (buf.length || 1)) * 100).toFixed(1)}% 감소` : ''));
          } catch (e) {
            fileOut.innerHTML = '';
            fileOut.append(h('span', { class: 'error' }, '실패: ' + e.message));
          }
        };
        root.append(picker,
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn primary', type: 'button', onclick: () => handle('comp') }, `압축 (${fileExt})`),
            h('button', { class: 'btn', type: 'button', onclick: () => handle('decomp') }, '해제')),
          fileOut);
      }
    },
  });
}
pakoTool({ id: 'gzip', name: 'Gzip 압축/해제', deflate: (d, o) => pako.gzip(d, o), inflate: (d) => pako.ungzip(d), desc: 'Gzip으로 데이터나 파일을 압축하거나 해제합니다.', keywords: 'gzip gz compress file', fileExt: '.gz' });
pakoTool({ id: 'raw-deflate', name: 'Raw Deflate/Inflate', deflate: (d, o) => pako.deflateRaw(d, o), inflate: (d) => pako.inflateRaw(d), desc: 'zlib 헤더 없는 raw deflate/inflate를 수행합니다.', keywords: 'deflate inflate raw zlib' });
pakoTool({ id: 'zlib', name: 'Zlib 압축/해제', deflate: (d, o) => pako.deflate(d, o), inflate: (d) => pako.inflate(d), desc: 'zlib(deflate) 형식으로 압축하거나 해제합니다.', keywords: 'zlib deflate compress' });

/* ---------- LZMA ---------- */
tool({
  id: 'lzma', cat: CAT, name: 'LZMA 압축/해제',
  desc: 'LZMA 알고리즘으로 데이터를 압축하거나 해제합니다.',
  keywords: 'lzma xz compress',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 6, value: 'LZMA 압축 테스트 '.repeat(5) }],
      options: [
        { id: 'ifmt', label: '입력 형식', type: 'select', values: [['text', '텍스트'], ['base64', 'Base64'], ['hex', 'Hex']] },
        { id: 'ofmt', label: '출력 형식', type: 'select', values: [['base64', 'Base64'], ['hex', 'Hex'], ['text', '텍스트']] },
        { id: 'level', label: '압축 레벨(1~9)', type: 'select', values: [['5', '5'], ['9', '9'], ['1', '1']] },
      ],
      actions: [{ id: 'comp', label: '압축' }, { id: 'decomp', label: '해제' }],
      autorun: false,
      async process(text, o, action) {
        await loadScript(LIB.lzma);
        const lzma = LZMA;
        const input = decodeInput(text, o.ifmt);
        return new Promise((res, rej) => {
          if (action === 'decomp') {
            lzma.decompress(Array.from(new Int8Array(input.buffer, input.byteOffset, input.length)), (result, err) => {
              if (err) return rej(new Error('해제 실패: ' + err));
              const bytes = typeof result === 'string' ? strToBytes(result) : new Uint8Array(Int8Array.from(result).buffer);
              res(outBytes(bytes, o.ofmt));
            });
          } else {
            lzma.compress(Array.from(input), +o.level, (result, err) => {
              if (err) return rej(new Error('압축 실패: ' + err));
              const bytes = new Uint8Array(Int8Array.from(result).buffer);
              res(outBytes(bytes, o.ofmt) + `\n\n// ${ratio(input.length, bytes.length)}`);
            });
          }
        });
      },
    });
  },
});

/* ---------- fflate: zip / gzip 대체 ---------- */
let seekBzip = null;
tool({
  id: 'bzip2', cat: CAT, name: 'Bzip2 해제',
  desc: 'Bzip2(.bz2)로 압축된 데이터를 해제합니다. (파일 업로드 또는 Base64/Hex)',
  keywords: 'bzip2 bz2 decompress',
  render(root) {
    // 파일 업로드 해제
    root.append(h('h3', null, '파일 해제'));
    const fileOut = h('div');
    const picker = h('input', { type: 'file', accept: '.bz2' });
    picker.addEventListener('change', async () => {
      const f = picker.files[0];
      if (!f) return;
      fileOut.innerHTML = '해제 중...';
      try {
        seekBzip ??= await import('https://cdn.jsdelivr.net/npm/seek-bzip@2.0.0/+esm');
        const buf = new Uint8Array(await f.arrayBuffer());
        const res = Uint8Array.from((seekBzip.default || seekBzip).decode(buf));
        fileOut.innerHTML = '';
        fileOut.append(h('p', null, `${f.name} → ${res.length.toLocaleString()} bytes `,
          h('button', { class: 'btn small', type: 'button', onclick: () => download(f.name.replace(/\.bz2$/, '') || 'output', new Blob([res])) }, '다운로드')));
        const preview = bytesToStr(res.slice(0, 2000));
        fileOut.append(h('div', { class: 'out-head' }, h('label', { class: 'io-label' }, '미리보기 (최대 2KB)')),
          h('pre', { class: 'out-html', style: { whiteSpace: 'pre-wrap' } }, preview));
      } catch (e) {
        fileOut.innerHTML = '';
        fileOut.append(h('span', { class: 'error' }, '해제 실패: ' + e.message));
      }
    });
    root.append(picker, fileOut);

    // Base64/Hex 해제
    root.append(h('h3', { style: { marginTop: '26px' } }, 'Base64 / Hex 해제'));
    makeIO(root, {
      inputs: [{ id: 'input', label: 'Bzip2 데이터', rows: 5, placeholder: 'Base64 또는 Hex' }],
      options: [
        { id: 'ifmt', label: '입력 형식', type: 'select', values: [['base64', 'Base64'], ['hex', 'Hex']] },
        { id: 'ofmt', label: '출력 형식', type: 'select', values: [['text', '텍스트'], ['base64', 'Base64'], ['hex', 'Hex']] },
      ],
      actions: [{ id: 'decomp', label: '해제' }],
      autorun: false,
      async process(text, o) {
        if (!text.trim()) return '';
        seekBzip ??= await import('https://cdn.jsdelivr.net/npm/seek-bzip@2.0.0/+esm');
        const input = decodeInput(text, o.ifmt);
        const res = Uint8Array.from((seekBzip.default || seekBzip).decode(input));
        return outBytes(res, o.ofmt);
      },
      note: 'Bzip2 압축은 브라우저에서 실용적인 라이브러리가 없어 해제만 제공합니다. 압축이 필요하면 Gzip 또는 Zip을 사용하세요.',
    });
  },
});

tool({
  id: 'lz4', cat: CAT, name: 'LZ4 압축/해제',
  desc: 'LZ4 블록 포맷으로 압축하거나 해제합니다.',
  keywords: 'lz4 compress fast',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 6, value: 'LZ4 fast compression test '.repeat(5) }],
      options: [
        { id: 'ifmt', label: '입력 형식', type: 'select', values: [['text', '텍스트'], ['base64', 'Base64'], ['hex', 'Hex']] },
        { id: 'ofmt', label: '출력 형식', type: 'select', values: [['base64', 'Base64'], ['hex', 'Hex'], ['text', '텍스트']] },
      ],
      actions: [{ id: 'comp', label: '압축' }, { id: 'decomp', label: '해제' }],
      autorun: false,
      async process(text, o, action) {
        const mod = await import('https://cdn.jsdelivr.net/npm/lz4js@0.2.0/+esm');
        const lz4 = mod.default && mod.default.compress ? mod.default : mod;
        const input = decodeInput(text, o.ifmt);
        if (action === 'decomp') {
          const res = lz4.decompress(input);
          return outBytes(new Uint8Array(res), o.ofmt);
        }
        const res = lz4.compress(input);
        return outBytes(new Uint8Array(res), o.ofmt) + `\n\n// ${ratio(input.length, res.length)}`;
      },
      note: 'lz4js의 프레임 포맷을 사용합니다.',
    });
  },
});

/* ---------- ZIP (fflate) ---------- */
tool({
  id: 'zip', cat: CAT, name: 'ZIP 생성/해제',
  desc: '여러 파일을 ZIP으로 묶거나, ZIP 파일의 내용을 나열하고 추출합니다.',
  keywords: 'zip archive unzip compress extract',
  render(root) {
    // ZIP 생성
    root.append(h('h3', null, 'ZIP 만들기'));
    const files = [];
    const fileList = h('div', { style: { margin: '8px 0' } });
    const picker = h('input', { type: 'file', multiple: true });
    picker.addEventListener('change', async () => {
      for (const f of picker.files) files.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
      renderList();
      picker.value = '';
    });
    function renderList() {
      fileList.innerHTML = '';
      if (!files.length) { fileList.append(h('span', { class: 'note' }, '추가된 파일이 없습니다.')); return; }
      files.forEach((f, i) => fileList.append(h('div', null,
        `${f.name} (${f.data.length.toLocaleString()} B) `,
        h('button', { class: 'copy-mini', type: 'button', onclick: () => { files.splice(i, 1); renderList(); } }, '제거'))));
    }
    const zipBtn = h('button', { class: 'btn primary', type: 'button' }, 'ZIP 다운로드');
    zipBtn.addEventListener('click', async () => {
      if (!files.length) return;
      await loadScript(LIB.fflate);
      const obj = {};
      for (const f of files) obj[f.name] = f.data;
      fflate.zip(obj, { level: 6 }, (err, data) => {
        if (err) return alert('압축 실패: ' + err.message);
        download('wtools.zip', new Blob([data], { type: 'application/zip' }));
      });
    });
    renderList();
    root.append(picker, fileList, h('div', { class: 'btn-row' }, zipBtn));

    // ZIP 해제
    root.append(h('h3', { style: { marginTop: '26px' } }, 'ZIP 풀기'));
    const unzipOut = h('div');
    const unzipPicker = h('input', { type: 'file', accept: '.zip' });
    unzipPicker.addEventListener('change', async () => {
      const f = unzipPicker.files[0];
      if (!f) return;
      await loadScript(LIB.fflate);
      const buf = new Uint8Array(await f.arrayBuffer());
      fflate.unzip(buf, (err, unzipped) => {
        if (err) { unzipOut.innerHTML = ''; unzipOut.append(h('span', { class: 'error' }, '해제 실패: ' + err.message)); return; }
        const rows = Object.entries(unzipped);
        unzipOut.innerHTML = '';
        unzipOut.append(h('table', { class: 'grid' },
          h('tr', null, ['파일명', '크기', ''].map((x) => h('th', null, x))),
          rows.map(([name, data]) => h('tr', null,
            h('td', { class: 'mono' }, name),
            h('td', null, data.length.toLocaleString() + ' B'),
            h('td', null, h('button', { class: 'copy-mini', type: 'button', onclick: () => download(name.split('/').pop() || 'file', new Blob([data])) }, '저장'))))));
      });
    });
    root.append(unzipPicker, unzipOut);
  },
});

/* ---------- TAR (fflate) ---------- */
tool({
  id: 'tar', cat: CAT, name: 'Tar 아카이브/해제',
  desc: '여러 파일을 tar로 묶거나 tar/tar.gz의 내용을 나열합니다.',
  keywords: 'tar archive gzip tgz',
  render(root) {
    // TAR 생성 (순수 JS 구현)
    root.append(h('h3', null, 'Tar 만들기'));
    const files = [];
    const fileList = h('div', { style: { margin: '8px 0' } });
    const picker = h('input', { type: 'file', multiple: true });
    picker.addEventListener('change', async () => {
      for (const f of picker.files) files.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
      renderList();
      picker.value = '';
    });
    function renderList() {
      fileList.innerHTML = '';
      if (!files.length) { fileList.append(h('span', { class: 'note' }, '추가된 파일이 없습니다.')); return; }
      files.forEach((f, i) => fileList.append(h('div', null, `${f.name} (${f.data.length} B) `,
        h('button', { class: 'copy-mini', type: 'button', onclick: () => { files.splice(i, 1); renderList(); } }, '제거'))));
    }
    const opts = h('div', { class: 'opt-row' });
    const gzChk = h('input', { type: 'checkbox' });
    opts.append(h('span', { class: 'opt-item' }, gzChk, h('label', null, 'gzip 압축 (.tar.gz)')));
    const tarBtn = h('button', { class: 'btn primary', type: 'button' }, 'Tar 다운로드');
    tarBtn.addEventListener('click', async () => {
      if (!files.length) return;
      let data = buildTar(files);
      let name = 'wtools.tar';
      if (gzChk.checked) { await loadScript(LIB.pako); data = pako.gzip(data); name += '.gz'; }
      download(name, new Blob([data]));
    });
    renderList();
    root.append(picker, fileList, opts, h('div', { class: 'btn-row' }, tarBtn));

    // TAR 해제
    root.append(h('h3', { style: { marginTop: '26px' } }, 'Tar 풀기'));
    const out = h('div');
    const upick = h('input', { type: 'file', accept: '.tar,.gz,.tgz' });
    upick.addEventListener('change', async () => {
      const f = upick.files[0];
      if (!f) return;
      let buf = new Uint8Array(await f.arrayBuffer());
      if (f.name.endsWith('.gz') || f.name.endsWith('.tgz') || (buf[0] === 0x1f && buf[1] === 0x8b)) {
        await loadScript(LIB.pako);
        buf = pako.ungzip(buf);
      }
      const entries = parseTar(buf);
      out.innerHTML = '';
      out.append(h('table', { class: 'grid' },
        h('tr', null, ['파일명', '크기', ''].map((x) => h('th', null, x))),
        entries.map((e) => h('tr', null,
          h('td', { class: 'mono' }, e.name),
          h('td', null, e.data.length.toLocaleString() + ' B'),
          h('td', null, h('button', { class: 'copy-mini', type: 'button', onclick: () => download(e.name.split('/').pop() || 'file', new Blob([e.data])) }, '저장'))))));
    });
    root.append(upick, out);
  },
});

function buildTar(files) {
  const blocks = [];
  for (const f of files) {
    const header = new Uint8Array(512);
    const name = strToBytes(f.name).slice(0, 100);
    header.set(name, 0);
    const write = (str, off, len) => { const b = strToBytes(str); header.set(b.slice(0, len), off); };
    write('0000644', 100, 7); // mode
    write('0000000', 108, 7); // uid
    write('0000000', 116, 7); // gid
    write(f.data.length.toString(8).padStart(11, '0'), 124, 11); // size
    write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0'), 136, 11); // mtime
    header[156] = 0x30; // typeflag '0'
    write('ustar', 257, 5);
    header[263] = 0x30; header[264] = 0x30; // version '00'
    // checksum
    for (let i = 148; i < 156; i++) header[i] = 0x20;
    let sum = 0;
    for (const b of header) sum += b;
    write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    blocks.push(header);
    blocks.push(f.data);
    const pad = (512 - (f.data.length % 512)) % 512;
    if (pad) blocks.push(new Uint8Array(pad));
  }
  blocks.push(new Uint8Array(1024)); // 종료 블록
  const total = blocks.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of blocks) { out.set(b, off); off += b.length; }
  return out;
}
function parseTar(buf) {
  const entries = [];
  let off = 0;
  while (off + 512 <= buf.length) {
    const nameBytes = buf.slice(off, off + 100);
    if (nameBytes.every((b) => b === 0)) break;
    const name = bytesToStr(nameBytes).replace(/\0.*$/, '');
    const sizeStr = bytesToStr(buf.slice(off + 124, off + 135)).replace(/[^0-7]/g, '');
    const size = parseInt(sizeStr, 8) || 0;
    const typeflag = buf[off + 156];
    off += 512;
    if (name && (typeflag === 0x30 || typeflag === 0)) entries.push({ name, data: buf.slice(off, off + size) });
    off += Math.ceil(size / 512) * 512;
  }
  return entries;
}
