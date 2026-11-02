// 해싱
import {
  tool, makeIO, h, formLabel, kvTable, copyBtn, download, strToBytes, hexToBytes, bytesToB64, bytesToHex,
  decodeInput, FMT_IN, loadScript, LIB, createAsyncRunner, readFileChunks,
  throwIfAborted, requireFeature,
} from '../core.js';

import { runCrypto, hmacBytes } from '../lib/crypto/worker-client.js';

const CAT = '해싱';

tool({
  id: 'hash', cat: CAT, name: '해시 생성 (MD/SHA 전체)',
  desc: 'MD2/MD4/MD5, SHA-0/1/2/3, Keccak-256, RIPEMD160 해시를 한 번에 계산합니다.',
  keywords: 'hash md5 sha1 sha256 sha512 sha3 keccak digest checksum',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 6, value: 'Hello, World!' }],
      options: [
        { id: 'ifmt', label: '입력 형식', type: 'select', values: FMT_IN },
        { id: 'upper', label: '대문자', type: 'checkbox' },
      ],
      note: 'MD2, MD4, MD5, SHA-0, SHA-1은 현대 보안 용도로 안전하지 않습니다. 기존 형식의 호환성 확인에만 사용하고, 보안 목적에는 SHA-256 이상을 사용하세요. 입력은 최대 16 MiB이며 Worker에서 계산하고 취소할 수 있습니다.',
      outputHTML: true, runOnLoad: true, cancelable: true,
      async process(text, o, action, signal) {
        const bytes = decodeInput(text, o.ifmt);
        try {
          const rows = await runCrypto('hash-all', { data: bytes }, signal);
          return kvTable(rows.map(([name, value]) => [name, o.upper ? value.toUpperCase() : value]));
        } finally { bytes.fill(0); }
      },
    });
  },
});

/* ---------- BLAKE / xxHash — 이 도구에서만 hash-wasm을 지연 로드한다. ---------- */
// [표시 이름, 키 지원 여부, 계산 함수]. hashwasm 전역은 loadScript 이후에만 존재한다.
const MODERN_ALGS = [
  ['BLAKE2b-512', true, (bytes, key) => hashwasm.blake2b(bytes, 512, key)],
  ['BLAKE2b-256', true, (bytes, key) => hashwasm.blake2b(bytes, 256, key)],
  ['BLAKE2s-256', true, (bytes, key) => hashwasm.blake2s(bytes, 256, key)],
  ['BLAKE3-256', true, (bytes, key) => hashwasm.blake3(bytes, 256, key)],
  ['BLAKE3-512', true, (bytes, key) => hashwasm.blake3(bytes, 512, key)],
  ['xxHash64', false, (bytes) => hashwasm.xxhash64(bytes)],
  ['xxHash3 (64bit)', false, (bytes) => hashwasm.xxhash3(bytes)],
  ['xxHash128', false, (bytes) => hashwasm.xxhash128(bytes)],
];

tool({
  id: 'hash-modern', cat: CAT, name: 'BLAKE2 / BLAKE3 / xxHash 생성',
  desc: 'BLAKE2b, BLAKE2s, BLAKE3, xxHash를 한 번에 계산합니다. 키(keyed hash)를 지원합니다.',
  keywords: 'blake blake2 blake2b blake2s blake3 xxhash xxh64 xxh3 keyed hash digest 해시',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'input', label: '입력', rows: 5, value: 'Hello, World!' },
        { id: 'key', label: '키 (선택, BLAKE 계열만)', rows: 1, placeholder: '비우면 키 없이 계산합니다.' },
      ],
      options: [
        { id: 'ifmt', label: '입력 형식', type: 'select', values: FMT_IN },
        { id: 'upper', label: '대문자', type: 'checkbox' },
      ],
      outputHTML: true, runOnLoad: true,
      async process(v, o) {
        requireFeature('wasm', typeof WebAssembly !== 'undefined');
        await loadScript(LIB.hashWasm);
        const bytes = decodeInput(v.input, o.ifmt);
        const key = v.key ? strToBytes(v.key) : null;
        const rows = [];
        for (const [label, keyable, compute] of MODERN_ALGS) {
          if (key && !keyable) { rows.push([label, '(키를 지원하지 않는 알고리즘)']); continue; }
          try {
            const value = await compute(bytes, key);
            rows.push([label, o.upper ? value.toUpperCase() : value]);
          } catch (e) {
            rows.push([label, '(오류: ' + e.message + ')']);
          }
        }
        return kvTable(rows);
      },
      note: 'BLAKE3의 키는 정확히 32바이트여야 합니다. BLAKE2는 최대 64바이트(2s는 32바이트)까지 받습니다.',
    });
  },
});

tool({
  id: 'hmac', cat: CAT, name: 'HMAC 생성',
  desc: '비밀 키를 사용한 HMAC 메시지 인증 코드를 생성합니다.',
  keywords: 'hmac mac key',
  transfer: {
    outputs: [{ id: 'hash', label: 'HMAC 결과', type: 'hash', targets: ['hash-analyze'] }],
  },
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'msg', label: '메시지', rows: 5, value: 'Hello, World!' },
        { id: 'key', label: '비밀 키', rows: 2, value: 'secret' },
      ],
      options: [
        { id: 'alg', label: '알고리즘', type: 'select', values: ['SHA256', 'SHA1', 'SHA224', 'SHA384', 'SHA512', 'SHA3-256', 'SHA3-512', 'MD5'], value: 'SHA256' },
        { id: 'ofmt', label: '출력', type: 'select', values: [['hex', 'Hex'], ['base64', 'Base64']] },
      ],
      runOnLoad: true, cancelable: true,
      transferOutput: { id: 'hash', when: ({ result }) => !!String(result).trim() },
      async process(v, o, action, signal) {
        const message = strToBytes(v.msg), key = strToBytes(v.key);
        let result;
        try {
          result = await hmacBytes(o.alg, message, key, signal);
          return o.ofmt === 'base64' ? bytesToB64(result) : bytesToHex(result);
        } finally { message.fill(0); key.fill(0); result?.fill(0); }
      },
    });
  },
});

tool({
  id: 'hash-analyze', cat: CAT, name: '해시 분석기',
  desc: '해시 문자열의 형태로 사용된 알고리즘을 추정합니다.',
  keywords: 'hash identify analyze',
  transfer: { inputs: [{ id: 'input', label: '해시 값', accepts: ['hash'] }] },
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '해시 값', rows: 3, placeholder: '5d41402abc4b2a76b9719d911017c592' }],
      outputHTML: true,
      process(text) {
        const s = text.trim();
        if (!s) return '';
        const guesses = [];
        // 접두사 기반
        if (/^\$2[abxy]?\$/.test(s)) guesses.push('bcrypt');
        else if (s.startsWith('$argon2')) guesses.push('Argon2');
        else if (s.startsWith('$1$')) guesses.push('md5crypt (Unix)');
        else if (s.startsWith('$5$')) guesses.push('sha256crypt (Unix)');
        else if (s.startsWith('$6$')) guesses.push('sha512crypt (Unix)');
        else if (s.startsWith('$pbkdf2')) guesses.push('PBKDF2');
        else if (s.startsWith('{SSHA}')) guesses.push('Salted SHA-1 (LDAP)');
        else if (/^[0-9a-f]+$/i.test(s)) {
          const map = {
            32: ['MD5', 'MD4', 'MD2', 'NTLM', 'LM(x2)'],
            40: ['SHA-1', 'SHA-0', 'RIPEMD-160'],
            56: ['SHA-224', 'SHA3-224'],
            64: ['SHA-256', 'SHA3-256', 'BLAKE2s', 'Keccak-256'],
            96: ['SHA-384', 'SHA3-384'],
            128: ['SHA-512', 'SHA3-512', 'BLAKE2b', 'Whirlpool'],
            8: ['CRC32', 'Adler-32'],
            16: ['CRC64', 'MySQL(old)'],
          };
          guesses.push(...(map[s.length] || []));
          if (!map[s.length]) guesses.push(`알 수 없음 (hex ${s.length}자 = ${s.length * 4}비트)`);
        } else if (/^[A-Za-z0-9+/]+=*$/.test(s)) {
          guesses.push(`Base64 인코딩된 값 (디코딩 시 ${Math.floor(s.replace(/=/g, '').length * 3 / 4)}바이트) — 해시 원문일 수 있음`);
        } else guesses.push('알려진 해시 형식과 일치하지 않습니다.');
        return h('div', null,
          kvTable([['길이', s.length + '자'], ['문자 집합', /^[0-9a-f]+$/i.test(s) ? 'Hex' : /^[A-Za-z0-9+/=]+$/.test(s) ? 'Base64' : '기타']]),
          h('h4', null, '추정 알고리즘 (가능성 순)'),
          h('ol', null, guesses.map((g) => h('li', null, g))));
      },
    });
  },
});

const FILE_CHECKSUM_ALGORITHMS = {
  'MD5': { length: 32, worker: 'MD5' },
  'SHA-1': { length: 40, worker: 'SHA1' },
  'SHA-256': { length: 64, worker: 'SHA256' },
  'SHA-512': { length: 128, worker: 'SHA512' },
};
const FILE_HASH_WORKER_URL = new URL('../workers/file-hash.js', import.meta.url);

function fileHashWorker(signal) {
  requireFeature('worker', typeof Worker !== 'undefined');
  throwIfAborted(signal);
  const worker = new Worker(FILE_HASH_WORKER_URL, { type: 'module' });
  const pending = new Map();
  let requestId = 0;
  let closed = false;
  const close = (error) => {
    if (closed) return;
    closed = true;
    worker.terminate();
    signal?.removeEventListener('abort', abort);
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };
  const abort = () => close(new DOMException('작업이 취소되었습니다.', 'AbortError'));
  worker.addEventListener('message', ({ data }) => {
    const task = pending.get(data.request);
    if (!task) return;
    pending.delete(data.request);
    if (data.error) task.reject(new Error(data.error));
    else task.resolve(data);
  });
  worker.addEventListener('error', (event) => {
    event.preventDefault();
    close(new Error(event.message || '파일 해시 Worker를 실행하지 못했습니다.'));
  });
  signal?.addEventListener('abort', abort, { once: true });
  return {
    request(message, transfer = []) {
      throwIfAborted(signal);
      if (closed) return Promise.reject(new Error('파일 해시 Worker가 종료되었습니다.'));
      const request = ++requestId;
      return new Promise((resolve, reject) => {
        pending.set(request, { resolve, reject });
        worker.postMessage({ ...message, request }, transfer);
      });
    },
    close: () => close(new DOMException('파일 해시 Worker가 종료되었습니다.', 'AbortError')),
  };
}

async function hashFilesInWorker(files, task) {
  const client = fileHashWorker(task.signal);
  const records = [];
  try {
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];
      const hashes = {};
      let algorithmIndex = 0;
      for (const [name, config] of Object.entries(FILE_CHECKSUM_ALGORITHMS)) {
        throwIfAborted(task.signal);
        const job = `${fileIndex}:${algorithmIndex++}`;
        await client.request({
          type: 'start', job, algorithm: config.worker,
        });
        await readFileChunks(file, {
          signal: task.signal,
          onChunk: async (bytes) => client.request({ type: 'chunk', job, bytes }, [bytes.buffer]),
          onProgress: (ratio) => task.progress(
            `파일 ${fileIndex + 1}/${files.length} · ${name} ${Math.round(ratio * 100)}%`,
          ),
        });
        hashes[name] = (await client.request({ type: 'finish', job })).digest;
      }
      records.push({
        name: file.name, path: file.webkitRelativePath || file.name, size: file.size, hashes,
      });
    }
    return records;
  } finally {
    client.close();
  }
}

const CHECKSUM_ALGORITHM_BY_LENGTH = Object.fromEntries(
  Object.entries(FILE_CHECKSUM_ALGORITHMS).map(([name, cfg]) => [cfg.length, name]));

function normalizeChecksumAlgorithm(value) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return { MD5: 'MD5', SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }[compact] || null;
}

function unescapeChecksumFilename(value) {
  return value.replace(/\\([\\n])/g, (_, escaped) => escaped === 'n' ? '\n' : '\\');
}

function parseChecksumText(text) {
  const entries = [];
  const errors = [];
  const seen = new Map();
  const add = (algorithm, hash, filename, lineNumber) => {
    const expectedLength = FILE_CHECKSUM_ALGORITHMS[algorithm]?.length;
    if (!expectedLength || hash.length !== expectedLength) {
      errors.push(`${lineNumber}행: ${algorithm} 체크섬은 ${expectedLength || '지원되는'}자리 Hex여야 합니다.`);
      return;
    }
    const entry = { algorithm, hash: hash.toLowerCase(), filename, lineNumber };
    const key = `${algorithm}\0${filename ?? ''}`;
    const previous = seen.get(key);
    if (previous && previous.hash !== entry.hash) {
      errors.push(`${lineNumber}행: 같은 파일과 알고리즘에 서로 다른 체크섬이 있습니다.`);
      return;
    }
    if (!previous) {
      seen.set(key, entry);
      entries.push(entry);
    }
  };

  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    // GNU coreutils 형식: "<hash>  <filename>" 또는 "<hash> *<filename>".
    const escaped = rawLine.startsWith('\\');
    const gnuLine = escaped ? rawLine.slice(1) : rawLine;
    const gnu = gnuLine.match(/^([0-9a-f]+)[ \t]([ *])(.+)$/i);
    if (gnu) {
      const algorithm = CHECKSUM_ALGORITHM_BY_LENGTH[gnu[1].length];
      if (!algorithm) errors.push(`${lineNumber}행: 지원하지 않는 길이의 GNU 체크섬입니다.`);
      else add(algorithm, gnu[1], escaped ? unescapeChecksumFilename(gnu[3]) : gnu[3], lineNumber);
      return;
    }

    // BSD/OpenSSL 형식: "SHA256 (filename) = <hash>".
    const bsd = trimmed.match(/^([a-z0-9-]+)\s*\((.*)\)\s*=\s*([0-9a-f]+)$/i);
    if (bsd) {
      const algorithm = normalizeChecksumAlgorithm(bsd[1]);
      if (!algorithm) errors.push(`${lineNumber}행: 지원하지 않는 알고리즘 '${bsd[1]}'입니다.`);
      else add(algorithm, bsd[3], bsd[2], lineNumber);
      return;
    }

    // 파일명이 없는 단일 Hex 값은 선택한 파일이 하나일 때 사용한다.
    if (/^[0-9a-f]+$/i.test(trimmed)) {
      const algorithm = CHECKSUM_ALGORITHM_BY_LENGTH[trimmed.length];
      if (!algorithm) errors.push(`${lineNumber}행: 지원하지 않는 길이의 체크섬입니다.`);
      else add(algorithm, trimmed, null, lineNumber);
      return;
    }

    errors.push(`${lineNumber}행: GNU 또는 BSD 체크섬 형식으로 읽을 수 없습니다.`);
  });
  if (!entries.length && !errors.length) errors.push('검증할 체크섬을 입력하세요.');
  return { entries, errors };
}

function normalizeChecksumPath(value) {
  return value.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function verifyFileChecksums(records, parsed) {
  const errors = [...parsed.errors];
  const unnamed = parsed.entries.filter((entry) => entry.filename == null);
  if (unnamed.length && records.length !== 1)
    errors.push('파일명이 없는 체크섬은 검증할 파일을 하나만 선택했을 때 사용할 수 있습니다.');

  const duplicateNames = records.map((record) => record.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length)
    errors.push(`같은 이름의 파일을 두 개 이상 선택했습니다: ${[...new Set(duplicateNames)].join(', ')}`);
  if (errors.length) return { errors, rows: [], matched: 0, mismatched: 0, missing: 0, extra: 0 };

  const namedEntries = parsed.entries.filter((entry) => entry.filename != null);
  const basenamePaths = new Map();
  for (const entry of namedEntries) {
    const path = normalizeChecksumPath(entry.filename);
    const basename = path.split('/').pop();
    if (!basenamePaths.has(basename)) basenamePaths.set(basename, new Set());
    basenamePaths.get(basename).add(path);
  }

  const used = new Set();
  const rows = [];
  let matched = 0, mismatched = 0, extra = 0;
  for (const record of records) {
    const recordPath = normalizeChecksumPath(record.path);
    const matches = parsed.entries.filter((entry) => {
      if (entry.filename == null) return records.length === 1;
      const expectedPath = normalizeChecksumPath(entry.filename);
      const basename = expectedPath.split('/').pop();
      return expectedPath === recordPath || expectedPath === record.name
        || (basename === record.name && basenamePaths.get(basename)?.size === 1);
    });
    if (!matches.length) {
      extra++;
      rows.push({ status: '추가', filename: record.name, algorithm: '—', expected: '—', actual: '—' });
      continue;
    }
    for (const entry of matches) {
      used.add(entry);
      const actual = record.hashes[entry.algorithm];
      const ok = actual === entry.hash;
      if (ok) matched++;
      else mismatched++;
      rows.push({
        status: ok ? '일치' : '불일치', filename: record.name, algorithm: entry.algorithm,
        expected: entry.hash, actual,
      });
    }
  }

  const missingFiles = new Set();
  for (const entry of namedEntries) {
    if (used.has(entry)) continue;
    missingFiles.add(entry.filename);
    rows.push({
      status: '누락', filename: entry.filename, algorithm: entry.algorithm,
      expected: entry.hash, actual: '—',
    });
  }
  return { errors, rows, matched, mismatched, missing: missingFiles.size, extra };
}

function checksumVerificationView(result) {
  if (result.errors.length) return h('section', { class: 'checksum-verification' },
    h('h3', null, '체크섬 검증'),
    h('div', { class: 'error' }, result.errors.join('\n')));

  const failed = result.mismatched + result.missing + result.extra;
  const summary = failed
    ? `검증 실패: 불일치 체크섬 ${result.mismatched}개, 누락 파일 ${result.missing}개, 추가 파일 ${result.extra}개`
    : `검증 성공: 체크섬 ${result.matched}개가 모두 일치합니다.`;
  return h('section', { class: 'checksum-verification' },
    h('h3', null, '체크섬 검증'),
    h('p', { class: `checksum-summary ${failed ? 'bad' : 'ok'}` }, summary),
    h('table', { class: 'grid checksum-results' },
      h('thead', null, h('tr', null,
        ['상태', '파일', '알고리즘', '기대값', '실제값'].map((label) => h('th', { scope: 'col' }, label)))),
      h('tbody', null, result.rows.map((row) => h('tr', { class: `checksum-row-${row.status === '일치' ? 'ok' : 'bad'}` },
        h('td', { 'data-label': '상태' }, row.status), h('td', { 'data-label': '파일' }, row.filename),
        h('td', { 'data-label': '알고리즘' }, row.algorithm),
        h('td', { class: 'mono', 'data-label': '기대값' }, row.expected),
        h('td', { class: 'mono', 'data-label': '실제값' }, row.actual))))));
}

tool({
  id: 'checksum-file', cat: CAT, name: '파일 해시 (체크섬)',
  desc: '파일의 체크섬을 계산하고 GNU/BSD 체크섬 목록과 일치하는지 검증합니다.',
  keywords: 'file checksum verify manifest gnu bsd download digest integrity sha md5 검증',
  render(root) {
    const out = h('div');
    const status = h('div', {
      class: 'io-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
    });
    const file = h('input', {
      type: 'file', multiple: true,
    });
    const expected = h('textarea', {
      class: 'mono', rows: 5,
      placeholder: '예: ba7816bf...  abc.txt\n또는 SHA256 (abc.txt) = ba7816bf...',
    });
    const manifest = h('input', {
      type: 'file',
    });
    const manifestError = h('span', { class: 'error', role: 'alert' });
    let records = [];

    const showResults = () => {
      const frag = h('div');
      let verification = null;
      if (expected.value.trim()) {
        verification = verifyFileChecksums(records, parseChecksumText(expected.value));
        frag.append(checksumVerificationView(verification));
      }
      if (records.length) {
        const checksumText = () => records.flatMap((record) => Object.entries(record.hashes)
          .map(([algorithm, hash]) => `${algorithm.replace('-', '')} (${record.path}) = ${hash}`)).join('\n');
        frag.append(h('div', { class: 'btn-row checksum-all-actions' },
          copyBtn(checksumText, '전체 복사'),
          h('button', {
            class: 'btn small', type: 'button',
            onclick: () => download('checksums.txt', checksumText(), 'text/plain;charset=utf-8'),
          }, '전체 다운로드')));
      }
      for (const record of records) {
        frag.append(h('div', { class: 'checksum-file-result' }, kvTable([
          ['파일', `${record.name} (${record.size.toLocaleString()} bytes)`],
          ...Object.entries(record.hashes),
        ])));
      }
      out.replaceChildren(frag);
      if (!records.length) return;
      if (!verification) {
        status.className = 'io-status active';
        status.textContent = '처리가 완료되었습니다.';
      } else if (verification.errors.length || verification.mismatched || verification.missing || verification.extra) {
        status.className = 'io-status active error';
        status.textContent = verification.errors.length
          ? '체크섬은 계산했지만 검증 입력을 확인해야 합니다.'
          : '체크섬 검증에서 일치하지 않는 항목을 발견했습니다.';
      } else {
        status.className = 'io-status active';
        status.textContent = '체크섬 검증이 완료되었으며 모든 항목이 일치합니다.';
      }
    };

    const wrap = h('div', { class: 'io', 'aria-busy': 'false' },
      formLabel(file, '파일 선택 (여러 개 가능, 브라우저 밖으로 전송되지 않습니다)', { class: 'io-label' }),
      file,
      h('div', { class: 'note' },
        '체크섬을 붙여넣거나 GNU/BSD 체크섬 파일을 불러오면 일치 여부를 검증합니다.'),
      formLabel(expected, '기대 체크섬 또는 체크섬 목록 (선택)', { class: 'io-label' }),
      expected,
      formLabel(manifest, '체크섬 파일 가져오기 (선택, 최대 1MB)', { class: 'io-label' }),
      manifest, manifestError, status, out);
    const runner = createAsyncRunner(wrap, {
      controls: () => [file], status, errorOut: out,
    });
    file.addEventListener('change', () => runner.run(async (task) => {
      const list = [...file.files];
      if (!list.length) throw new Error('체크섬을 계산할 파일을 선택하세요.');
      records = await hashFilesInWorker(list, task);
      if (task.active()) showResults();
    }));
    expected.addEventListener('input', () => {
      if (records.length) showResults();
    });
    manifest.addEventListener('change', async () => {
      const selected = manifest.files?.[0];
      manifestError.textContent = '';
      manifest.disabled = true;
      try {
        if (!selected) throw new Error('가져올 체크섬 파일을 선택하세요.');
        if (selected.size > 1024 * 1024) {
          manifest.value = '';
          throw new Error('체크섬 파일은 1MB 이하만 불러올 수 있습니다.');
        }
        const text = await selected.text();
        if (!text.trim()) {
          expected.value = '';
          throw new Error('체크섬 파일이 비어 있습니다.');
        }
        if (!root.isConnected) return;
        expected.value = text;
        if (records.length) showResults();
        else {
          status.className = 'io-status active';
          status.textContent = '체크섬 파일을 불러왔습니다. 검증할 파일을 선택하세요.';
        }
      } catch (error) {
        if (!root.isConnected) return;
        const detail = error?.message || String(error);
        manifestError.textContent = detail;
        status.className = 'io-status active error';
        status.textContent = `처리 실패: ${detail}`;
      } finally {
        if (root.isConnected) manifest.disabled = false;
      }
    });
    root.append(wrap);
  },
});

/* ---------- CRC / Adler 체크섬 (테이블 방식 범용 CRC 엔진) ---------- */
function reflectBits(v, width) {
  let r = 0;
  for (let i = 0; i < width; i++) { r = (r << 1) | (v & 1); v >>>= 1; }
  return r >>> 0;
}
function makeCRC({ width, poly, init, ref, xor }) {
  const mask = width === 32 ? 0xffffffff : (1 << width) - 1;
  const table = new Uint32Array(256);
  if (ref) {
    const rp = reflectBits(poly, width);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ rp : c >>> 1;
      table[i] = c;
    }
    return (bytes) => {
      let c = reflectBits(init, width);
      for (let i = 0; i < bytes.length; i++) c = (c >>> 8) ^ table[(c ^ bytes[i]) & 0xff];
      return ((c ^ xor) & mask) >>> 0;
    };
  }
  const top = width - 8;
  for (let i = 0; i < 256; i++) {
    let c = i << top;
    for (let k = 0; k < 8; k++) c = c & (1 << (width - 1)) ? (c << 1) ^ poly : c << 1;
    table[i] = c & mask;
  }
  return (bytes) => {
    let c = init;
    for (let i = 0; i < bytes.length; i++) c = ((c << 8) ^ table[((c >>> top) ^ bytes[i]) & 0xff]) & mask;
    return ((c ^ xor) & mask) >>> 0;
  };
}
function adler32(bytes) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
// [이름, 계산 함수, hex 자릿수]
const CHECKSUMS = [
  ['CRC-32', makeCRC({ width: 32, poly: 0x04c11db7, init: 0xffffffff, ref: true, xor: 0xffffffff }), 8],
  ['CRC-32C (Castagnoli)', makeCRC({ width: 32, poly: 0x1edc6f41, init: 0xffffffff, ref: true, xor: 0xffffffff }), 8],
  ['CRC-16/CCITT-FALSE', makeCRC({ width: 16, poly: 0x1021, init: 0xffff, ref: false, xor: 0 }), 4],
  ['CRC-16/XMODEM', makeCRC({ width: 16, poly: 0x1021, init: 0, ref: false, xor: 0 }), 4],
  ['CRC-16/ARC (IBM)', makeCRC({ width: 16, poly: 0x8005, init: 0, ref: true, xor: 0 }), 4],
  ['CRC-16/MODBUS', makeCRC({ width: 16, poly: 0x8005, init: 0xffff, ref: true, xor: 0 }), 4],
  ['CRC-8', makeCRC({ width: 8, poly: 0x07, init: 0, ref: false, xor: 0 }), 2],
  ['Adler-32', adler32, 8],
];

tool({
  id: 'checksum-crc', cat: CAT, name: '체크섬 계산기 (CRC / Adler)',
  desc: 'CRC-8/16/32, CRC-32C, Adler-32 체크섬을 텍스트 또는 파일로 계산합니다.',
  keywords: 'crc crc32 crc16 crc8 adler checksum modbus xmodem ccitt castagnoli',
  render(root) {
    const table = (bytes) => kvTable(CHECKSUMS.map(([name, fn, w]) => {
      const v = fn(bytes);
      return [name, '0x' + v.toString(16).toUpperCase().padStart(w, '0') + ` (${v})`];
    }));
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 5, value: '123456789' }],
      options: [{ id: 'ifmt', label: '입력 형식', type: 'select', values: FMT_IN }],
      outputHTML: true, runOnLoad: true,
      process(text, o) { return table(decodeInput(text, o.ifmt)); },
    });
    // 파일 체크섬
    const fileOut = h('div');
    const file = h('input', { type: 'file' });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      fileOut.innerHTML = '계산 중...';
      const bytes = new Uint8Array(await f.arrayBuffer());
      fileOut.innerHTML = '';
      fileOut.append(h('p', { class: 'note' }, `${f.name} (${f.size.toLocaleString()} bytes)`), table(bytes));
    });
    root.append(h('div', { class: 'io' }, formLabel(file, '또는 파일 선택 (브라우저 밖으로 전송되지 않습니다)', { class: 'io-label' }), file, fileOut));
  },
});
