// W-Tools v1 AES JSON envelope and OpenSSL legacy adapter. Browser/Worker shared.
import { cipher } from './cipher.js';
import { openssl } from './openssl.js';
import { bytesToB64, b64ToBytes } from '../common/base64.js';
import { limit, MAX_KEY_BYTES, random, hex as bytesToHex, unhex } from './bytes.js';
const strToBytes = (text) => new TextEncoder().encode(text);
const bytesToStr = (data) => new TextDecoder('utf-8', { fatal: true }).decode(data);
// Preserve core.hexToBytes input notation for AES keys, IVs and ciphertext.
const hexToBytes = (text) => unhex(text.replace(/[\s:,-]|0x/gi, ''));
const decodeInput = (text, format) => format === 'hex' ? hexToBytes(text) : format === 'base64' ? b64ToBytes(text) : strToBytes(text);
const encodeOutput = (data, format) => format === 'hex' ? bytesToHex(data) : bytesToB64(data);

const AES_PBKDF2_ITERATIONS = 600_000;
const AES_KEY_SIZES = new Set([128, 192, 256]);
const AES_MODES = new Set(['GCM', 'CBC', 'CFB', 'CTR', 'OFB', 'ECB']);

const randomBytes = random;

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
  const secret = strToBytes(password);
  limit(secret, MAX_KEY_BYTES);
  let base;
  try { base = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']); }
  finally { secret.fill(0); }
  const derived = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt, iterations,
  }, base, bits);
  return new Uint8Array(derived);
}

async function legacyAes(data, key, iv, mode, decrypt = false) {
  const input = decrypt ? data : strToBytes(data);
  let output;
  try {
    output = await cipher({ mode, data: input, key, iv, decrypt });
    return decrypt ? new TextDecoder('utf-8', { fatal: true }).decode(output) : output;
  } catch (cause) {
    throw new Error('복호화 또는 암호화에 실패했습니다. 키, IV, 모드와 암호문을 확인하세요.', { cause });
  } finally {
    if (!decrypt) input.fill(0);
    if (decrypt) output?.fill(0);
  }
}

async function aesGcmEncrypt(text, keyBytes, iv) {
  if (keyBytes.length === 24)
    throw new Error('AES-GCM 192비트 키는 지원 브라우저 간 호환성이 없습니다. GCM은 128 또는 256비트를 사용하세요.');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const input = strToBytes(text);
  try {
    const result = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, input);
    return new Uint8Array(result); // WebCrypto returns ciphertext followed by the tag.
  } finally { input.fill(0); }
}

async function aesGcmDecrypt(ciphertext, keyBytes, iv) {
  if (keyBytes.length === 24)
    throw new Error('AES-GCM 192비트 키는 지원 브라우저 간 호환성이 없습니다. GCM은 128 또는 256비트를 사용하세요.');
  if (ciphertext.length < 16) throw new Error('AES-GCM 암호문에는 16바이트 인증 태그가 필요합니다.');
  try {
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    const result = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ciphertext));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(result); }
    finally { result.fill(0); }
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
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('지원하지 않는 W-Tools AES 자체 포함 형식입니다.');
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

async function openSslAes(text, password, keyBits, mode, format, decrypt) {
  if (!password) throw new Error('비밀번호를 입력하세요.');
  const input = decrypt ? decodeInput(text.trim(), format) : strToBytes(text);
  const secret = strToBytes(password);
  let result;
  try {
    result = await openssl({ data: input, password: secret, keyBits, mode, decrypt });
    return decrypt ? new TextDecoder('utf-8', { fatal: true }).decode(result) : encodeOutput(result, format);
  } catch (cause) {
    throw new Error('OpenSSL AES 처리 실패: 비밀번호, 키 크기, 모드와 Salted__ 암호문을 확인하세요.', { cause });
  } finally { input.fill(0); secret.fill(0); result?.fill(0); }
}

export async function processAes(v, o, action) {
  const decrypt = action === 'dec', selectedMode = o.mode, selectedBits = +o.keySize;
  if (!AES_MODES.has(selectedMode)) throw new Error('지원하지 않는 AES 모드입니다.');
  if (!AES_KEY_SIZES.has(selectedBits)) throw new Error('AES 키 크기는 128, 192, 256비트 중 하나여야 합니다.');
  if ((selectedMode === 'GCM' || o.keyMode === 'passphrase') && !globalThis.crypto?.subtle)
    throw new Error('이 AES 방식은 WebCrypto가 필요합니다. HTTPS 또는 localhost에서 실행하세요.');
  if (!decrypt && selectedMode === 'ECB' && !o.legacyConfirm)
    throw new Error('ECB 새 암호화는 패턴을 노출합니다. 호환 목적이라면 “취약한 ECB 새 암호화 허용”을 먼저 선택하세요.');
  const sizeCheck = strToBytes(v.text);
  try { limit(sizeCheck, decrypt ? 48 * 1024 * 1024 : undefined); }
  finally { sizeCheck.fill(0); }
  if (o.keyMode === 'openssl') {
    if (selectedMode === 'GCM') throw new Error('OpenSSL 레거시 키 유도는 GCM에서 지원하지 않습니다. PBKDF2 또는 직접 키를 사용하세요.');
    if (o.bundle !== 'package') throw new Error('OpenSSL 레거시 방식은 salt를 보존하도록 자체 포함 결과를 사용하세요.');
    if (v.iv.trim()) throw new Error('OpenSSL 레거시 방식은 salt에서 IV를 유도합니다. IV 입력을 비워 주세요.');
    return openSslAes(v.text, v.key, selectedBits, selectedMode, o.ofmt, decrypt);
  }
  let key, ciphertext;
  try {
    if (decrypt && o.bundle === 'package') {
      const env = decodeAesEnvelope(v.text, o.ofmt);
      ciphertext = env.ciphertext;
      limit(ciphertext, 16 * 1024 * 1024 + 16);
      key = env.kdf === 'PBKDF2-SHA256'
        ? await pbkdf2AesKey(v.key, env.salt, env.keyBits, env.iterations)
        : parseAesKey(v.key, o.keyFormat, env.keyBits);
      return env.mode === 'GCM'
        ? await aesGcmDecrypt(ciphertext, key, env.iv)
        : await legacyAes(ciphertext, key, env.iv, env.mode, true);
    }
    if (o.bundle === 'raw' && o.keyMode !== 'raw')
      throw new Error('암호문만 출력·복호화하려면 salt가 필요 없는 직접 키 방식을 선택하세요.');
    const salt = o.keyMode === 'passphrase' ? randomBytes(16) : new Uint8Array();
    key = o.keyMode === 'passphrase'
      ? await pbkdf2AesKey(v.key, salt, selectedBits, AES_PBKDF2_ITERATIONS)
      : parseAesKey(v.key, o.keyFormat, selectedBits);
    const iv = parseAesIv(v.iv, selectedMode, o.bundle === 'raw');
    if (decrypt) {
      ciphertext = decodeInput(v.text.trim(), o.ofmt);
      limit(ciphertext, 16 * 1024 * 1024 + 16);
      return selectedMode === 'GCM' ? await aesGcmDecrypt(ciphertext, key, iv) : await legacyAes(ciphertext, key, iv, selectedMode, true);
    }
    ciphertext = selectedMode === 'GCM' ? await aesGcmEncrypt(v.text, key, iv) : await legacyAes(v.text, key, iv, selectedMode);
    if (o.bundle === 'raw') return encodeOutput(ciphertext, o.ofmt);
    return encodeAesEnvelope({
      v: 1, alg: `AES-${selectedMode}`, keyBits: selectedBits,
      kdf: o.keyMode === 'passphrase' ? 'PBKDF2-SHA256' : 'raw',
      ...(o.keyMode === 'passphrase' ? { iterations: AES_PBKDF2_ITERATIONS, salt: bytesToB64(salt) } : {}),
      iv: bytesToB64(iv), ciphertext: bytesToB64(ciphertext),
    }, o.ofmt);
  } finally { key?.fill(0); ciphertext?.fill(0); }
}
