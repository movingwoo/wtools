// OpenSSL's legacy EVP_BytesToKey(MD5, 1) and Salted__ envelope.
import { createHash } from './hash.js';
import { cipher } from './cipher.js';
import { concat, equal, limit, MAX_KEY_BYTES, MAX_CRYPTO_BYTES, random } from './bytes.js';

const HEADER = new TextEncoder().encode('Salted__');

export async function evpBytesToKey(password, salt, keyLength, ivLength) {
  limit(password, MAX_KEY_BYTES);
  if (salt.length !== 8 || ![8, 16, 24, 32].includes(keyLength) || ![8, 16].includes(ivLength))
    throw new Error('OpenSSL 키 유도 설정이 올바르지 않습니다.');
  const material = new Uint8Array(Math.ceil((keyLength + ivLength) / 16) * 16);
  let previous = new Uint8Array();
  try {
    for (let offset = 0; offset < material.length; offset += 16) {
      const hash = await createHash('MD5');
      try {
        hash.update(previous).update(password).update(salt);
        previous.fill(0);
        previous = hash.digest();
        material.set(previous, offset);
      } finally { hash.destroy?.(); }
    }
    return { key: material.slice(0, keyLength), iv: material.slice(keyLength, keyLength + ivLength) };
  } finally { previous.fill(0); material.fill(0); }
}

export async function openssl({ algorithm = 'AES', keyBits = 256, mode = 'CBC', data, password, decrypt = false, salt = null, native = true }) {
  limit(data, MAX_CRYPTO_BYTES + (decrypt ? 32 : 0)); limit(password, MAX_KEY_BYTES);
  if (!password.length) throw new Error('비밀번호를 입력하세요.');
  const blockSize = algorithm === 'AES' ? 16 : 8;
  const keyLength = algorithm === 'AES' ? keyBits / 8 : algorithm === 'DES' ? 8 : algorithm === 'TripleDES' ? 24 : 16;
  if (decrypt) {
    if (data.length < 16 || !equal(data.subarray(0, 8), HEADER))
      throw new Error('OpenSSL Salted__ 형식의 암호문이 아닙니다. salt가 없는 이전 Hex 출력은 복원할 수 없습니다.');
    salt = data.subarray(8, 16);
    data = data.subarray(16);
  } else salt ??= random(8);
  const derived = await evpBytesToKey(password, salt, keyLength, blockSize);
  try {
    const result = await cipher({ algorithm, mode, data, key: derived.key, iv: mode === 'ECB' ? new Uint8Array() : derived.iv, decrypt, native });
    if (decrypt) return result;
    const envelope = concat(HEADER, salt, result);
    result.fill(0);
    return envelope;
  } finally { derived.key.fill(0); derived.iv.fill(0); }
}
