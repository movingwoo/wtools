// 압축 / 아카이브
import { tool, makeIO, h, formLabel, kvTable, strToBytes, bytesToStr, bytesToB64, b64ToBytes, bytesToHex, hexToBytes, decodeInput, loadScript, loadModule, LIB, download } from '../core.js';

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
        const picker = h('input', { type: 'file', 'aria-label': '압축하거나 해제할 파일 선택' });
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

/* ---------- Worker 기반 Brotli / Zstandard 및 Bzip2 해제 ---------- */
const CODEC_URLS = {
  brotliCompress: 'https://cdn.jsdelivr.net/npm/brotli-compress@1.3.3/index.mjs',
  brotliDecompress: 'https://cdn.jsdelivr.net/npm/brotli@1.3.3/decompress.js/+esm',
  zstdCompress: 'https://cdn.jsdelivr.net/npm/@bokuweb/zstd-wasm@0.0.27/+esm',
  zstdDecompress: 'https://cdn.jsdelivr.net/npm/fzstd@0.1.1/+esm',
  bzip2Decompress: 'https://cdn.jsdelivr.net/npm/seek-bzip@2.0.0/+esm',
};
const CODEC_WORKER_SOURCE = `
const URLS = ${JSON.stringify(CODEC_URLS)};
self.onmessage = async ({ data: { codec, action, bytes, level } }) => {
  try {
    let result;
    if (codec === 'brotli') {
      if (action === 'comp') {
        const module = await import(URLS.brotliCompress);
        result = await module.compress(bytes, { quality: level });
      } else {
        const module = await import(URLS.brotliDecompress);
        const decompress = module.default || module.decompress || module;
        result = decompress(bytes);
      }
    } else if (codec === 'zstd') {
      if (action === 'comp') {
        const module = await import(URLS.zstdCompress);
        await module.init();
        result = module.compress(bytes, level);
      } else {
        const module = await import(URLS.zstdDecompress);
        result = module.decompress(bytes);
      }
    } else if (codec === 'bzip2' && action === 'decomp') {
      const module = await import(URLS.bzip2Decompress);
      result = (module.default || module).decode(bytes);
    } else throw new Error('지원하지 않는 압축 작업입니다.');
    const output = Uint8Array.from(result || []);
    self.postMessage({ output }, [output.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message || String(error) });
  }
};`;

function runCodecWorker(codec, action, bytes, level, signal, tasks) {
  if (typeof Worker === 'undefined') return Promise.reject(new Error('이 브라우저는 Web Worker를 지원하지 않습니다.'));
  const input = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([CODEC_WORKER_SOURCE], { type: 'text/javascript' }));
    const worker = new Worker(url, { type: 'module' });
    let settled = false;
    const finish = (error, output) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      URL.revokeObjectURL(url);
      signal?.removeEventListener('abort', abort);
      tasks.delete(cancel);
      if (error) reject(error);
      else resolve(output);
    };
    const cancel = (reason = new DOMException('작업 취소', 'AbortError')) => finish(reason);
    const abort = () => cancel();
    tasks.add(cancel);
    signal?.addEventListener('abort', abort, { once: true });
    worker.addEventListener('message', ({ data }) => {
      finish(data.error ? new Error(data.error) : null, data.output && new Uint8Array(data.output));
    });
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      finish(new Error(event.message || '압축 Worker를 실행하지 못했습니다.'));
    });
    worker.postMessage({ codec, action, bytes: input, level }, [input.buffer]);
  });
}

function codecRender({ id, name, ext, levels }) {
  return function render(root) {
      const tasks = new Set();
      root.append(h('h3', null, '텍스트 / Base64 / Hex'));
      const io = makeIO(root, {
        inputs: [{ id: 'input', label: '입력', rows: 6, value: `${name} 테스트 `.repeat(5) }],
        options: [
          { id: 'ifmt', label: '입력 형식', type: 'select', values: [['text', '텍스트'], ['base64', 'Base64'], ['hex', 'Hex']] },
          { id: 'ofmt', label: '출력 형식', type: 'select', values: [['base64', 'Base64'], ['hex', 'Hex'], ['text', '텍스트']] },
          { id: 'level', label: '압축 레벨', type: 'select', values: levels },
        ],
        actions: [{ id: 'comp', label: '압축' }, { id: 'decomp', label: '해제' }],
        autorun: false, cancelable: true,
        async process(text, options, action, signal) {
          const input = decodeInput(text, options.ifmt);
          const inputLength = input.length;
          const result = await runCodecWorker(id, action, input, +options.level, signal, tasks);
          return outBytes(result, options.ofmt)
            + (action === 'comp' ? `\n\n// ${ratio(inputLength, result.length)}` : '');
        },
        note: '압축·해제는 Web Worker에서 처리하며 입력 데이터는 브라우저 밖으로 전송되지 않습니다.',
      });

      root.append(h('h3', { style: { marginTop: '26px' } }, '파일 압축/해제'));
      const fileOut = h('div');
      const picker = h('input', { type: 'file', 'aria-label': '압축하거나 해제할 파일 선택' });
      const handle = async (action) => {
        const file = picker.files[0];
        if (!file) { fileOut.textContent = '파일을 먼저 선택하세요.'; return; }
        fileOut.textContent = action === 'comp' ? '압축 중...' : '해제 중...';
        try {
          const input = new Uint8Array(await file.arrayBuffer());
          const inputLength = input.length;
          const result = await runCodecWorker(id, action, input, +io.optEls.level.value, null, tasks);
          const outName = action === 'comp'
            ? file.name + ext
            : file.name.toLowerCase().endsWith(ext) ? file.name.slice(0, -ext.length) : file.name + '.out';
          download(outName, new Blob([result]));
          fileOut.innerHTML = '';
          fileOut.append(h('p', null,
            `${file.name} (${inputLength.toLocaleString()} B) → ${outName} (${result.length.toLocaleString()} B)`,
            action === 'comp' ? ` — ${((1 - result.length / (inputLength || 1)) * 100).toFixed(1)}% 감소` : ''));
        } catch (error) {
          if (error?.name === 'AbortError') return;
          fileOut.innerHTML = '';
          fileOut.append(h('span', { class: 'error' }, '실패: ' + error.message));
        }
      };
      root.append(picker,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => handle('comp') }, `압축 (${ext})`),
          h('button', { class: 'btn', type: 'button', onclick: () => handle('decomp') }, '해제')),
        fileOut);
      return () => {
        io.cancel();
        for (const cancel of [...tasks]) cancel();
      };
    };
}

tool({
  id: 'brotli', cat: CAT, name: 'Brotli 압축/해제',
  desc: 'Brotli(.br) 데이터를 품질 레벨을 지정해 압축하거나 해제합니다.',
  keywords: 'brotli br compress decompress web content-encoding 압축 해제 worker',
  render: codecRender({
    id: 'brotli', name: 'Brotli 압축/해제', ext: '.br',
    levels: [['6', '6 (기본)'], ['11', '11 (최대)'], ['1', '1 (빠름)']],
  }),
});
tool({
  id: 'zstd', cat: CAT, name: 'Zstandard 압축/해제',
  desc: 'Zstandard(.zst) 데이터를 레벨을 지정해 압축하거나 해제합니다.',
  keywords: 'zstd zstandard zst compress decompress 압축 해제 worker',
  render: codecRender({
    id: 'zstd', name: 'Zstandard 압축/해제', ext: '.zst',
    levels: [['3', '3 (기본)'], ['10', '10 (높음)'], ['19', '19 (최대)'], ['1', '1 (빠름)']],
  }),
});

tool({
  id: 'bzip2', cat: CAT, name: 'Bzip2 해제',
  desc: 'Bzip2(.bz2) 데이터를 Worker에서 해제합니다. 압축은 브라우저 비용과 라이선스 문제로 제공하지 않습니다.',
  keywords: 'bzip2 bz2 decompress worker',
  render(root) {
    const tasks = new Set();
    root.append(h('h3', null, 'Base64 / Hex 해제'));
    const io = makeIO(root, {
      inputs: [{ id: 'input', label: 'Bzip2 데이터', rows: 5, placeholder: 'Base64 또는 Hex' }],
      options: [
        { id: 'ifmt', label: '입력 형식', type: 'select', values: [['base64', 'Base64'], ['hex', 'Hex']] },
        { id: 'ofmt', label: '출력 형식', type: 'select', values: [['text', '텍스트'], ['base64', 'Base64'], ['hex', 'Hex']] },
      ],
      actions: [{ id: 'decomp', label: '해제' }],
      autorun: false, cancelable: true,
      async process(text, options, _, signal) {
        if (!text.trim()) return '';
        return outBytes(await runCodecWorker('bzip2', 'decomp', decodeInput(text, options.ifmt), 0, signal, tasks), options.ofmt);
      },
      note: 'Bzip2 압축 후보인 순수 JavaScript 구현은 GPL이며 대용량에서 매우 느려 추가하지 않았습니다. 해제는 Worker에서 처리합니다.',
    });

    root.append(h('h3', { style: { marginTop: '26px' } }, '파일 해제'));
    const fileOut = h('div');
    const picker = h('input', { type: 'file', accept: '.bz2', 'aria-label': '해제할 Bzip2 파일 선택' });
    picker.addEventListener('change', async () => {
      const file = picker.files[0];
      if (!file) return;
      fileOut.textContent = '해제 중...';
      try {
        const result = await runCodecWorker('bzip2', 'decomp', new Uint8Array(await file.arrayBuffer()), 0, null, tasks);
        fileOut.innerHTML = '';
        fileOut.append(h('p', null, `${file.name} → ${result.length.toLocaleString()} bytes `,
          h('button', {
            class: 'btn small', type: 'button',
            onclick: () => download(file.name.replace(/\.bz2$/i, '') || 'output', new Blob([result])),
          }, '다운로드')),
        h('div', { class: 'out-head' }, h('span', { class: 'io-label' }, '미리보기 (최대 2KB)')),
        h('pre', { class: 'out-html', style: { whiteSpace: 'pre-wrap' } }, bytesToStr(result.slice(0, 2000))));
      } catch (error) {
        if (error?.name === 'AbortError') return;
        fileOut.innerHTML = '';
        fileOut.append(h('span', { class: 'error' }, '해제 실패: ' + error.message));
      }
    });
    root.append(picker, fileOut);
    return () => {
      io.cancel();
      for (const cancel of [...tasks]) cancel();
    };
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
        const mod = await loadModule('https://cdn.jsdelivr.net/npm/lz4js@0.2.0/+esm');
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
    const picker = h('input', { type: 'file', multiple: true, 'aria-label': 'ZIP에 추가할 파일 선택' });
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
    const unzipPicker = h('input', { type: 'file', accept: '.zip', 'aria-label': '해제할 ZIP 파일 선택' });
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
    const picker = h('input', { type: 'file', multiple: true, 'aria-label': 'Tar에 추가할 파일 선택' });
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
    opts.append(h('span', { class: 'opt-item' }, gzChk, formLabel(gzChk, 'gzip 압축 (.tar.gz)')));
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
    const upick = h('input', { type: 'file', accept: '.tar,.gz,.tgz', 'aria-label': '해제할 Tar 파일 선택' });
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
