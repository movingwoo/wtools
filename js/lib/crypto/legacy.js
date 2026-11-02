import { bytesToB64, b64ToBytes } from '../common/base64.js';
import { cipher } from './cipher.js';
import { openssl } from './openssl.js';
import { hex, unhex, limit, MAX_KEY_BYTES, MAX_CRYPTO_BYTES } from './bytes.js';

// Match the old WordArray key interpretation, including partial final words.
export function legacyKey(algorithm, input) {
  limit(input, MAX_KEY_BYTES);
  if (!input.length) throw new Error('키를 입력하세요.');
  const words = Math.ceil(input.length / 4);
  let length;
  if (algorithm === 'DES') length = 8;
  else if (algorithm === 'TripleDES') {
    if (words !== 2 && words !== 4 && words < 6) throw new Error('3DES 직접 키는 2, 4 또는 6개 이상의 4바이트 워드가 필요합니다.');
    length = Math.min(words * 4, 24);
  } else if (algorithm === 'Blowfish') length = Math.min(words * 4, 72);
  else throw new Error('지원하지 않는 레거시 암호입니다.');
  const key = new Uint8Array(length);
  key.set(input.subarray(0, length));
  return key;
}

export async function processLegacy(algorithm, values, options, action) {
  const decrypt = action === 'dec';
  const encoder = new TextEncoder();
  const input = decrypt ? options.ofmt === 'hex' ? unhex(values.text.trim()) : b64ToBytes(values.text.trim()) : encoder.encode(values.text);
  limit(input, MAX_CRYPTO_BYTES + (decrypt ? 32 : 0));
  const password = encoder.encode(values.key);
  let key, result;
  try {
    limit(password, MAX_KEY_BYTES);
    if (options.kdf === 'passphrase') {
      result = await openssl({ algorithm, mode: options.mode, data: input, password, decrypt });
    } else {
      const raw = /^[0-9a-f]+$/i.test(values.key.trim()) && values.key.trim().length % 2 === 0 ? unhex(values.key.trim()) : password;
      try { key = legacyKey(algorithm, raw); } finally { if (raw !== password) raw.fill(0); }
      result = await cipher({ algorithm, mode: options.mode, data: input, key, iv: new Uint8Array(options.mode === 'ECB' ? 0 : 8), decrypt, legacy: true });
    }
    if (decrypt) {
      try { return new TextDecoder('utf-8', { fatal: true }).decode(result); }
      catch { throw new Error('복호화 실패: 키, 모드와 암호문 형식을 확인하세요.'); }
    }
    return options.ofmt === 'hex' ? hex(result) : bytesToB64(result);
  } finally { input.fill(0); password.fill(0); key?.fill(0); result?.fill(0); }
}
