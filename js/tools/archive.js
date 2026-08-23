// 압축 / 아카이브
import {
  tool, makeIO, h, formLabel, kvTable, strToBytes, bytesToStr, bytesToB64, b64ToBytes,
  bytesToHex, hexToBytes, decodeInput, loadScript, loadModule, vendorUrl, LIB, download,
  createAsyncRunner, throwIfAborted, formatBytes,
} from '../core.js';

const CAT = '압축 / 아카이브';
const ARCHIVE_LIMITS = Object.freeze({
  maxEntries: 1000,
  maxTotalBytes: 256 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxRatio: 200,
});

function archiveLimitNote() {
  return `해제 안전 한도: 항목 ${ARCHIVE_LIMITS.maxEntries.toLocaleString()}개, 총 ${formatBytes(ARCHIVE_LIMITS.maxTotalBytes)}, `
    + `항목당 ${formatBytes(ARCHIVE_LIMITS.maxEntryBytes)}, 압축률 ${ARCHIVE_LIMITS.maxRatio}:1.`;
}

function safeArchivePath(name) {
  const normalized = String(name).replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)
      || normalized.split('/').some((part) => part === '..'))
    throw new Error(`안전하지 않은 아카이브 경로입니다: ${name || '(빈 이름)'}`);
  return normalized.replace(/^\.\//, '');
}

function uniqueArchiveName(name, used) {
  let candidate = name, index = 1;
  while (used.has(candidate)) candidate = name.replace(/(\.[^./]*)?$/, (ext) => ` (${++index})${ext}`);
  used.add(candidate);
  return candidate;
}

function enforceArchiveBudget(entries, compressedBytes) {
  if (entries.length > ARCHIVE_LIMITS.maxEntries)
    throw new Error(`아카이브 항목 수가 안전 한도 ${ARCHIVE_LIMITS.maxEntries.toLocaleString()}개를 넘습니다.`);
  let total = 0;
  for (const entry of entries) {
    if (entry.size > ARCHIVE_LIMITS.maxEntryBytes)
      throw new Error(`“${entry.name}”의 해제 크기가 항목 한도 ${formatBytes(ARCHIVE_LIMITS.maxEntryBytes)}를 넘습니다.`);
    total += entry.size;
    if (total > ARCHIVE_LIMITS.maxTotalBytes)
      throw new Error(`총 해제 크기가 안전 한도 ${formatBytes(ARCHIVE_LIMITS.maxTotalBytes)}를 넘습니다.`);
  }
  if (total && total / Math.max(1, compressedBytes) > ARCHIVE_LIMITS.maxRatio)
    throw new Error(`예상 압축률이 안전 한도 ${ARCHIVE_LIMITS.maxRatio}:1을 넘습니다. 압축 폭탄 가능성이 있어 중단했습니다.`);
  return total;
}

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
            enforceArchiveBudget([{ name: '해제 결과', size: res.length }], input.length);
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
        const picker = h('input', {
          type: 'file', 'aria-label': '압축하거나 해제할 파일 선택',
          'data-file-max-file': ARCHIVE_LIMITS.maxTotalBytes,
        });
        const compressButton = h('button', { class: 'btn primary', type: 'button' }, `압축 (${fileExt})`);
        const decompressButton = h('button', { class: 'btn', type: 'button' }, '해제');
        const section = h('section', { class: 'io archive-section' }, picker,
          h('div', { class: 'btn-row' }, compressButton, decompressButton), fileOut);
        const runner = createAsyncRunner(section, {
          controls: () => [picker, compressButton, decompressButton], errorOut: fileOut,
        });
        const handle = (mode) => runner.run(async (task) => {
            const f = picker.files[0];
            if (!f) throw new Error('파일을 먼저 선택하세요.');
            await loadScript(LIB.pako);
            const buf = new Uint8Array(await f.arrayBuffer());
            throwIfAborted(task.signal);
            let res, outName;
            if (mode === 'comp') {
              res = deflate(buf, { level: 6 });
              outName = f.name + fileExt;
            } else {
              res = inflate(buf);
              outName = f.name.toLowerCase().endsWith(fileExt) ? f.name.slice(0, -fileExt.length) : f.name + '.out';
            }
            if (mode === 'decomp') enforceArchiveBudget([{ name: outName, size: res.length }], buf.length);
            throwIfAborted(task.signal);
            task.download(outName, new Blob([res]));
            fileOut.replaceChildren(h('p', { tabindex: -1 },
              `${f.name} (${buf.length.toLocaleString()} B) → ${outName} (${res.length.toLocaleString()} B)`,
              mode === 'comp' ? ` — ${((1 - res.length / (buf.length || 1)) * 100).toFixed(1)}% 감소` : ''));
            fileOut.querySelector('[tabindex]')?.focus();
          });
        compressButton.addEventListener('click', () => handle('comp'));
        decompressButton.addEventListener('click', () => handle('decomp'));
        root.append(section);
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
              enforceArchiveBudget([{ name: '해제 결과', size: bytes.length }], input.length);
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
  brotliCompress: vendorUrl('brotliCompress'),
  brotliDecompress: vendorUrl('brotliDecompress'),
  zstdCompress: vendorUrl('zstdCompress'),
  zstdDecompress: vendorUrl('zstdDecompress'),
  bzip2Decompress: vendorUrl('bzip2Decompress'),
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
          if (action === 'decomp') enforceArchiveBudget([{ name: '해제 결과', size: result.length }], inputLength);
          return outBytes(result, options.ofmt)
            + (action === 'comp' ? `\n\n// ${ratio(inputLength, result.length)}` : '');
        },
        note: '압축·해제는 Web Worker에서 처리하며 입력 데이터는 브라우저 밖으로 전송되지 않습니다.',
      });

      root.append(h('h3', { style: { marginTop: '26px' } }, '파일 압축/해제'));
      const fileOut = h('div');
      const picker = h('input', {
        type: 'file', 'aria-label': '압축하거나 해제할 파일 선택',
        'data-file-max-file': ARCHIVE_LIMITS.maxTotalBytes,
      });
      const compressButton = h('button', { class: 'btn primary', type: 'button' }, `압축 (${ext})`);
      const decompressButton = h('button', { class: 'btn', type: 'button' }, '해제');
      const section = h('section', { class: 'io archive-section' }, picker,
        h('div', { class: 'btn-row' }, compressButton, decompressButton), fileOut);
      const runner = createAsyncRunner(section, {
        controls: () => [picker, compressButton, decompressButton], errorOut: fileOut,
      });
      const handle = (action) => runner.run(async (task) => {
          const file = picker.files[0];
          if (!file) throw new Error('파일을 먼저 선택하세요.');
          const input = new Uint8Array(await file.arrayBuffer());
          const inputLength = input.length;
          const result = await runCodecWorker(id, action, input, +io.optEls.level.value, task.signal, tasks);
          const outName = action === 'comp'
            ? file.name + ext
            : file.name.toLowerCase().endsWith(ext) ? file.name.slice(0, -ext.length) : file.name + '.out';
          if (action === 'decomp') enforceArchiveBudget([{ name: outName, size: result.length }], inputLength);
          task.download(outName, new Blob([result]));
          fileOut.replaceChildren(h('p', { tabindex: -1 },
            `${file.name} (${inputLength.toLocaleString()} B) → ${outName} (${result.length.toLocaleString()} B)`,
            action === 'comp' ? ` — ${((1 - result.length / (inputLength || 1)) * 100).toFixed(1)}% 감소` : ''));
          fileOut.querySelector('[tabindex]')?.focus();
        });
      compressButton.addEventListener('click', () => handle('comp'));
      decompressButton.addEventListener('click', () => handle('decomp'));
      root.append(section);
      return () => {
        runner.cleanup();
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
        const input = decodeInput(text, options.ifmt);
        const result = await runCodecWorker('bzip2', 'decomp', input, 0, signal, tasks);
        enforceArchiveBudget([{ name: '해제 결과', size: result.length }], input.length);
        return outBytes(result, options.ofmt);
      },
      note: 'Bzip2 압축 후보인 순수 JavaScript 구현은 GPL이며 대용량에서 매우 느려 추가하지 않았습니다. 해제는 Worker에서 처리합니다.',
    });

    root.append(h('h3', { style: { marginTop: '26px' } }, '파일 해제'));
    const fileOut = h('div');
    const picker = h('input', {
      type: 'file', accept: '.bz2', 'aria-label': '해제할 Bzip2 파일 선택',
      'data-file-max-file': ARCHIVE_LIMITS.maxTotalBytes,
    });
    const section = h('section', { class: 'io archive-section' }, picker, fileOut);
    const runner = createAsyncRunner(section, { controls: () => [picker], errorOut: fileOut });
    picker.addEventListener('change', () => runner.run(async (task) => {
      const file = picker.files[0];
      if (!file) throw new Error('해제할 Bzip2 파일을 선택하세요.');
        const input = new Uint8Array(await file.arrayBuffer());
        const result = await runCodecWorker('bzip2', 'decomp', input, 0, task.signal, tasks);
        enforceArchiveBudget([{ name: file.name, size: result.length }], file.size);
        fileOut.replaceChildren(h('p', { tabindex: -1 }, `${file.name} → ${result.length.toLocaleString()} bytes `,
          h('button', {
            class: 'btn small', type: 'button',
            onclick: () => download(file.name.replace(/\.bz2$/i, '') || 'output', new Blob([result])),
          }, '다운로드')),
        h('div', { class: 'out-head' }, h('span', { class: 'io-label' }, '미리보기 (최대 2KB)')),
        h('pre', { class: 'out-html', style: { whiteSpace: 'pre-wrap' } }, bytesToStr(result.slice(0, 2000))));
        fileOut.querySelector('[tabindex]')?.focus();
    }));
    root.append(section);
    return () => {
      runner.cleanup();
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
        const mod = await loadModule(vendorUrl('lz4'));
        const lz4 = mod.default && mod.default.compress ? mod.default : mod;
        const input = decodeInput(text, o.ifmt);
        if (action === 'decomp') {
          const res = lz4.decompress(input);
          enforceArchiveBudget([{ name: '해제 결과', size: res.length }], input.length);
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
const ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let k = 0; k < 8; k++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function zipCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = ZIP_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readZipDirectory(bytes) {
  if (bytes.length < 22) throw new Error('올바른 ZIP 파일이 아니거나 파일이 잘렸습니다.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const start = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= start; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('ZIP 중앙 디렉터리를 찾지 못했습니다. 파일이 손상되었을 수 있습니다.');
  const disk = view.getUint16(eocd + 4, true);
  const directoryDisk = view.getUint16(eocd + 6, true);
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (disk || directoryDisk) throw new Error('여러 디스크로 나뉜 ZIP은 지원하지 않습니다.');
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff)
    throw new Error('ZIP64 형식은 이 도구의 안전 해제 범위에서 지원하지 않습니다.');
  if (directoryOffset + directorySize > eocd) throw new Error('ZIP 중앙 디렉터리 범위가 올바르지 않습니다.');
  if (count > ARCHIVE_LIMITS.maxEntries)
    throw new Error(`아카이브 항목 수가 안전 한도 ${ARCHIVE_LIMITS.maxEntries.toLocaleString()}개를 넘습니다.`);

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const entries = [];
  const names = new Set();
  let offset = directoryOffset;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error(`ZIP ${index + 1}번째 중앙 디렉터리 항목이 손상되었습니다.`);
    const flags = view.getUint16(offset + 8, true);
    const compression = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > bytes.length) throw new Error(`ZIP ${index + 1}번째 파일명이 잘렸습니다.`);
    if (flags & 1) throw new Error('암호화된 ZIP 항목은 안전하게 해제할 수 없습니다.');
    if (![0, 8].includes(compression)) throw new Error(`지원하지 않는 ZIP 압축 방식입니다: ${compression}`);
    const rawName = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const name = safeArchivePath(rawName);
    if (names.has(name)) throw new Error(`중복된 ZIP 항목 이름은 덮어쓰기 위험 때문에 해제하지 않습니다: ${name}`);
    names.add(name);
    entries.push({ name, size, compressedSize, crc, directory: name.endsWith('/'), utf8: !!(flags & 0x800) });
    offset = next;
  }
  enforceArchiveBudget(entries, bytes.length);
  return entries;
}

function unzipSafely(bytes, signal) {
  const entries = readZipDirectory(bytes);
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    fflate.unzip(bytes, (error, unpacked) => {
      if (error) { reject(new Error('해제 실패: ' + error.message)); return; }
      try {
        throwIfAborted(signal);
        let total = 0;
        const result = entries.map((entry) => {
          const data = unpacked[entry.name];
          if (!data) throw new Error(`ZIP 항목 데이터를 찾지 못했습니다: ${entry.name}`);
          if (data.length !== entry.size) throw new Error(`ZIP 항목 크기가 중앙 디렉터리와 다릅니다: ${entry.name}`);
          total += data.length;
          if (!entry.directory && zipCrc32(data) !== entry.crc)
            throw new Error(`ZIP CRC-32 검증에 실패했습니다: ${entry.name}`);
          return { ...entry, data };
        });
        enforceArchiveBudget(result, bytes.length);
        if (total > ARCHIVE_LIMITS.maxTotalBytes) throw new Error('총 해제 크기 안전 한도를 넘습니다.');
        resolve(result);
      } catch (caught) { reject(caught); }
    });
  });
}

tool({
  id: 'zip', cat: CAT, name: 'ZIP 생성/해제',
  desc: '여러 파일을 ZIP으로 묶거나, ZIP 파일의 내용을 나열하고 추출합니다.',
  keywords: 'zip archive unzip compress extract',
  render(root) {
    const createSection = h('section', { class: 'io archive-section' }, h('h3', null, 'ZIP 만들기'));
    let files = [];
    const fileList = h('div', { style: { margin: '8px 0' } });
    const picker = h('input', {
      type: 'file', multiple: true, 'aria-label': 'ZIP에 추가할 파일 선택',
      'data-file-budget-note': 'ZIP 생성은 파일 100개·총 256 MiB까지 처리합니다.',
      'data-file-max-count': 100, 'data-file-max-total': ARCHIVE_LIMITS.maxTotalBytes,
    });
    picker.addEventListener('change', () => {
      const used = new Set(files.map((file) => file.name));
      files.push(...[...picker.files].map((file) => ({
        file,
        name: uniqueArchiveName(safeArchivePath(file.webkitRelativePath || file.name), used),
      })));
      renderList();
      picker.value = '';
    });
    function renderList() {
      fileList.innerHTML = '';
      if (!files.length) { fileList.append(h('span', { class: 'note' }, '추가된 파일이 없습니다.')); return; }
      files.forEach((f, i) => fileList.append(h('div', null,
        `${f.name} (${formatBytes(f.file.size)}) `,
        h('button', { class: 'copy-mini', type: 'button', onclick: () => { files.splice(i, 1); renderList(); } }, '제거'))));
    }
    const zipBtn = h('button', { class: 'btn primary', type: 'button' }, 'ZIP 다운로드');
    const createResult = h('div');
    createSection.append(picker, fileList, h('p', { class: 'note' }, archiveLimitNote()),
      h('div', { class: 'btn-row' }, zipBtn), createResult);
    const createRunner = createAsyncRunner(createSection, {
      controls: () => [picker, zipBtn], errorOut: createResult,
    });
    zipBtn.addEventListener('click', () => createRunner.run(async (task) => {
      if (!files.length) throw new Error('ZIP에 추가할 파일을 먼저 선택하세요.');
      const total = files.reduce((sum, item) => sum + item.file.size, 0);
      enforceArchiveBudget(files.map((item) => ({ name: item.name, size: item.file.size })), total);
      await loadScript(LIB.fflate);
      const object = {};
      for (let index = 0; index < files.length; index++) {
        throwIfAborted(task.signal);
        task.progress(`파일을 읽는 중… (${index + 1}/${files.length})`);
        const item = files[index];
        object[item.name] = new Uint8Array(await item.file.arrayBuffer());
      }
      task.progress('ZIP을 만드는 중…');
      const data = await new Promise((resolve, reject) => fflate.zip(object, { level: 6 },
        (error, output) => error ? reject(new Error('압축 실패: ' + error.message)) : resolve(output)));
      throwIfAborted(task.signal);
      task.download('wtools.zip', new Blob([data], { type: 'application/zip' }));
      createResult.replaceChildren(h('p', { class: 'note', tabindex: -1 },
        `${files.length}개 파일을 ZIP으로 만들었습니다 (${formatBytes(data.length)}).`));
      createResult.focus?.();
    }));
    renderList();

    const extractSection = h('section', { class: 'io archive-section' },
      h('h3', { style: { marginTop: '26px' } }, 'ZIP 풀기'));
    const unzipOut = h('div');
    const unzipPicker = h('input', {
      type: 'file', accept: '.zip', 'aria-label': '해제할 ZIP 파일 선택',
      'data-file-max-file': ARCHIVE_LIMITS.maxTotalBytes,
      'data-file-budget-note': archiveLimitNote(),
    });
    extractSection.append(unzipPicker, h('p', { class: 'note' }, archiveLimitNote()), unzipOut);
    const extractRunner = createAsyncRunner(extractSection, {
      controls: () => [unzipPicker], errorOut: unzipOut,
    });
    unzipPicker.addEventListener('change', () => extractRunner.run(async (task) => {
      const f = unzipPicker.files[0];
      if (!f) throw new Error('해제할 ZIP 파일을 선택하세요.');
      await loadScript(LIB.fflate);
      const buf = new Uint8Array(await f.arrayBuffer());
      task.progress('ZIP 구조와 해제 크기를 검사하는 중…');
      const rows = await unzipSafely(buf, task.signal);
      if (!task.active()) return;
      const tableBody = h('tbody', null, rows.map((entry) => h('tr', null,
        h('td', { class: 'mono' }, entry.name),
        h('td', null, entry.directory ? '디렉터리' : entry.utf8 ? 'UTF-8 파일' : '파일'),
        h('td', null, formatBytes(entry.data.length)),
        h('td', null, entry.directory ? '' : h('button', {
          class: 'copy-mini', type: 'button',
          onclick: () => download(entry.name.split('/').pop() || 'file', new Blob([entry.data])),
        }, '저장')))));
      unzipOut.replaceChildren(h('p', { class: 'note', tabindex: -1 }, `${rows.length}개 항목의 CRC와 안전 한도를 확인했습니다.`),
        h('table', { class: 'grid' },
          h('thead', null, h('tr', null, ['파일명', '형식', '크기', ''].map((x) => h('th', { scope: 'col' }, x)))),
          tableBody));
      unzipOut.querySelector('[tabindex]')?.focus();
    }));
    root.append(createSection, extractSection);
  },
});

/* ---------- TAR (fflate) ---------- */
tool({
  id: 'tar', cat: CAT, name: 'Tar 아카이브/해제',
  desc: '여러 파일을 tar로 묶거나 tar/tar.gz의 내용을 나열합니다.',
  keywords: 'tar archive gzip tgz',
  render(root) {
    const createSection = h('section', { class: 'io archive-section' }, h('h3', null, 'Tar 만들기'));
    let files = [];
    const fileList = h('div', { style: { margin: '8px 0' } });
    const picker = h('input', {
      type: 'file', multiple: true, 'aria-label': 'Tar에 추가할 파일 선택',
      'data-file-max-count': 100, 'data-file-max-total': ARCHIVE_LIMITS.maxTotalBytes,
      'data-file-budget-note': 'Tar 생성은 파일 100개·총 256 MiB까지 처리합니다.',
    });
    picker.addEventListener('change', () => {
      const used = new Set(files.map((file) => file.name));
      files.push(...[...picker.files].map((file) => ({
        file,
        name: uniqueArchiveName(safeArchivePath(file.webkitRelativePath || file.name), used),
      })));
      renderList();
      picker.value = '';
    });
    function renderList() {
      fileList.innerHTML = '';
      if (!files.length) { fileList.append(h('span', { class: 'note' }, '추가된 파일이 없습니다.')); return; }
      files.forEach((f, i) => fileList.append(h('div', null, `${f.name} (${formatBytes(f.file.size)}) `,
        h('button', { class: 'copy-mini', type: 'button', onclick: () => { files.splice(i, 1); renderList(); } }, '제거'))));
    }
    const opts = h('div', { class: 'opt-row' });
    const gzChk = h('input', { type: 'checkbox' });
    opts.append(h('span', { class: 'opt-item' }, gzChk, formLabel(gzChk, 'gzip 압축 (.tar.gz)')));
    const tarBtn = h('button', { class: 'btn primary', type: 'button' }, 'Tar 다운로드');
    const createResult = h('div');
    createSection.append(picker, fileList, opts, h('p', { class: 'note' }, archiveLimitNote()),
      h('div', { class: 'btn-row' }, tarBtn), createResult);
    const createRunner = createAsyncRunner(createSection, {
      controls: () => [picker, gzChk, tarBtn], errorOut: createResult,
    });
    tarBtn.addEventListener('click', () => createRunner.run(async (task) => {
      if (!files.length) throw new Error('Tar에 추가할 파일을 먼저 선택하세요.');
      enforceArchiveBudget(files.map((item) => ({ name: item.name, size: item.file.size })),
        files.reduce((sum, item) => sum + item.file.size, 0));
      const loaded = [];
      for (let index = 0; index < files.length; index++) {
        throwIfAborted(task.signal);
        task.progress(`파일을 읽는 중… (${index + 1}/${files.length})`);
        loaded.push({ ...files[index], data: new Uint8Array(await files[index].file.arrayBuffer()) });
      }
      let data = buildTar(loaded);
      let name = 'wtools.tar';
      if (gzChk.checked) {
        task.progress('Tar를 gzip으로 압축하는 중…');
        await loadScript(LIB.pako);
        data = pako.gzip(data);
        name += '.gz';
      }
      throwIfAborted(task.signal);
      task.download(name, new Blob([data]));
      createResult.replaceChildren(h('p', { class: 'note', tabindex: -1 },
        `${files.length}개 파일을 ${name}으로 만들었습니다 (${formatBytes(data.length)}).`));
      createResult.querySelector('[tabindex]')?.focus();
    }));
    renderList();

    const extractSection = h('section', { class: 'io archive-section' },
      h('h3', { style: { marginTop: '26px' } }, 'Tar 풀기'));
    const out = h('div');
    const upick = h('input', {
      type: 'file', accept: '.tar,.gz,.tgz', 'aria-label': '해제할 Tar 파일 선택',
      'data-file-max-file': ARCHIVE_LIMITS.maxTotalBytes,
      'data-file-budget-note': archiveLimitNote(),
    });
    extractSection.append(upick, h('p', { class: 'note' }, archiveLimitNote()), out);
    const extractRunner = createAsyncRunner(extractSection, {
      controls: () => [upick], errorOut: out,
    });
    upick.addEventListener('change', () => extractRunner.run(async (task) => {
      const f = upick.files[0];
      if (!f) throw new Error('해제할 Tar 파일을 선택하세요.');
      let buf = new Uint8Array(await f.arrayBuffer());
      if (f.name.endsWith('.gz') || f.name.endsWith('.tgz') || (buf[0] === 0x1f && buf[1] === 0x8b)) {
        await loadScript(LIB.pako);
        task.progress('gzip 해제 크기를 검사하는 중…');
        buf = gunzipSafely(buf, task.signal);
      }
      throwIfAborted(task.signal);
      const entries = parseTar(buf, f.size);
      const tableBody = h('tbody', null, entries.map((entry) => h('tr', null,
        h('td', { class: 'mono' }, entry.name),
        h('td', null, entry.directory ? '디렉터리' : '파일'),
        h('td', null, formatBytes(entry.data.length)),
        h('td', null, entry.directory ? '' : h('button', {
          class: 'copy-mini', type: 'button',
          onclick: () => download(entry.name.split('/').pop() || 'file', new Blob([entry.data])),
        }, '저장')))));
      out.replaceChildren(h('p', { class: 'note', tabindex: -1 }, `${entries.length}개 항목의 헤더와 안전 한도를 확인했습니다.`),
        h('table', { class: 'grid' },
          h('thead', null, h('tr', null, ['파일명', '형식', '크기', ''].map((x) => h('th', { scope: 'col' }, x)))),
          tableBody));
      out.querySelector('[tabindex]')?.focus();
    }));
    root.append(createSection, extractSection);
  },
});

function splitTarPath(name) {
  const clean = safeArchivePath(name);
  if (strToBytes(clean).length <= 100) return { name: clean, prefix: '' };
  const slashes = [...clean.matchAll(/\//g)].map((match) => match.index).reverse();
  for (const index of slashes) {
    const prefix = clean.slice(0, index);
    const base = clean.slice(index + 1);
    if (strToBytes(prefix).length <= 155 && strToBytes(base).length <= 100) return { name: base, prefix };
  }
  throw new Error(`Tar 경로는 UTF-8 기준 255바이트(name 100 + prefix 155) 이하여야 합니다: ${clean}`);
}

function buildTar(files) {
  const blocks = [];
  for (const f of files) {
    const header = new Uint8Array(512);
    const path = splitTarPath(f.name);
    header.set(strToBytes(path.name), 0);
    const write = (str, off, len) => { const b = strToBytes(str); header.set(b.slice(0, len), off); };
    write('0000644', 100, 7); // mode
    write('0000000', 108, 7); // uid
    write('0000000', 116, 7); // gid
    write(f.data.length.toString(8).padStart(11, '0'), 124, 11); // size
    const modified = f.file?.lastModified || Date.now();
    write(Math.floor(modified / 1000).toString(8).padStart(11, '0'), 136, 11); // mtime
    header[156] = f.name.endsWith('/') ? 0x35 : 0x30; // typeflag '5'(directory) / '0'
    write('ustar', 257, 5);
    header[263] = 0x30; header[264] = 0x30; // version '00'
    if (path.prefix) write(path.prefix, 345, 155);
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
function tarString(buf, start, length) {
  return bytesToStr(buf.slice(start, start + length)).replace(/\0.*$/, '');
}

function tarOctal(buf, start, length, label) {
  const value = tarString(buf, start, length).trim();
  if (!/^[0-7]*$/.test(value)) throw new Error(`Tar ${label} 필드가 올바른 8진수가 아닙니다.`);
  return parseInt(value || '0', 8);
}

function gunzipSafely(bytes, signal) {
  const chunks = [];
  let total = 0;
  const inflator = new pako.Inflate({ chunkSize: 64 * 1024 });
  inflator.onData = (chunk) => {
    throwIfAborted(signal);
    total += chunk.length;
    if (total > ARCHIVE_LIMITS.maxTotalBytes)
      throw new Error(`gzip 해제 결과가 안전 한도 ${formatBytes(ARCHIVE_LIMITS.maxTotalBytes)}를 넘습니다.`);
    if (total / Math.max(1, bytes.length) > ARCHIVE_LIMITS.maxRatio)
      throw new Error(`gzip 압축률이 안전 한도 ${ARCHIVE_LIMITS.maxRatio}:1을 넘습니다. 압축 폭탄 가능성이 있어 중단했습니다.`);
    chunks.push(chunk);
  };
  inflator.push(bytes, true);
  if (inflator.err) throw new Error('gzip 해제 실패: ' + inflator.msg);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function parseTar(buf, compressedBytes = buf.length) {
  const entries = [];
  const names = new Set();
  let off = 0;
  while (off + 512 <= buf.length) {
    const nameBytes = buf.slice(off, off + 100);
    if (nameBytes.every((b) => b === 0)) break;
    const storedChecksum = tarOctal(buf, off + 148, 8, '체크섬');
    let checksum = 0;
    for (let index = 0; index < 512; index++) checksum += index >= 148 && index < 156 ? 0x20 : buf[off + index];
    if (storedChecksum !== checksum) throw new Error(`Tar 헤더 체크섬 검증에 실패했습니다 (${entries.length + 1}번째 항목).`);
    const base = tarString(buf, off, 100);
    const prefix = tarString(buf, off + 345, 155);
    const name = safeArchivePath(prefix ? `${prefix}/${base}` : base);
    if (names.has(name)) throw new Error(`중복된 Tar 항목 이름은 덮어쓰기 위험 때문에 해제하지 않습니다: ${name}`);
    names.add(name);
    const size = tarOctal(buf, off + 124, 12, '크기');
    const typeflag = buf[off + 156];
    if (![0, 0x30, 0x35].includes(typeflag))
      throw new Error(`지원하지 않는 Tar 항목 형식입니다: ${String.fromCharCode(typeflag) || typeflag}`);
    if (size > ARCHIVE_LIMITS.maxEntryBytes)
      throw new Error(`“${name}”의 해제 크기가 항목 한도 ${formatBytes(ARCHIVE_LIMITS.maxEntryBytes)}를 넘습니다.`);
    off += 512;
    if (off + size > buf.length) throw new Error(`Tar 항목 데이터가 잘렸습니다: ${name}`);
    entries.push({ name, directory: typeflag === 0x35, size, data: buf.slice(off, off + size) });
    enforceArchiveBudget(entries, compressedBytes);
    off += Math.ceil(size / 512) * 512;
  }
  return entries;
}
