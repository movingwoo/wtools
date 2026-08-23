// 해싱
import {
  tool, makeIO, h, formLabel, kvTable, copyBtn, download, strToBytes, hexToBytes, bytesToB64,
  decodeInput, FMT_IN, loadScript, vendorUrl, LIB, createAsyncRunner, readFileChunks,
  throwIfAborted, requireFeature,
} from '../core.js';

const CAT = '해싱';

/* ---------- SHA-0 (SHA-1에서 메시지 확장 회전이 빠진 원조 알고리즘) ---------- */
function sha0(bytes) {
  const ml = bytes.length;
  const withPad = new Uint8Array((((ml + 8) >> 6) + 1) << 6);
  withPad.set(bytes);
  withPad[ml] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, ml << 3, false);
  dv.setUint32(withPad.length - 8, Math.floor(ml / 0x20000000), false);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  const rotl = (x, n) => (x << n) | (x >>> (32 - n));
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 80; i++) w[i] = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; // SHA-1과 달리 rotl 없음
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((x) => x.toString(16).padStart(8, '0')).join('');
}

/* ---------- MD2 (RFC 1319) — js-md2 라이브러리는 문자열만 받아 바이트 입력 시 오류가 나므로 직접 구현 ---------- */
const MD2_S = [
  41, 46, 67, 201, 162, 216, 124, 1, 61, 54, 84, 161, 236, 240, 6, 19, 98, 167, 5, 243, 192, 199, 115, 140,
  152, 147, 43, 217, 188, 76, 130, 202, 30, 155, 87, 60, 253, 212, 224, 22, 103, 66, 111, 24, 138, 23, 229, 18,
  190, 78, 196, 214, 218, 158, 222, 73, 160, 251, 245, 142, 187, 47, 238, 122, 169, 104, 121, 145, 21, 178, 7, 63,
  148, 194, 16, 137, 11, 34, 95, 33, 128, 127, 93, 154, 90, 144, 50, 39, 53, 62, 204, 231, 191, 247, 151, 3,
  255, 25, 48, 179, 72, 165, 181, 209, 215, 94, 146, 42, 172, 86, 170, 198, 79, 184, 56, 210, 150, 164, 125, 182,
  118, 252, 107, 226, 156, 116, 4, 241, 69, 157, 112, 89, 100, 113, 135, 32, 134, 91, 207, 101, 230, 45, 168, 2,
  27, 96, 37, 173, 174, 176, 185, 246, 28, 70, 97, 105, 52, 64, 126, 15, 85, 71, 163, 35, 221, 81, 175, 58,
  195, 92, 249, 206, 186, 197, 234, 38, 44, 83, 13, 110, 133, 40, 132, 9, 211, 223, 205, 244, 65, 129, 77, 82,
  106, 220, 55, 200, 108, 193, 171, 250, 36, 225, 123, 8, 12, 189, 177, 74, 120, 136, 149, 139, 227, 99, 232, 109,
  233, 203, 213, 254, 59, 0, 29, 57, 242, 239, 183, 14, 102, 88, 208, 228, 166, 119, 114, 248, 235, 117, 75, 10,
  49, 68, 80, 180, 143, 237, 31, 26, 219, 153, 141, 51, 159, 17, 131, 20,
];
function md2(bytes) {
  const pad = 16 - (bytes.length % 16);
  const msg = new Uint8Array(bytes.length + pad + 16);
  msg.set(bytes);
  msg.fill(pad, bytes.length, bytes.length + pad);
  // 체크섬 블록
  const ck = new Uint8Array(16);
  let l = 0;
  for (let i = 0; i < msg.length - 16; i += 16)
    for (let j = 0; j < 16; j++) l = ck[j] ^= MD2_S[msg[i + j] ^ l];
  msg.set(ck, msg.length - 16);
  // 다이제스트
  const x = new Uint8Array(48);
  for (let i = 0; i < msg.length; i += 16) {
    for (let j = 0; j < 16; j++) {
      x[16 + j] = msg[i + j];
      x[32 + j] = x[16 + j] ^ x[j];
    }
    let t = 0;
    for (let round = 0; round < 18; round++) {
      for (let k = 0; k < 48; k++) t = x[k] ^= MD2_S[t];
      t = (t + round) & 255;
    }
  }
  return [...x.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- SHA-3 (FIPS 202) ----------
CryptoJS.SHA3는 표준화 이전 Keccak 패딩(0x01)이라 FIPS 202 SHA-3(0x06)와 결과가 다르다.
표준 SHA-3는 여기서 직접 구현하고, CryptoJS 쪽은 Keccak-256 항목으로만 사용한다. */
const KECCAK_RC = (() => {
  // LFSR(x^8+x^6+x^5+x^4+1)로 라운드 상수를 스펙대로 생성
  const rc = [];
  let r = 1;
  for (let i = 0; i < 24; i++) {
    let c = 0n;
    for (let j = 0; j < 7; j++) {
      if (r & 1) c |= 1n << ((1n << BigInt(j)) - 1n);
      r = r & 0x80 ? ((r << 1) ^ 0x71) & 0xff : (r << 1) & 0xff;
    }
    rc.push(c);
  }
  return rc;
})();

const M64 = (1n << 64n) - 1n;
const rotl64 = (v, n) => n === 0n ? v : ((v << n) | (v >> (64n - n))) & M64;

function keccakF(A) {
  for (let round = 0; round < 24; round++) {
    const C = [], D = [];
    for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
    for (let x = 0; x < 5; x++) {
      D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1n);
      for (let y = 0; y < 25; y += 5) A[x + y] ^= D[x];
    }
    let x = 1, y = 0, cur = A[1];
    for (let t = 0; t < 24; t++) {
      const r = BigInt(((t + 1) * (t + 2) / 2) % 64);
      [x, y] = [y, (2 * x + 3 * y) % 5];
      const idx = x + 5 * y;
      [A[idx], cur] = [rotl64(cur, r), A[idx]];
    }
    for (let y0 = 0; y0 < 25; y0 += 5) {
      const row = A.slice(y0, y0 + 5);
      for (let x0 = 0; x0 < 5; x0++) A[y0 + x0] = row[x0] ^ (~row[(x0 + 1) % 5] & M64 & row[(x0 + 2) % 5]);
    }
    A[0] ^= KECCAK_RC[round];
  }
}

function sha3(bytes, outBits) {
  const rate = (1600 - 2 * outBits) / 8;
  const A = new Array(25).fill(0n);
  const padded = new Uint8Array((Math.floor(bytes.length / rate) + 1) * rate);
  padded.set(bytes);
  padded[bytes.length] = 0x06; // SHA-3 도메인 구분 + pad10*1 시작
  padded[padded.length - 1] |= 0x80;
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate; i++) A[i >> 3] ^= BigInt(padded[off + i]) << BigInt(8 * (i & 7));
    keccakF(A);
  }
  let out = '';
  for (let i = 0; i < outBits / 8; i++) out += Number((A[i >> 3] >> BigInt(8 * (i & 7))) & 0xffn).toString(16).padStart(2, '0');
  return out;
}

// HMAC-SHA3 — 블록 크기는 해당 SHA-3의 rate
function hmacSha3(msgBytes, keyBytes, outBits) {
  const rate = (1600 - 2 * outBits) / 8;
  let k = keyBytes;
  if (k.length > rate) k = hexToBytes(sha3(k, outBits));
  const inner = new Uint8Array(rate + msgBytes.length).fill(0x36, 0, rate);
  const outer = new Uint8Array(rate + outBits / 8).fill(0x5c, 0, rate);
  for (let i = 0; i < k.length; i++) { inner[i] ^= k[i]; outer[i] ^= k[i]; }
  inner.set(msgBytes, rate);
  outer.set(hexToBytes(sha3(inner, outBits)), rate);
  return sha3(outer, outBits);
}

function toWordArray(bytes) {
  return CryptoJS.lib.WordArray.create(bytes);
}

async function computeHash(alg, bytes) {
  switch (alg) {
    case 'MD2': return md2(bytes);
    case 'MD4': await loadScript(LIB.md4); return md4(bytes);
    case 'MD5': return CryptoJS.MD5(toWordArray(bytes)).toString();
    case 'SHA0': return sha0(bytes);
    case 'SHA1': return CryptoJS.SHA1(toWordArray(bytes)).toString();
    case 'SHA224': return CryptoJS.SHA224(toWordArray(bytes)).toString();
    case 'SHA256': return CryptoJS.SHA256(toWordArray(bytes)).toString();
    case 'SHA384': return CryptoJS.SHA384(toWordArray(bytes)).toString();
    case 'SHA512': return CryptoJS.SHA512(toWordArray(bytes)).toString();
    case 'SHA3-224': return sha3(bytes, 224);
    case 'SHA3-256': return sha3(bytes, 256);
    case 'SHA3-384': return sha3(bytes, 384);
    case 'SHA3-512': return sha3(bytes, 512);
    case 'Keccak-256': return CryptoJS.SHA3(toWordArray(bytes), { outputLength: 256 }).toString();
    case 'RIPEMD160': return CryptoJS.RIPEMD160(toWordArray(bytes)).toString();
  }
}
const ALL_ALGS = ['MD2', 'MD4', 'MD5', 'SHA0', 'SHA1', 'SHA224', 'SHA256', 'SHA384', 'SHA512', 'SHA3-224', 'SHA3-256', 'SHA3-384', 'SHA3-512', 'Keccak-256', 'RIPEMD160'];

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
      outputHTML: true, runOnLoad: true,
      async process(text, o) {
        const bytes = decodeInput(text, o.ifmt);
        const rows = [];
        for (const alg of ALL_ALGS) {
          try {
            let v = await computeHash(alg, bytes);
            rows.push([alg, o.upper ? v.toUpperCase() : v]);
          } catch (e) {
            rows.push([alg, '(오류: ' + e.message + ')']);
          }
        }
        return kvTable(rows);
      },
    });
  },
});

/* ---------- BLAKE / xxHash ----------
   위 '해시 생성'은 CryptoJS만 써서 즉시 계산되는 도구라, WASM(약 280KB)을 받아야 하는
   최신 알고리즘은 별도 도구로 떼어 둔다. 여기서만 hash-wasm을 지연 로드한다. */
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
      runOnLoad: true,
      transferOutput: { id: 'hash', when: ({ result }) => !!String(result).trim() },
      process(v, o) {
        // CryptoJS.HmacSHA3는 Keccak 기반이라 표준 HMAC-SHA3와 다르다 — 직접 구현 사용
        if (o.alg === 'SHA3-256' || o.alg === 'SHA3-512') {
          const hex = hmacSha3(strToBytes(v.msg), strToBytes(v.key), +o.alg.slice(5));
          return o.ofmt === 'base64' ? bytesToB64(hexToBytes(hex)) : hex;
        }
        const algMap = {
          SHA1: CryptoJS.HmacSHA1, SHA224: CryptoJS.HmacSHA224, SHA256: CryptoJS.HmacSHA256,
          SHA384: CryptoJS.HmacSHA384, SHA512: CryptoJS.HmacSHA512, MD5: CryptoJS.HmacMD5,
        };
        const wa = algMap[o.alg](v.msg, v.key);
        return o.ofmt === 'base64' ? CryptoJS.enc.Base64.stringify(wa) : wa.toString();
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

const FILE_HASH_WORKER_SOURCE = `
const CRYPTO_JS_URL = ${JSON.stringify(vendorUrl('cryptoJsWorker'))};
const hashers = new Map();
let loaded = false;
function load() {
  if (!loaded) { importScripts(CRYPTO_JS_URL); loaded = true; }
}
self.onmessage = ({ data }) => {
  try {
    load();
    if (data.type === 'start') {
      const algorithm = CryptoJS.algo[data.algorithm];
      if (!algorithm) throw new Error('지원하지 않는 파일 해시 알고리즘입니다.');
      hashers.set(data.job, algorithm.create());
      self.postMessage({ request: data.request });
      return;
    }
    const hasher = hashers.get(data.job);
    if (!hasher) throw new Error('파일 해시 작업 상태를 찾지 못했습니다.');
    if (data.type === 'chunk') {
      hasher.update(CryptoJS.lib.WordArray.create(new Uint8Array(data.bytes)));
      self.postMessage({ request: data.request });
      return;
    }
    if (data.type === 'finish') {
      const digest = hasher.finalize().toString();
      hashers.delete(data.job);
      self.postMessage({ request: data.request, digest });
      return;
    }
    throw new Error('알 수 없는 파일 해시 요청입니다.');
  } catch (error) {
    self.postMessage({ request: data.request, error: error?.message || String(error) });
  }
};`;

function fileHashWorker(signal) {
  requireFeature('worker', typeof Worker !== 'undefined');
  const url = URL.createObjectURL(new Blob([FILE_HASH_WORKER_SOURCE], { type: 'text/javascript' }));
  const worker = new Worker(url);
  const pending = new Map();
  let requestId = 0;
  const close = (error) => {
    worker.terminate();
    URL.revokeObjectURL(url);
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };
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
  signal?.addEventListener('abort', () => close(new DOMException('작업이 취소되었습니다.', 'AbortError')), { once: true });
  return {
    request(message, transfer = []) {
      throwIfAborted(signal);
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
        await client.request({ type: 'start', job, algorithm: config.worker });
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
      'data-file-budget-note': '청크를 2 MiB씩 Worker로 보내므로 파일 전체를 한 번에 메모리에 올리지 않습니다.',
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
        '선택 사항: 기대 체크섬을 직접 붙여넣거나 GNU/BSD 형식의 체크섬 파일을 불러오면 일치 여부를 함께 검증합니다.'),
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
      note: '기본값 "123456789"는 CRC 알고리즘 검증용 표준 입력(check value)입니다.',
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
