// 암호화 / 복호화
import {
  tool, makeIO, h, formLabel, kvTable, strToBytes, bytesToStr, bytesToHex, hexToBytes,
  bytesToB64, b64ToBytes, concatBytes, decodeInput, encodeOutput, loadScript, loadModule,
  vendorUrl, LIB, copyBtn, createAsyncRunner, requireFeature,
} from '../core.js';

const CAT = '암호화 / 복호화';
let qrModule = null;

function loadQrModule() {
  return qrModule ??= import('../lib/qr/encoder.js').catch((cause) => {
    qrModule = null;
    throw new Error('QR 코드 생성 모듈을 불러오지 못했습니다.', { cause });
  });
}

function qrCanvas(qr, scale = 5, margin = 8) {
  const dimension = qr.size * scale + margin * 2;
  const canvas = h('canvas', {
    width: dimension, height: dimension, role: 'img', 'aria-label': '인증 앱 등록용 QR 코드',
  });
  const context = canvas.getContext('2d');
  requireFeature('canvas', !!context);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, dimension, dimension);
  context.fillStyle = '#000';
  for (let row = 0; row < qr.size; row++) for (let column = 0; column < qr.size; column++) {
    if (qr.modules[row][column]) context.fillRect(margin + column * scale, margin + row * scale, scale, scale);
  }
  return canvas;
}

/* ---------- 고전 암호 ----------
   전부 영문 알파벳만 치환하고 한글·숫자·기호는 그대로 통과시킨다. */
function caesar(text, shift) {
  const normalized = ((shift % 26) + 26) % 26;
  return [...text].map((c) => {
    const cp = c.charCodeAt(0);
    if (cp >= 65 && cp <= 90) return String.fromCharCode(((cp - 65 + normalized) % 26) + 65);
    if (cp >= 97 && cp <= 122) return String.fromCharCode(((cp - 97 + normalized) % 26) + 97);
    return c;
  }).join('');
}
// ROT47은 출력 가능한 ASCII(!~) 94자를 통째로 47칸 돌린다. 자기 자신이 역연산이다.
function rot47(text) {
  return [...text].map((c) => {
    const cp = c.codePointAt(0);
    return cp >= 33 && cp <= 126 ? String.fromCharCode(33 + ((cp - 33 + 47) % 94)) : c;
  }).join('');
}
function atbash(text) {
  return [...text].map((c) => {
    const cp = c.charCodeAt(0);
    if (cp >= 65 && cp <= 90) return String.fromCharCode(90 - (cp - 65));
    if (cp >= 97 && cp <= 122) return String.fromCharCode(122 - (cp - 97));
    return c;
  }).join('');
}
function vigenere(text, key, decrypt) {
  const letters = [...key.toLowerCase()].filter((c) => c >= 'a' && c <= 'z');
  if (!letters.length) throw new Error('Vigenère 키에는 영문자가 하나 이상 있어야 합니다.');
  let used = 0;
  return [...text].map((c) => {
    if (!/[a-z]/i.test(c)) return c; // 알파벳이 아니면 키를 소모하지 않는다
    const shift = letters[used++ % letters.length].charCodeAt(0) - 97;
    return caesar(c, decrypt ? -shift : shift);
  }).join('');
}
// 지그재그로 내려갔다 올라오는 레일 번호를 미리 만들어 두고, 암호화·복호화 모두 이걸 쓴다.
function railPattern(length, rails) {
  const pattern = [];
  let rail = 0, step = 1;
  for (let i = 0; i < length; i++) {
    pattern.push(rail);
    if (rail === 0) step = 1;
    else if (rail === rails - 1) step = -1;
    rail += step;
  }
  return pattern;
}
function railFence(text, rails, decrypt) {
  if (!Number.isInteger(rails) || rails < 2) throw new Error('레일 수는 2 이상의 정수여야 합니다.');
  const chars = [...text];
  const pattern = railPattern(chars.length, rails);
  if (!decrypt) {
    const rows = Array.from({ length: rails }, () => []);
    chars.forEach((c, i) => rows[pattern[i]].push(c));
    return rows.flat().join('');
  }
  // 레일 순서대로 읽었던 자리를 되짚어 원래 인덱스에 돌려놓는다.
  const order = pattern.map((rail, index) => [rail, index]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = new Array(chars.length);
  order.forEach(([, index], i) => { out[index] = chars[i]; });
  return out.join('');
}

tool({
  id: 'classic-cipher', cat: CAT, name: '고전 암호 (ROT13 / 카이사르 / 비제네르)',
  desc: 'ROT13, ROT47, 카이사르, 아트바시, 비제네르, 레일 펜스 암호를 적용하거나 해독합니다.',
  keywords: 'rot13 rot47 caesar shift atbash vigenere railfence classic cipher 시저 카이사르 고전암호 치환',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'text', label: '입력', rows: 5, value: 'Hello, World!' },
        { id: 'key', label: 'Vigenère 키 (비제네르 선택 시)', rows: 1, value: 'wtools' },
      ],
      options: [
        {
          id: 'mode', label: '방식', type: 'select', values: [
            ['rot13', 'ROT13'], ['rot47', 'ROT47'], ['caesar', '카이사르 (자리 이동)'],
            ['atbash', '아트바시 (A↔Z)'], ['vigenere', '비제네르 (키워드)'], ['rail', '레일 펜스'],
          ],
        },
        { id: 'shift', label: '카이사르 자리 수', type: 'number', value: 3, size: 70 },
        { id: 'rails', label: '레일 수', type: 'number', value: 3, size: 70 },
      ],
      actions: [{ id: 'enc', label: '암호화' }, { id: 'dec', label: '복호화' }],
      runOnLoad: true, outputRows: 5,
      process(v, o, action) {
        const decrypt = action === 'dec';
        switch (o.mode) {
          case 'rot13': return caesar(v.text, 13); // 13은 26의 절반이라 암·복호가 같다
          case 'rot47': return rot47(v.text);
          case 'atbash': return atbash(v.text);
          case 'caesar': {
            const shift = Math.trunc(+o.shift);
            if (!Number.isFinite(shift)) throw new Error('자리 수는 정수로 입력하세요.');
            return caesar(v.text, decrypt ? -shift : shift);
          }
          case 'vigenere': return vigenere(v.text, v.key, decrypt);
          case 'rail': return railFence(v.text, Math.trunc(+o.rails), decrypt);
        }
      },
      note: 'ROT13·ROT47·아트바시는 같은 연산을 두 번 하면 원문으로 돌아오므로 암호화와 복호화 결과가 같습니다. 어느 것도 실제 기밀 보호에는 쓸 수 없습니다.',
    });
  },
});

/* ---------- AES ---------- */
const AES_PBKDF2_ITERATIONS = 600_000;
const AES_KEY_SIZES = new Set([128, 192, 256]);
const AES_MODES = new Set(['GCM', 'CBC', 'CFB', 'CTR', 'OFB', 'ECB']);

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function aesIvLength(mode) {
  if (mode === 'GCM') return 12;
  if (mode === 'ECB') return 0;
  return 16;
}

function parseAesKey(text, format, bits) {
  if (!AES_KEY_SIZES.has(bits)) throw new Error('AES 키 크기는 128, 192, 256비트 중 하나여야 합니다.');
  if (!text.trim()) throw new Error('키를 입력하세요.');
  const key = decodeInput(text, format);
  const expected = bits / 8;
  if (key.length !== expected)
    throw new Error(`AES-${bits} 키는 ${expected}바이트여야 합니다. (현재 ${key.length}바이트)`);
  return key;
}

function parseAesIv(text, mode, required) {
  const length = aesIvLength(mode);
  if (!length) {
    if (text.trim()) throw new Error('ECB 모드는 IV를 사용하지 않습니다. IV 입력을 비워 주세요.');
    return new Uint8Array();
  }
  if (!text.trim()) {
    if (required) throw new Error(`${mode} 모드의 IV/nonce를 Hex로 입력하세요 (${length}바이트).`);
    return randomBytes(length);
  }
  const iv = hexToBytes(text);
  if (iv.length !== length)
    throw new Error(`${mode} 모드의 IV/nonce는 ${length}바이트여야 합니다. (현재 ${iv.length}바이트)`);
  return iv;
}

async function pbkdf2AesKey(password, salt, bits, iterations) {
  if (!password) throw new Error('비밀번호를 입력하세요.');
  const base = await crypto.subtle.importKey('raw', strToBytes(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt, iterations,
  }, base, bits);
  return new Uint8Array(derived);
}

function cryptoJsAesConfig(mode, iv) {
  return {
    mode: CryptoJS.mode[mode],
    padding: ['CTR', 'CFB', 'OFB'].includes(mode) ? CryptoJS.pad.NoPadding : CryptoJS.pad.Pkcs7,
    ...(iv.length ? { iv: CryptoJS.lib.WordArray.create(iv) } : {}),
  };
}

function cryptoJsAesEncrypt(text, key, iv, mode) {
  const enc = CryptoJS.AES.encrypt(text, CryptoJS.lib.WordArray.create(key), cryptoJsAesConfig(mode, iv));
  return hexToBytes(enc.ciphertext.toString(CryptoJS.enc.Hex));
}

function cryptoJsAesDecrypt(ciphertext, key, iv, mode) {
  if (['CBC', 'ECB'].includes(mode) && (!ciphertext.length || ciphertext.length % 16))
    throw new Error(`${mode} 암호문 길이는 16바이트의 배수여야 합니다.`);
  try {
    const params = CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.lib.WordArray.create(ciphertext) });
    const dec = CryptoJS.AES.decrypt(params, CryptoJS.lib.WordArray.create(key), cryptoJsAesConfig(mode, iv));
    const bytes = hexToBytes(dec.toString(CryptoJS.enc.Hex));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('복호화 실패: 키, IV, 모드와 암호문을 확인하세요. 레거시 모드는 변조 여부를 검증하지 못합니다.');
  }
}

async function aesGcmEncrypt(text, keyBytes, iv) {
  if (keyBytes.length === 24)
    throw new Error('AES-GCM 192비트 키는 지원 브라우저 간 호환성이 없습니다. GCM은 128 또는 256비트를 사용하세요.');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const result = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, strToBytes(text));
  return new Uint8Array(result); // Web Crypto는 ciphertext 뒤에 인증 태그를 붙여 반환한다.
}

async function aesGcmDecrypt(ciphertext, keyBytes, iv) {
  if (keyBytes.length === 24)
    throw new Error('AES-GCM 192비트 키는 지원 브라우저 간 호환성이 없습니다. GCM은 128 또는 256비트를 사용하세요.');
  if (ciphertext.length < 16) throw new Error('AES-GCM 암호문에는 16바이트 인증 태그가 필요합니다.');
  try {
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    const result = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ciphertext);
    return new TextDecoder('utf-8', { fatal: true }).decode(result);
  } catch {
    throw new Error('AES-GCM 인증 실패: 키가 다르거나 암호문 또는 인증 태그가 변경되었습니다.');
  }
}

function encodeAesEnvelope(data, format) {
  return encodeOutput(strToBytes(JSON.stringify(data)), format);
}

function decodeAesEnvelope(text, format) {
  let data;
  try {
    data = JSON.parse(bytesToStr(decodeInput(text.trim(), format)));
  } catch {
    throw new Error('W-Tools AES 자체 포함 형식이 아닙니다. 암호문 형식과 결과 구성을 확인하세요.');
  }
  const mode = typeof data.alg === 'string' ? data.alg.replace(/^AES-/, '') : '';
  if (data.v !== 1 || !AES_MODES.has(mode) || !AES_KEY_SIZES.has(data.keyBits))
    throw new Error('지원하지 않는 W-Tools AES 자체 포함 형식입니다.');
  if (!['raw', 'PBKDF2-SHA256'].includes(data.kdf)) throw new Error('지원하지 않는 AES 키 유도 방식입니다.');
  const iv = data.iv ? b64ToBytes(data.iv) : new Uint8Array();
  if (iv.length !== aesIvLength(mode)) throw new Error('암호문에 저장된 IV/nonce 길이가 올바르지 않습니다.');
  const ciphertext = b64ToBytes(data.ciphertext || '');
  let salt = new Uint8Array(), iterations = 0;
  if (data.kdf === 'PBKDF2-SHA256') {
    salt = b64ToBytes(data.salt || '');
    iterations = data.iterations;
    if (salt.length !== 16) throw new Error('암호문에 저장된 PBKDF2 salt 길이가 올바르지 않습니다.');
    if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 10_000_000)
      throw new Error('암호문에 저장된 PBKDF2 반복 횟수가 허용 범위를 벗어났습니다.');
  }
  return { mode, keyBits: data.keyBits, kdf: data.kdf, iv, ciphertext, salt, iterations };
}

function encodeOpenSslAes(text, password, keyBits, mode, format) {
  if (!password) throw new Error('비밀번호를 입력하세요.');
  const salt = randomBytes(8);
  const saltWords = CryptoJS.lib.WordArray.create(salt);
  const derived = CryptoJS.kdf.OpenSSL.execute(password, keyBits / 32, 4, saltWords);
  const enc = CryptoJS.AES.encrypt(text, derived.key, {
    ...cryptoJsAesConfig(mode, mode === 'ECB' ? new Uint8Array() : hexToBytes(derived.iv.toString())),
  });
  const params = CryptoJS.lib.CipherParams.create({ ciphertext: enc.ciphertext, salt: saltWords });
  const base64 = CryptoJS.format.OpenSSL.stringify(params);
  return format === 'hex' ? bytesToHex(b64ToBytes(base64)) : base64;
}

function decodeOpenSslAes(text, password, keyBits, mode, format) {
  if (!password) throw new Error('비밀번호를 입력하세요.');
  const bytes = decodeInput(text.trim(), format);
  if (bytesToStr(bytes.subarray(0, 8)) !== 'Salted__')
    throw new Error('OpenSSL Salted__ 형식의 AES 암호문이 아닙니다.');
  try {
    const params = CryptoJS.format.OpenSSL.parse(bytesToB64(bytes));
    const derived = CryptoJS.kdf.OpenSSL.execute(password, keyBits / 32, 4, params.salt);
    const dec = CryptoJS.AES.decrypt(params, derived.key, {
      ...cryptoJsAesConfig(mode, mode === 'ECB' ? new Uint8Array() : hexToBytes(derived.iv.toString())),
    });
    return new TextDecoder('utf-8', { fatal: true }).decode(hexToBytes(dec.toString(CryptoJS.enc.Hex)));
  } catch {
    throw new Error('OpenSSL AES 복호화 실패: 비밀번호, 키 크기, 모드와 암호문을 확인하세요.');
  }
}

tool({
  id: 'aes', cat: CAT, name: 'AES 암호화/복호화',
  desc: 'AES-GCM 인증 암호화를 기본으로 제공하며 CBC/CTR 등 레거시 호환 모드도 지원합니다.',
  keywords: 'aes gcm cbc ctr rijndael symmetric authenticated encrypt pbkdf2 openssl',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'text', label: '입력 (암호화: 평문 / 복호화: 암호문)', rows: 6, value: 'Secret message 비밀 메시지' },
        { id: 'key', label: '키 / 비밀번호', rows: 2, value: 'my-secret-password' },
        { id: 'iv', label: 'IV / nonce (Hex, 암호화 시 비우면 안전하게 자동 생성)', rows: 2, placeholder: 'GCM 12바이트 / 그 외 16바이트. 암호문만 사용 시 필수' },
      ],
      options: [
        { id: 'keySize', label: '키 크기', type: 'select', values: [['256', '256비트'], ['128', '128비트'], ['192', '192비트(레거시 모드)']] },
        { id: 'mode', label: '모드', type: 'select', values: [['GCM', 'GCM (권장·인증)'], ['CBC', 'CBC (레거시)'], ['CTR', 'CTR (레거시)'], ['CFB', 'CFB (레거시)'], ['OFB', 'OFB (레거시)'], ['ECB', 'ECB (취약·호환 전용)']] },
        { id: 'keyMode', label: '키 방식', type: 'select', values: [['passphrase', '비밀번호(PBKDF2-SHA256)'], ['raw', '키 직접'], ['openssl', '비밀번호(OpenSSL 레거시)']] },
        { id: 'keyFormat', label: '직접 키 형식', type: 'select', values: [['hex', 'Hex'], ['base64', 'Base64'], ['text', 'UTF-8']] },
        { id: 'bundle', label: '결과 구성', type: 'select', values: [['package', '자체 포함(권장)'], ['raw', '암호문만(호환용)']] },
        { id: 'ofmt', label: '암호문 형식', type: 'select', values: [['base64', 'Base64'], ['hex', 'Hex']] },
        { id: 'legacyConfirm', label: '취약한 ECB 새 암호화 허용', type: 'checkbox' },
      ],
      actions: [{ id: 'enc', label: '암호화' }, { id: 'dec', label: '복호화' }],
      autorun: false,
      async process(v, o, action) {
        const decrypt = action === 'dec';
        const selectedMode = o.mode;
        const selectedBits = +o.keySize;
        if (!AES_MODES.has(selectedMode)) throw new Error('지원하지 않는 AES 모드입니다.');
        if (!AES_KEY_SIZES.has(selectedBits)) throw new Error('AES 키 크기는 128, 192, 256비트 중 하나여야 합니다.');
        if (!decrypt && selectedMode === 'ECB' && !o.legacyConfirm)
          throw new Error('ECB 새 암호화는 패턴을 노출합니다. 호환 목적이라면 “취약한 ECB 새 암호화 허용”을 먼저 선택하세요.');

        if (o.keyMode === 'openssl') {
          if (selectedMode === 'GCM') throw new Error('OpenSSL 레거시 키 유도는 GCM에서 지원하지 않습니다. PBKDF2 또는 직접 키를 사용하세요.');
          if (o.bundle !== 'package') throw new Error('OpenSSL 레거시 방식은 salt를 보존하도록 자체 포함 결과를 사용하세요.');
          if (v.iv.trim()) throw new Error('OpenSSL 레거시 방식은 salt에서 IV를 유도합니다. IV 입력을 비워 주세요.');
          return decrypt
            ? decodeOpenSslAes(v.text, v.key, selectedBits, selectedMode, o.ofmt)
            : encodeOpenSslAes(v.text, v.key, selectedBits, selectedMode, o.ofmt);
        }

        if (decrypt && o.bundle === 'package') {
          const env = decodeAesEnvelope(v.text, o.ofmt);
          const key = env.kdf === 'PBKDF2-SHA256'
            ? await pbkdf2AesKey(v.key, env.salt, env.keyBits, env.iterations)
            : parseAesKey(v.key, o.keyFormat, env.keyBits);
          return env.mode === 'GCM'
            ? aesGcmDecrypt(env.ciphertext, key, env.iv)
            : cryptoJsAesDecrypt(env.ciphertext, key, env.iv, env.mode);
        }

        if (o.bundle === 'raw' && o.keyMode !== 'raw')
          throw new Error('암호문만 출력·복호화하려면 salt가 필요 없는 직접 키 방식을 선택하세요.');

        const salt = o.keyMode === 'passphrase' ? randomBytes(16) : new Uint8Array();
        const key = o.keyMode === 'passphrase'
          ? await pbkdf2AesKey(v.key, salt, selectedBits, AES_PBKDF2_ITERATIONS)
          : parseAesKey(v.key, o.keyFormat, selectedBits);
        const iv = parseAesIv(v.iv, selectedMode, o.bundle === 'raw');

        if (decrypt) {
          const ciphertext = decodeInput(v.text.trim(), o.ofmt);
          return selectedMode === 'GCM'
            ? aesGcmDecrypt(ciphertext, key, iv)
            : cryptoJsAesDecrypt(ciphertext, key, iv, selectedMode);
        }

        const ciphertext = selectedMode === 'GCM'
          ? await aesGcmEncrypt(v.text, key, iv)
          : cryptoJsAesEncrypt(v.text, key, iv, selectedMode);
        if (o.bundle === 'raw') return encodeOutput(ciphertext, o.ofmt);
        return encodeAesEnvelope({
          v: 1,
          alg: `AES-${selectedMode}`,
          keyBits: selectedBits,
          kdf: o.keyMode === 'passphrase' ? 'PBKDF2-SHA256' : 'raw',
          ...(o.keyMode === 'passphrase' ? { iterations: AES_PBKDF2_ITERATIONS, salt: bytesToB64(salt) } : {}),
          iv: bytesToB64(iv),
          ciphertext: bytesToB64(ciphertext),
        }, o.ofmt);
      },
      note: '기본 방식은 AES-GCM(128비트 인증 태그)과 PBKDF2-HMAC-SHA256 600,000회입니다. 자체 포함 결과에는 알고리즘·키 크기·salt·IV·인증 태그가 함께 저장됩니다. 지원 브라우저 간 호환을 위해 GCM은 128/256비트를 사용하며 192비트는 레거시 모드에서만 제공합니다. 암호문만 결과는 상호 운용용이며 직접 키와 명시적 IV가 필요합니다. CBC/CTR/CFB/OFB는 변조를 검증하지 못하고 ECB는 패턴을 숨기지 못하므로 새 데이터 보호에는 사용하지 마세요.',
    });
  },
});

/* ---------- 레거시 대칭키 (CryptoJS) ---------- */
function symTool({ id, name, algo, keySizes, desc, keywords }) {
  tool({
    id, cat: CAT, name, desc, keywords,
    render(root) {
      makeIO(root, {
        inputs: [
          { id: 'text', label: '입력 (암호화: 평문 / 복호화: Base64 또는 Hex)', rows: 5, value: 'Secret message 비밀 메시지' },
          { id: 'key', label: '키 / 비밀번호', rows: 2, value: 'my-secret-password' },
        ],
        options: [
          keySizes ? { id: 'keySize', label: '키 크기', type: 'select', values: keySizes } : null,
          { id: 'mode', label: '모드', type: 'select', values: ['CBC', 'CFB', 'CTR', 'OFB', 'ECB'] },
          { id: 'kdf', label: '키 유도', type: 'select', values: [['passphrase', '비밀번호(OpenSSL)'], ['raw', '키 직접(Hex/UTF-8)']] },
          { id: 'ofmt', label: '암호문 형식', type: 'select', values: [['base64', 'Base64'], ['hex', 'Hex']] },
          { id: 'legacyConfirm', label: '레거시 새 암호화 허용', type: 'checkbox' },
        ].filter(Boolean),
        actions: [{ id: 'enc', label: '암호화' }, { id: 'dec', label: '복호화' }],
        autorun: false,
        process(v, o, action) {
          if (action === 'enc' && (id === 'des' || id === 'tripledes' || o.mode === 'ECB') && !o.legacyConfirm)
            throw new Error('DES/3DES/ECB 새 암호화는 안전하지 않습니다. 호환 목적이라면 “레거시 새 암호화 허용”을 먼저 선택하세요.');
          const cfg = { mode: CryptoJS.mode[o.mode], padding: o.mode === 'CTR' || o.mode === 'CFB' || o.mode === 'OFB' ? CryptoJS.pad.NoPadding : CryptoJS.pad.Pkcs7 };
          let keyParam;
          if (o.kdf === 'raw') {
            keyParam = /^[0-9a-f]+$/i.test(v.key.trim()) && v.key.trim().length % 2 === 0
              ? CryptoJS.enc.Hex.parse(v.key.trim())
              : CryptoJS.enc.Utf8.parse(v.key);
            if (o.mode !== 'ECB') {
              const ivLen = algo === 'DES' || algo === 'TripleDES' || algo === 'Blowfish' ? 8 : 16;
              cfg.iv = CryptoJS.lib.WordArray.create(new Uint8Array(ivLen)); // 0 IV (raw 모드)
            }
          } else {
            keyParam = v.key; // 비밀번호 → OpenSSL EVP_BytesToKey
          }
          if (action === 'dec') {
            const cipherText = o.ofmt === 'hex'
              ? CryptoJS.enc.Hex.parse(v.text.trim()).toString(CryptoJS.enc.Base64)
              : v.text.trim();
            const dec = CryptoJS[algo].decrypt(cipherText, keyParam, cfg);
            const str = dec.toString(CryptoJS.enc.Utf8);
            if (!str) throw new Error('복호화 실패 (키/모드/형식을 확인하세요).');
            return str;
          }
          const enc = CryptoJS[algo].encrypt(v.text, keyParam, cfg);
          return o.ofmt === 'hex' ? enc.ciphertext.toString() : enc.toString();
        },
        note: '레거시 호환 전용입니다. 새 데이터 보호에는 인증 암호화인 AES-GCM을 사용하세요. CBC/비밀번호 모드는 OpenSSL 호환(Salted__) 형식이며 키 직접 입력 시 IV는 0으로 고정됩니다.',
      });
    },
  });
}

symTool({ id: 'des', name: 'DES 암호화/복호화', algo: 'DES', desc: 'DES 대칭키 암호화 (레거시, 보안 취약).', keywords: 'des symmetric' });
symTool({ id: 'tripledes', name: 'Triple DES 암호화/복호화', algo: 'TripleDES', desc: '3DES 대칭키 암호화 (레거시, 새 데이터 보호에는 권장하지 않음).', keywords: '3des triple des' });
symTool({ id: 'blowfish', name: 'Blowfish 암호화/복호화', algo: 'Blowfish', desc: 'Blowfish 대칭키 암호화 (레거시 호환용).', keywords: 'blowfish symmetric' });

/* ---------- XOR ---------- */
function xorBytes(data, key) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
}
tool({
  id: 'xor', cat: CAT, name: 'XOR 암호화',
  desc: '반복 키 XOR 암호화/복호화를 수행합니다.',
  keywords: 'xor cipher',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'text', label: '입력', rows: 5, value: 'Hello XOR' },
        { id: 'key', label: '키', rows: 2, value: 'KEY' },
      ],
      options: [
        { id: 'ifmt', label: '입력 형식', type: 'select', values: [['text', '텍스트'], ['hex', 'Hex'], ['base64', 'Base64']] },
        { id: 'kfmt', label: '키 형식', type: 'select', values: [['text', '텍스트'], ['hex', 'Hex']] },
        { id: 'ofmt', label: '출력 형식', type: 'select', values: [['hex', 'Hex'], ['base64', 'Base64'], ['text', '텍스트']] },
      ],
      process(v, o) {
        const data = decodeInput(v.text, o.ifmt);
        const key = o.kfmt === 'hex' ? hexToBytes(v.key) : strToBytes(v.key);
        if (!key.length) throw new Error('키를 입력하세요.');
        const res = xorBytes(data, key);
        return o.ofmt === 'hex' ? bytesToHex(res) : o.ofmt === 'base64' ? bytesToB64(res) : bytesToStr(res);
      },
    });
  },
});

tool({
  id: 'xor-brute', cat: CAT, name: 'XOR 브루트포스',
  desc: '단일 바이트 XOR로 암호화된 데이터를 모든 키(0~255)로 시도합니다.',
  keywords: 'xor brute force crack single byte',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '암호문 (Hex 또는 Base64)', rows: 4, placeholder: '48 65 6c 6c 6f ...' }],
      options: [
        { id: 'ifmt', label: '입력 형식', type: 'select', values: [['hex', 'Hex'], ['base64', 'Base64']] },
        { id: 'filter', label: '출력 필터', type: 'select', values: [['printable', '인쇄 가능 문자만'], ['all', '전체 표시']] },
      ],
      outputHTML: true,
      process(text, o) {
        if (!text.trim()) return '';
        const data = o.ifmt === 'hex' ? hexToBytes(text) : b64ToBytes(text);
        const results = [];
        for (let k = 0; k < 256; k++) {
          const dec = data.map((b) => b ^ k);
          const printable = dec.filter((b) => b >= 32 && b < 127).length / dec.length;
          if (o.filter === 'printable' && printable < 0.9) continue;
          const str = bytesToStr(new Uint8Array(dec));
          results.push([k, printable, str]);
        }
        results.sort((a, b) => b[1] - a[1]);
        return h('table', { class: 'grid' },
          h('tr', null, ['키 (10진/hex)', '인쇄가능%', '복호 결과'].map((x) => h('th', null, x))),
          results.slice(0, 60).map(([k, p, str]) => h('tr', null,
            h('td', null, `${k} / 0x${k.toString(16).padStart(2, '0')}`),
            h('td', null, (p * 100).toFixed(0) + '%'),
            h('td', { class: 'mono' }, str))));
      },
    });
  },
});

/* ---------- ECDSA / Ed25519 ---------- */
const pemWrap = (label, bytes) =>
  `-----BEGIN ${label}-----\n${bytesToB64(bytes).replace(/.{64}/g, '$&\n').replace(/\n$/, '')}\n-----END ${label}-----`;
function pemUnwrap(text, label) {
  const block = text.match(new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`));
  if (!block) throw new Error(`"${label}" PEM 블록을 찾을 수 없습니다.`);
  return b64ToBytes(block[1]);
}
// Ed25519 키의 DER은 길이가 고정이라 앞부분을 상수로 붙였다 떼면 된다 (RFC 8410).
const ED_SPKI_PREFIX = hexToBytes('302a300506032b6570032100');
const ED_PKCS8_PREFIX = hexToBytes('302e020100300506032b657004220420');

const EC_CURVES = { 'P-256': 32, 'P-384': 48, 'P-521': 66 };

/* WebCrypto는 ECDSA 서명을 r‖s를 이어 붙인 raw(IEEE P1363) 형식으로 내놓는데,
   OpenSSL·JWT 밖의 대부분은 DER(SEQUENCE of INTEGER)을 쓴다. 둘 다 지원한다. */
function derFromRaw(raw) {
  const half = raw.length / 2;
  const toInteger = (bytes) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    let value = bytes.slice(start);
    if (value[0] & 0x80) value = concatBytes(new Uint8Array([0]), value); // 음수로 읽히지 않게 0을 덧댄다
    return concatBytes(new Uint8Array([0x02, value.length]), value);
  };
  const body = concatBytes(toInteger(raw.slice(0, half)), toInteger(raw.slice(half)));
  const header = body.length < 0x80 ? [0x30, body.length] : [0x30, 0x81, body.length];
  return concatBytes(new Uint8Array(header), body);
}
function rawFromDer(der, half) {
  if (der[0] !== 0x30) throw new Error('DER 서명(SEQUENCE)이 아닙니다.');
  let pos = der[1] & 0x80 ? 2 + (der[1] & 0x7f) : 2;
  const readInteger = () => {
    if (der[pos] !== 0x02) throw new Error('DER 서명의 INTEGER 태그를 찾을 수 없습니다.');
    let value = der.slice(pos + 2, pos + 2 + der[pos + 1]);
    pos += 2 + der[pos + 1];
    while (value.length > half && value[0] === 0) value = value.slice(1);
    if (value.length > half) throw new Error('DER 서명의 값이 곡선 크기보다 큽니다.');
    const padded = new Uint8Array(half);
    padded.set(value, half - value.length);
    return padded;
  };
  return concatBytes(readInteger(), readInteger());
}

async function ecKeyPair(curve) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: curve }, true, ['sign', 'verify']);
  return {
    privatePem: pemWrap('PRIVATE KEY', new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))),
    publicPem: pemWrap('PUBLIC KEY', new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))),
  };
}
async function edKeyPair() {
  await loadScript(LIB.tweetnacl);
  const pair = nacl.sign.keyPair();
  const seed = pair.secretKey.slice(0, 32); // tweetnacl의 secretKey는 seed(32) + 공개키(32)
  return {
    privatePem: pemWrap('PRIVATE KEY', concatBytes(ED_PKCS8_PREFIX, seed)),
    publicPem: pemWrap('PUBLIC KEY', concatBytes(ED_SPKI_PREFIX, pair.publicKey)),
    publicHex: bytesToHex(pair.publicKey),
  };
}

tool({
  id: 'ec-sign', cat: CAT, name: 'ECDSA / Ed25519 서명·검증',
  desc: '타원곡선 키를 만들고 메시지에 서명하거나 서명을 검증합니다. P-256/384/521과 Ed25519를 지원합니다.',
  keywords: 'ecdsa ed25519 elliptic curve sign verify keypair p256 p384 p521 eddsa 타원곡선 서명 검증',
  render(root) {
    const ALGS = [['P-256', 'ECDSA P-256'], ['P-384', 'ECDSA P-384'], ['P-521', 'ECDSA P-521'], ['Ed25519', 'Ed25519']];

    root.append(h('h3', null, '키 생성'));
    makeIO(root, {
      inputs: null,
      options: [{ id: 'alg', label: '알고리즘', type: 'select', values: ALGS }],
      actions: [{ id: 'gen', label: '키 페어 생성' }],
      outputHTML: true,
      async process(_, o) {
        const keys = o.alg === 'Ed25519' ? await edKeyPair() : await ecKeyPair(o.alg);
        return kvTable([
          ['알고리즘', o.alg],
          ['개인키 (PKCS#8 PEM)', keys.privatePem],
          ['공개키 (SPKI PEM)', keys.publicPem],
          ...(keys.publicHex ? [['공개키 (raw hex)', keys.publicHex]] : []),
        ]);
      },
      note: '키는 브라우저에서만 생성되며 어디로도 전송되지 않습니다.',
    });

    root.append(h('h3', { style: { marginTop: '30px' } }, '서명 / 검증'));
    makeIO(root, {
      inputs: [
        { id: 'message', label: '메시지', rows: 4, value: 'Hello, World!' },
        { id: 'key', label: '키 (서명: 개인키 PEM / 검증: 공개키 PEM)', rows: 5, placeholder: '-----BEGIN PRIVATE KEY-----' },
        { id: 'signature', label: '서명 (검증 시)', rows: 3, placeholder: 'Base64 또는 Hex' },
      ],
      options: [
        { id: 'alg', label: '알고리즘', type: 'select', values: ALGS },
        { id: 'hash', label: '해시 (ECDSA)', type: 'select', values: ['SHA-256', 'SHA-384', 'SHA-512'] },
        { id: 'sigfmt', label: '서명 형식', type: 'select', values: [['raw', 'raw (r‖s, P1363)'], ['der', 'DER (OpenSSL)']] },
        { id: 'ofmt', label: '출력 인코딩', type: 'select', values: [['base64', 'Base64'], ['hex', 'Hex']] },
      ],
      actions: [{ id: 'sign', label: '서명' }, { id: 'verify', label: '검증' }],
      autorun: false, outputRows: 4,
      async process(v, o, action) {
        const message = strToBytes(v.message);
        if (!v.key.trim()) throw new Error('키 PEM을 입력하세요.');

        if (o.alg === 'Ed25519') {
          await loadScript(LIB.tweetnacl);
          if (action === 'sign') {
            const pkcs8 = pemUnwrap(v.key, 'PRIVATE KEY');
            if (pkcs8.length !== ED_PKCS8_PREFIX.length + 32) throw new Error('Ed25519 개인키 PEM이 아닙니다.');
            const pair = nacl.sign.keyPair.fromSeed(pkcs8.slice(ED_PKCS8_PREFIX.length));
            return encodeOutput(nacl.sign.detached(message, pair.secretKey), o.ofmt);
          }
          const spki = pemUnwrap(v.key, 'PUBLIC KEY');
          if (spki.length !== ED_SPKI_PREFIX.length + 32) throw new Error('Ed25519 공개키 PEM이 아닙니다.');
          const signature = decodeInput(v.signature.trim(), o.ofmt);
          return nacl.sign.detached.verify(message, signature, spki.slice(ED_SPKI_PREFIX.length))
            ? '✔ 서명이 유효합니다.' : '✘ 서명이 올바르지 않습니다.';
        }

        const half = EC_CURVES[o.alg];
        const params = { name: 'ECDSA', hash: o.hash };
        if (action === 'sign') {
          const key = await crypto.subtle.importKey('pkcs8', pemUnwrap(v.key, 'PRIVATE KEY'),
            { name: 'ECDSA', namedCurve: o.alg }, false, ['sign']);
          const raw = new Uint8Array(await crypto.subtle.sign(params, key, message));
          return encodeOutput(o.sigfmt === 'der' ? derFromRaw(raw) : raw, o.ofmt);
        }
        if (!v.signature.trim()) throw new Error('검증할 서명을 입력하세요.');
        const key = await crypto.subtle.importKey('spki', pemUnwrap(v.key, 'PUBLIC KEY'),
          { name: 'ECDSA', namedCurve: o.alg }, false, ['verify']);
        const given = decodeInput(v.signature.trim(), o.ofmt);
        const raw = o.sigfmt === 'der' ? rawFromDer(given, half) : given;
        if (raw.length !== half * 2) throw new Error(`${o.alg} 서명은 ${half * 2}바이트여야 합니다 (현재 ${raw.length}바이트).`);
        return await crypto.subtle.verify(params, key, raw, message)
          ? '✔ 서명이 유효합니다.' : '✘ 서명이 올바르지 않습니다.';
      },
      note: 'Ed25519는 해시·서명 형식 옵션을 쓰지 않습니다(항상 64바이트 raw 서명). ECDSA는 같은 키로 서명해도 매번 값이 달라지는 것이 정상입니다.',
    });
  },
});

async function pbkdf2(password, salt, iterations, hash, length) {
  const key = await crypto.subtle.importKey('raw', strToBytes(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash }, key, length * 8);
  return new Uint8Array(bits);
}

tool({
  id: 'password-hash', cat: CAT, name: '비밀번호 해시 생성 / 검증',
  desc: 'Argon2, PBKDF2, bcrypt로 비밀번호 해시를 생성하고 검증합니다.',
  keywords: 'password hash pbkdf2 bcrypt argon2 argon2id salt verify 비밀번호 해시 검증',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'password', label: '비밀번호', rows: 2, value: 'correct horse battery staple' },
        { id: 'encoded', label: '검증할 해시 (검증 시)', rows: 3, placeholder: '$argon2id$v=19$... 또는 $pbkdf2-sha256$... 또는 $2b$...' },
      ],
      options: [
        { id: 'alg', label: '알고리즘', type: 'select', values: [['argon2id', 'Argon2id (권장)'], ['argon2i', 'Argon2i'], ['argon2d', 'Argon2d'], ['pbkdf2', 'PBKDF2-SHA-256'], ['bcrypt', 'bcrypt']] },
        { id: 'iterations', label: 'PBKDF2 반복 횟수', type: 'number', value: 310000, size: 100 },
        { id: 'bcryptCost', label: 'bcrypt Cost', type: 'number', value: 12, size: 70 },
        { id: 'argonMemory', label: 'Argon2 메모리(MiB)', type: 'number', value: 64, size: 80 },
        { id: 'argonTime', label: 'Argon2 반복', type: 'number', value: 3, size: 70 },
        { id: 'argonLanes', label: 'Argon2 병렬', type: 'number', value: 1, size: 70 },
      ],
      actions: [{ id: 'generate', label: '해시 생성' }, { id: 'verify', label: '검증' }],
      autorun: false, outputRows: 5,
      async process(v, o, action) {
        if (!v.password) throw new Error('비밀번호를 입력하세요.');
        if (o.alg.startsWith('argon2')) {
          requireFeature('wasm', typeof WebAssembly !== 'undefined');
          await loadScript(LIB.hashWasm);
          if (action === 'verify') {
            const hash = v.encoded.trim();
            if (!/^\$argon2(id|i|d)\$/.test(hash)) throw new Error('올바른 Argon2 해시를 입력하세요.');
            return await hashwasm.argon2Verify({ password: v.password, hash })
              ? '✔ 비밀번호가 일치합니다.' : '✘ 비밀번호가 일치하지 않습니다.';
          }
          const memory = Math.trunc(+o.argonMemory), time = Math.trunc(+o.argonTime), lanes = Math.trunc(+o.argonLanes);
          if (!(memory >= 1 && memory <= 1024)) throw new Error('Argon2 메모리는 1~1024 MiB로 입력하세요.');
          if (!(time >= 1 && time <= 20)) throw new Error('Argon2 반복은 1~20으로 입력하세요.');
          if (!(lanes >= 1 && lanes <= 16)) throw new Error('Argon2 병렬은 1~16으로 입력하세요.');
          return hashwasm[o.alg]({
            password: v.password,
            salt: crypto.getRandomValues(new Uint8Array(16)),
            memorySize: memory * 1024, // hash-wasm은 KiB 단위를 받는다
            iterations: time,
            parallelism: lanes,
            hashLength: 32,
            outputType: 'encoded',
          });
        }
        if (o.alg === 'bcrypt') {
          await loadScript(LIB.bcrypt);
          const bcrypt = dcodeIO.bcrypt;
          if (action === 'verify') {
            if (!/^\$2[aby]\$/.test(v.encoded.trim())) throw new Error('올바른 bcrypt 해시를 입력하세요.');
            return bcrypt.compareSync(v.password, v.encoded.trim()) ? '✔ 비밀번호가 일치합니다.' : '✘ 비밀번호가 일치하지 않습니다.';
          }
          const cost = Math.trunc(+o.bcryptCost);
          if (cost < 4 || cost > 15) throw new Error('bcrypt Cost는 4~15로 입력하세요.');
          return bcrypt.hashSync(v.password, bcrypt.genSaltSync(cost));
        }
        if (action === 'verify') {
          const m = v.encoded.trim().match(/^\$pbkdf2-sha256\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/);
          if (!m) throw new Error('올바른 PBKDF2 해시를 입력하세요.');
          const salt = b64ToBytes(m[2]);
          const actual = await pbkdf2(v.password, salt, +m[1], 'SHA-256', b64ToBytes(m[3]).length);
          const expected = b64ToBytes(m[3]);
          let diff = actual.length ^ expected.length;
          for (let i = 0; i < Math.min(actual.length, expected.length); i++) diff |= actual[i] ^ expected[i];
          return diff === 0 ? '✔ 비밀번호가 일치합니다.' : '✘ 비밀번호가 일치하지 않습니다.';
        }
        const iterations = Math.trunc(+o.iterations);
        if (iterations < 10000 || iterations > 5000000) throw new Error('PBKDF2 반복 횟수는 10,000~5,000,000으로 입력하세요.');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const hash = await pbkdf2(v.password, salt, iterations, 'SHA-256', 32);
        const b64url = (b) => bytesToB64(b).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        return `$pbkdf2-sha256$${iterations}$${b64url(salt)}$${b64url(hash)}`;
      },
      note: '비밀번호와 해시는 브라우저 밖으로 전송되지 않습니다. 새로 만드는 서비스라면 Argon2id를, bcrypt를 쓴다면 Cost 10~12를 권장합니다. 메모리를 크게 잡으면 계산에 몇 초가 걸릴 수 있습니다.',
    });
  },
});

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(text) {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error('올바른 Base32 시크릿을 입력하세요.');
  let bits = '';
  for (const c of clean) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  return Uint8Array.from(bits.match(/.{8}/g) || [], (x) => parseInt(x, 2));
}
function hotp(secret, counter, digits, algorithm) {
  const msg = new Uint8Array(8);
  let n = BigInt(counter);
  for (let i = 7; i >= 0; i--) { msg[i] = Number(n & 255n); n >>= 8n; }
  const words = CryptoJS.lib.WordArray.create(secret);
  const data = CryptoJS.lib.WordArray.create(msg);
  const mac = CryptoJS['Hmac' + algorithm](data, words).toString();
  const bytes = hexToBytes(mac), offset = bytes[bytes.length - 1] & 15;
  const bin = ((bytes[offset] & 127) << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  return String(bin % (10 ** digits)).padStart(digits, '0');
}

tool({
  id: 'otp', cat: CAT, name: 'TOTP / HOTP 생성·검증',
  desc: 'Base32 시크릿으로 일회용 인증 코드를 만들고 otpauth QR 코드를 생성합니다.',
  keywords: 'totp hotp otp authenticator 2fa mfa qr one time password',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'secret', label: 'Base32 시크릿', rows: 2, value: 'JBSWY3DPEHPK3PXP' },
        { id: 'code', label: '검증할 코드 (검증 시)', rows: 1, placeholder: '123456' },
      ],
      options: [
        { id: 'type', label: '방식', type: 'select', values: [['totp', 'TOTP (시간 기반)'], ['hotp', 'HOTP (카운터 기반)']] },
        { id: 'algorithm', label: '알고리즘', type: 'select', values: ['SHA1', 'SHA256', 'SHA512'] },
        { id: 'digits', label: '자릿수', type: 'select', values: [['6', '6자리'], ['8', '8자리']] },
        { id: 'period', label: '주기/카운터', type: 'number', value: 30, size: 90 },
        { id: 'account', label: '계정', type: 'text', value: 'user@example.com', size: 160 },
        { id: 'issuer', label: '발급자', type: 'text', value: 'W-Tools', size: 120 },
      ],
      actions: [{ id: 'generate', label: '코드 생성' }, { id: 'verify', label: '코드 검증' }, { id: 'uri', label: 'URI / QR 생성' }],
      autorun: false, outputHTML: true,
      async process(v, o, action) {
        const secret = base32Decode(v.secret);
        const digits = +o.digits;
        const amount = Math.trunc(+o.period);
        if (amount < 0 || (o.type === 'totp' && amount === 0)) throw new Error('TOTP 주기는 1 이상, HOTP 카운터는 0 이상이어야 합니다.');
        const counter = o.type === 'totp' ? Math.floor(Date.now() / 1000 / (amount || 30)) : amount;
        if (action === 'verify') {
          if (!/^\d+$/.test(v.code.trim())) throw new Error('검증할 숫자 코드를 입력하세요.');
          const window = o.type === 'totp' ? [-1, 0, 1] : [0];
          const ok = window.some((d) => hotp(secret, counter + d, digits, o.algorithm) === v.code.trim());
          return h('p', { style: { color: ok ? 'var(--ok)' : 'var(--danger)', fontWeight: '700' } }, ok ? '✔ 코드가 유효합니다.' : '✘ 코드가 올바르지 않습니다.');
        }
        const params = new URLSearchParams({ secret: v.secret.replace(/[\s=-]/g, '').toUpperCase(), issuer: o.issuer, algorithm: o.algorithm, digits: String(digits) });
        params.set(o.type === 'totp' ? 'period' : 'counter', String(amount || (o.type === 'totp' ? 30 : 0)));
        const label = encodeURIComponent(`${o.issuer}:${o.account}`);
        const uri = `otpauth://${o.type}/${label}?${params}`;
        if (action === 'uri') {
          const { encodeQr } = await loadQrModule();
          const qr = encodeQr(uri, { level: 'M' });
          return h('div', null,
            h('pre', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }, uri),
            qrCanvas(qr));
        }
        const code = hotp(secret, counter, digits, o.algorithm);
        return h('div', null, h('div', { style: { fontSize: '2rem', fontWeight: '700', letterSpacing: '.15em' } }, code),
          h('div', { class: 'note' }, o.type === 'totp' ? `${amount || 30}초 주기 · 현재 남은 시간 ${amount - (Math.floor(Date.now() / 1000) % amount)}초` : `카운터 ${amount}`));
      },
      note: '시크릿은 외부로 전송되지 않습니다. TOTP 검증은 시계 오차를 고려해 앞뒤 한 주기를 허용합니다.',
    });
  },
});

/* ---------- RSA / PGP (jsrsasign / openpgp) ---------- */
tool({
  id: 'rsa-keygen', cat: CAT, name: 'RSA 키페어 생성',
  desc: 'RSA 개인키/공개키 페어를 PEM 형식으로 생성합니다.',
  keywords: 'rsa key pair generate pem',
  render(root) {
    let priv = '', pub = '';
    const privTa = h('textarea', { class: 'mono', rows: 10, readonly: true });
    const pubTa = h('textarea', { class: 'mono', rows: 8, readonly: true });
    const sizeSel = h('select', null, [2048, 3072, 4096].map((s) => h('option', { value: s }, s + ' bit')));
    const status = h('div', { class: 'io-status', role: 'status', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn primary', type: 'button' }, '키 생성');
    const wrap = h('div', { class: 'io' },
      h('div', { class: 'opt-row' }, h('span', { class: 'opt-item' }, formLabel(sizeSel, '키 크기'), sizeSel), btn),
      h('p', { class: 'note' }, '새 키는 2048비트 이상만 생성합니다. 1024비트 키는 기존 자료 분석·복호화·검증 용도로만 다른 도구에서 읽을 수 있습니다.'),
      status,
      h('div', { style: { marginTop: '12px' } },
        h('div', { class: 'out-head' }, formLabel(privTa, '개인키 (PKCS#8 PEM)', { class: 'io-label' }), copyBtn(() => privTa.value)), privTa,
        h('div', { class: 'out-head' }, formLabel(pubTa, '공개키 (SPKI PEM)', { class: 'io-label' }), copyBtn(() => pubTa.value)), pubTa));
    const runner = createAsyncRunner(wrap, {
      controls: () => [sizeSel, btn], status, cancelable: false,
      runningMessage: '생성 중… (몇 초 소요될 수 있습니다)',
    });
    btn.addEventListener('click', () => runner.run(async (task) => {
        await loadScript(LIB.jsrsasign);
        await new Promise((r) => setTimeout(r, 30));
        const kp = KEYUTIL.generateKeypair('RSA', +sizeSel.value);
        if (!task.active()) return;
        priv = KEYUTIL.getPEM(kp.prvKeyObj, 'PKCS8PRV');
        pub = KEYUTIL.getPEM(kp.pubKeyObj);
        privTa.value = priv;
        pubTa.value = pub;
    }));
    root.append(wrap);
  },
});

// PEM(SPKI 공개키 / PKCS#8 개인키) → WebCrypto RSA-OAEP 키
async function importRsaOaepKey(pem, format, usage) {
  requireFeature('webcrypto', !!globalThis.crypto?.subtle);
  const type = format === 'spki' ? 'PUBLIC KEY' : 'PRIVATE KEY';
  const m = pem.match(new RegExp(`-----BEGIN ${type}-----([\\s\\S]+?)-----END ${type}-----`));
  if (!m) throw new Error(`${format === 'spki' ? '공개키(SPKI)' : '개인키(PKCS#8)'} PEM을 입력하세요. (-----BEGIN ${type}----- 블록)`);
  try {
    return await crypto.subtle.importKey(format, b64ToBytes(m[1].replace(/\s/g, '')),
      { name: 'RSA-OAEP', hash: 'SHA-256' }, false, [usage]);
  } catch {
    throw new Error('키를 불러오지 못했습니다. PEM 형식과 키 종류를 확인하세요.');
  }
}

tool({
  id: 'rsa-crypt', cat: CAT, name: 'RSA 암호화/복호화·서명/검증',
  desc: 'RSA 공개키로 암호화(OAEP), 개인키로 복호화하거나 서명/검증합니다.',
  keywords: 'rsa oaep encrypt decrypt sign verify',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'text', label: '입력', rows: 4, value: 'RSA 테스트 메시지' },
        { id: 'key', label: '키 (PEM: 암호화·검증=공개키 / 복호화·서명=개인키)', rows: 8, placeholder: '-----BEGIN PUBLIC KEY-----' },
      ],
      options: [{ id: 'hash', label: '서명 해시', type: 'select', values: [['SHA256', 'SHA-256'], ['SHA384', 'SHA-384'], ['SHA512', 'SHA-512'], ['SHA1', 'SHA-1 (검증 호환 전용)']] }],
      actions: [{ id: 'enc', label: '암호화' }, { id: 'dec', label: '복호화' }, { id: 'sign', label: '서명' }, { id: 'verify', label: '검증' }],
      autorun: false, outputRows: 6,
      async process(v, o, action) {
        const key = v.key.trim();
        if (!key) throw new Error('PEM 키를 입력하세요.');
        // 암호화/복호화는 WebCrypto RSA-OAEP(SHA-256) 사용
        if (action === 'enc') {
          const pub = await importRsaOaepKey(key, 'spki', 'encrypt');
          const buf = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, strToBytes(v.text));
          return bytesToB64(new Uint8Array(buf));
        }
        if (action === 'dec') {
          const prv = await importRsaOaepKey(key, 'pkcs8', 'decrypt');
          try {
            const buf = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, prv, b64ToBytes(v.text.trim()));
            return bytesToStr(new Uint8Array(buf));
          } catch {
            throw new Error('복호화 실패 (키/암호문 형식을 확인하세요).');
          }
        }
        await loadScript(LIB.jsrsasign);
        if (action === 'sign') {
          if (o.hash === 'SHA1') throw new Error('SHA-1 서명 생성은 차단됩니다. 기존 SHA-1 서명 검증만 지원합니다.');
          const sig = new KJUR.crypto.Signature({ alg: o.hash + 'withRSA' });
          sig.init(key);
          sig.updateString(v.text);
          return hextob64(sig.sign());
        }
        if (action === 'verify') {
          // 입력: "메시지\n---SIGNATURE---\n<base64서명>" 또는 서명만 별도
          const parts = v.text.split(/\n-{3,}SIG(?:NATURE)?-{3,}\n/i);
          if (parts.length !== 2) throw new Error('검증하려면 입력을 "원문\\n---SIGNATURE---\\nBase64서명" 형식으로 넣으세요.');
          const sig = new KJUR.crypto.Signature({ alg: o.hash + 'withRSA' });
          sig.init(key);
          sig.updateString(parts[0]);
          return sig.verify(b64tohex(parts[1].trim())) ? '✔ 서명이 유효합니다.' : '✘ 서명이 올바르지 않습니다.';
        }
      },
      note: '암호화는 RSA-OAEP(SHA-256), 서명은 PKCS#1 v1.5입니다. 검증 시 입력 형식: 원문 다음 줄에 "---SIGNATURE---", 그 다음 줄에 Base64 서명.',
    });
  },
});

/* ---------- PGP (OpenPGP.js) ---------- */
async function pgp() {
  return loadModule(vendorUrl('openpgp'));
}

tool({
  id: 'pgp-keygen', cat: CAT, name: 'PGP 키 생성',
  desc: '이름·이메일로 PGP 키페어를 생성합니다.',
  keywords: 'pgp gpg key generate',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '이름 <이메일>', rows: 1, value: '홍길동 <hong@example.com>' }],
      options: [
        { id: 'type', label: '알고리즘', type: 'select', values: [['ecc', 'ECC (Curve25519)'], ['rsa', 'RSA 4096']] },
        { id: 'pass', label: '패스프레이즈(선택)', type: 'password', size: 140 },
      ],
      actions: [{ id: 'gen', label: '키 생성' }],
      autorun: false, outputRows: 14,
      async process(text, o) {
        const m = text.match(/^(.*?)\s*<([^>]+)>/);
        const openpgp = await pgp();
        const { privateKey, publicKey } = await openpgp.generateKey({
          type: o.type === 'rsa' ? 'rsa' : 'ecc',
          curve: 'curve25519', rsaBits: 4096,
          userIDs: [{ name: (m ? m[1] : text).trim(), email: m ? m[2] : '' }],
          passphrase: o.pass || undefined,
        });
        return publicKey + '\n' + privateKey;
      },
    });
  },
});

tool({
  id: 'pgp-crypt', cat: CAT, name: 'PGP 암호화/복호화',
  desc: '공개키로 메시지를 암호화하거나 개인키로 복호화합니다.',
  keywords: 'pgp gpg encrypt decrypt',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'text', label: '메시지 / 암호문', rows: 6, value: '비밀 메시지' },
        { id: 'key', label: '키 (암호화=공개키 / 복호화=개인키)', rows: 8, placeholder: '-----BEGIN PGP PUBLIC KEY BLOCK-----' },
      ],
      options: [{ id: 'pass', label: '개인키 패스프레이즈', type: 'password', size: 140 }],
      actions: [{ id: 'enc', label: '암호화' }, { id: 'dec', label: '복호화' }],
      autorun: false, outputRows: 10,
      async process(v, o, action) {
        const openpgp = await pgp();
        if (action === 'enc') {
          const publicKey = await openpgp.readKey({ armoredKey: v.key });
          return openpgp.encrypt({ message: await openpgp.createMessage({ text: v.text }), encryptionKeys: publicKey });
        }
        let privateKey = await openpgp.readPrivateKey({ armoredKey: v.key });
        if (!privateKey.isDecrypted()) privateKey = await openpgp.decryptKey({ privateKey, passphrase: o.pass });
        const message = await openpgp.readMessage({ armoredMessage: v.text });
        const { data } = await openpgp.decrypt({ message, decryptionKeys: privateKey });
        return data;
      },
    });
  },
});

const TOKEN_GROUPS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digit: '0123456789',
  symbol: '!@#$%^&*()-_=+[]{}|;:,.<>?',
};
const TOKEN_CHARSETS = {
  alnum: TOKEN_GROUPS.upper + TOKEN_GROUPS.lower + TOKEN_GROUPS.digit,
  alpha: TOKEN_GROUPS.upper + TOKEN_GROUPS.lower,
  num: TOKEN_GROUPS.digit,
  hex: '0123456789abcdef',
  base64: TOKEN_GROUPS.upper + TOKEN_GROUPS.lower + TOKEN_GROUPS.digit + '-_',
  ascii: TOKEN_GROUPS.upper + TOKEN_GROUPS.lower + TOKEN_GROUPS.digit + TOKEN_GROUPS.symbol,
};
const AMBIGUOUS_CHARS = new Set(['0', 'O', '1', 'I', 'l', '|']);
const EFF_WORDLIST_URL = new URL('../../assets/eff-short-wordlist-1.txt', import.meta.url);
let effWordsPromise;

function uniqueChars(text, excludeAmbiguous = false) {
  return [...new Set([...String(text)].filter((char) => !excludeAmbiguous || !AMBIGUOUS_CHARS.has(char)))];
}

// 거절 샘플링: 2^32를 선택지 수로 나눈 나머지 구간을 버려 modulo bias를 제거한다.
function randomIndex(size) {
  const limit = Math.floor(0x100000000 / size) * size;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return value[0] % size;
}
function randomString(len, chars) {
  const pool = Array.isArray(chars) ? chars : uniqueChars(chars);
  if (!len) return '';
  if (!pool.length) throw new Error('사용할 문자가 없습니다.');
  const limit = Math.floor(0x100000000 / pool.length) * pool.length;
  const out = [];
  while (out.length < len) {
    const batch = crypto.getRandomValues(new Uint32Array(len - out.length));
    for (const value of batch) {
      if (value < limit) out.push(pool[value % pool.length]);
    }
  }
  return out.join('');
}
function secureShuffle(values) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
function boundedInteger(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max)
    throw new Error(`${label}은(는) ${min}~${max}의 정수로 입력하세요.`);
  return number;
}
async function effWords() {
  if (!effWordsPromise) {
    effWordsPromise = fetch(EFF_WORDLIST_URL, { cache: 'force-cache' }).then(async (response) => {
      if (!response.ok) throw new Error(`내장 단어 목록을 불러오지 못했습니다. (HTTP ${response.status})`);
      const words = (await response.text()).trim().split(/\n/).map((line) => line.trim().replace(/^\d+\s+/, ''));
      if (words.length !== 1296 || new Set(words).size !== 1296 || words.some((word) => !/^[a-z-]+$/.test(word)))
        throw new Error('내장 EFF 단어 목록의 형식이 올바르지 않습니다.');
      return words;
    });
  }
  return effWordsPromise;
}
function entropyAdvice(bits) {
  if (bits < 40) return '운영 비밀에는 너무 짧습니다. 길이나 단어 수를 늘리세요.';
  if (bits < 60) return '온라인 로그인용 무작위 비밀번호에는 쓸 수 있지만, 장기 보관하거나 오프라인 공격을 받는 비밀에는 더 길게 설정하세요.';
  if (bits < 80) return '서비스마다 다르게 쓰는 무작위 로그인 비밀번호로 강한 편입니다. 마스터 패스프레이즈나 고가치 비밀은 80비트 이상을 권장합니다.';
  if (bits < 128) return '고가치 계정의 패스프레이즈나 API 토큰으로 강한 편입니다. 결과를 재사용하지 말고 안전한 저장소에 보관하세요.';
  return '128비트 이상의 선택 공간입니다. API 키·랜덤 시크릿에 충분한 수준이지만, 형식이 정해진 암호화 키는 전용 키 생성기를 사용하세요.';
}

tool({
  id: 'token-gen', cat: CAT, name: '토큰 / 시크릿 생성기',
  desc: '암호학적으로 안전한 랜덤 토큰을 생성합니다.',
  keywords: 'token secret random password generate api key passphrase diceware entropy 패스프레이즈 엔트로피',
  render(root) {
    const entropyInfo = h('div', { class: 'note token-entropy', role: 'status', 'aria-live': 'polite' });
    const io = makeIO(root, {
      inputs: null,
      options: [
        { id: 'mode', label: '생성 방식', type: 'select', values: [['token', '문자 토큰'], ['passphrase', '단어 패스프레이즈']] },
        { id: 'len', label: '길이', type: 'number', value: 32, size: 80 },
        { id: 'charset', label: '문자 집합', type: 'select', values: [['alnum', '영문+숫자'], ['hex', 'Hex'], ['base64', 'Base64URL'], ['alpha', '영문만'], ['num', '숫자만'], ['ascii', '전체 ASCII 기호 포함'], ['custom', '커스텀']] },
        { id: 'custom', label: '커스텀 문자', type: 'text', size: 180, placeholder: 'ABCdef123!@#' },
        { id: 'avoidAmbiguous', label: '혼동 문자(0/O/1/I/l/|) 제외', type: 'checkbox' },
        { id: 'minUpper', label: '대문자 최소', type: 'number', value: 0, size: 65 },
        { id: 'minLower', label: '소문자 최소', type: 'number', value: 0, size: 65 },
        { id: 'minDigit', label: '숫자 최소', type: 'number', value: 0, size: 65 },
        { id: 'minSymbol', label: '기호 최소', type: 'number', value: 0, size: 65 },
        { id: 'wordCount', label: '단어 수', type: 'number', value: 8, size: 70 },
        { id: 'separator', label: '단어 구분', type: 'select', values: [['-', '하이픈 (-)'], [' ', '공백'], ['.', '점 (.)'], ['_', '밑줄 (_)'], [':', '콜론 (:)']] },
        { id: 'count', label: '개수', type: 'number', value: 5, size: 70 },
      ],
      actions: [{ id: 'gen', label: '생성' }],
      outputRows: 8,
      autorun: false,
      async process(_, o) {
        const count = boundedInteger(o.count, '개수', 1, 100);
        const out = [];
        let entropy;
        let conservative = false;
        if (o.mode === 'passphrase') {
          const wordCount = boundedInteger(o.wordCount, '단어 수', 1, 64);
          const words = await effWords();
          entropy = wordCount * Math.log2(words.length);
          for (let n = 0; n < count; n++) {
            out.push(Array.from({ length: wordCount }, () => words[randomIndex(words.length)]).join(o.separator));
          }
        } else {
          const len = boundedInteger(o.len, '길이', 1, 4096);
          const source = o.charset === 'custom' ? o.custom : TOKEN_CHARSETS[o.charset];
          if (!source) throw new Error('커스텀 문자를 입력하세요.');
          const chars = uniqueChars(source, o.avoidAmbiguous);
          if (!chars.length) throw new Error('혼동 문자를 제외하고 남은 문자가 없습니다.');
          const minimums = {
            upper: boundedInteger(o.minUpper, '대문자 최소 개수', 0, 4096),
            lower: boundedInteger(o.minLower, '소문자 최소 개수', 0, 4096),
            digit: boundedInteger(o.minDigit, '숫자 최소 개수', 0, 4096),
            symbol: boundedInteger(o.minSymbol, '기호 최소 개수', 0, 4096),
          };
          const required = Object.values(minimums).reduce((sum, value) => sum + value, 0);
          if (required > len) throw new Error(`문자 종류별 최소 개수 합(${required})이 전체 길이(${len})보다 큽니다.`);
          const available = {};
          for (const [group, minimum] of Object.entries(minimums)) {
            available[group] = chars.filter((char) => TOKEN_GROUPS[group].includes(char));
            if (minimum && !available[group].length)
              throw new Error(`선택한 문자 집합에는 ${group === 'upper' ? '대문자' : group === 'lower' ? '소문자' : group === 'digit' ? '숫자' : '기호'}가 없습니다.`);
          }
          entropy = (len - required) * Math.log2(chars.length);
          for (const [group, minimum] of Object.entries(minimums)) {
            entropy += minimum * Math.log2(available[group].length || 1);
          }
          conservative = required > 0;
          for (let n = 0; n < count; n++) {
            const token = [];
            for (const [group, minimum] of Object.entries(minimums))
              token.push(...randomString(minimum, available[group] || chars));
            token.push(...randomString(len - required, chars));
            out.push(secureShuffle(token).join(''));
          }
        }
        const shown = entropy >= 1000 ? Math.round(entropy).toLocaleString() : entropy.toFixed(1);
        entropyInfo.replaceChildren(
          h('strong', null, `각 결과의 추정 엔트로피: ${shown}비트${conservative ? ' 이상(보수적 하한)' : ''}`),
          h('div', null, entropyAdvice(entropy)),
          h('div', null, '무작위 생성 과정의 선택 공간 추정치이며, 서비스의 저장·해시 방식이나 비밀 유출·재사용 위험은 반영하지 않습니다.'),
        );
        return out.join('\n');
      },
      note: h('span', null,
        '모든 결과는 crypto.getRandomValues와 편향 없는 거절 샘플링으로 브라우저 안에서 생성됩니다. 패스프레이즈는 ',
        h('a', { href: 'https://www.eff.org/files/2016/09/08/eff_short_wordlist_1.txt', target: '_blank', rel: 'noopener noreferrer' }, 'EFF 짧은 단어 목록 1'),
        '(1,296개, ',
        h('a', { href: 'https://creativecommons.org/licenses/by/4.0/', target: '_blank', rel: 'noopener noreferrer' }, 'CC BY 4.0'),
        ')을 사용합니다.'),
    });
    root.append(entropyInfo);
    const tokenOnly = ['len', 'charset', 'custom', 'avoidAmbiguous', 'minUpper', 'minLower', 'minDigit', 'minSymbol'];
    const phraseOnly = ['wordCount', 'separator'];
    const setOptionVisible = (id, visible) => io.optEls[id].closest('.opt-item').classList.toggle('hidden', !visible);
    const syncOptions = () => {
      const phrase = io.optEls.mode.value === 'passphrase';
      for (const id of tokenOnly) setOptionVisible(id, !phrase && (id !== 'custom' || io.optEls.charset.value === 'custom'));
      for (const id of phraseOnly) setOptionVisible(id, phrase);
    };
    io.optEls.mode.addEventListener('change', syncOptions);
    io.optEls.charset.addEventListener('change', syncOptions);
    syncOptions();
    io.run();
  },
});
