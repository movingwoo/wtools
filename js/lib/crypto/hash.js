import { limit, MAX_KEY_BYTES } from './bytes.js';

const modules = new Map();
function load(path) {
  if (!modules.has(path)) modules.set(path, import(path).catch((cause) => {
    modules.delete(path);
    throw new Error('해시 구현을 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.', { cause });
  }));
  return modules.get(path);
}

export const HASH_NAMES = ['MD2', 'MD4', 'MD5', 'SHA0', 'SHA1', 'SHA224', 'SHA256', 'SHA384', 'SHA512', 'SHA3-224', 'SHA3-256', 'SHA3-384', 'SHA3-512', 'Keccak-256', 'RIPEMD160'];
const NATIVE = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512' };

export async function createHash(name) {
  if (!HASH_NAMES.includes(name)) throw new Error('지원하지 않는 해시 알고리즘입니다.');
  if (name === 'MD4') return (await load('./md4.js')).createMd4();
  if (name === 'MD2') return (await load('./md2.js')).createMd2();
  if (name.startsWith('SHA3-') || name === 'Keccak-256')
    return (await load('./keccak.js')).createKeccak(name === 'Keccak-256' ? 256 : +name.slice(5), name === 'Keccak-256' ? 1 : 6);
  if (name === 'SHA384' || name === 'SHA512') return (await load('./hash64.js')).createSha512(+name.slice(3));
  return (await load('./hash32.js')).createHash32(name);
}

export async function digest(name, input, { native = true } = {}) {
  limit(input);
  if (native && NATIVE[name] && globalThis.crypto?.subtle) {
    try { return new Uint8Array(await globalThis.crypto.subtle.digest(NATIVE[name], input)); }
    catch (error) { if (error.name !== 'NotSupportedError') throw error; }
  }
  const hash = await createHash(name);
  try { return hash.update(input).digest(); }
  finally { hash.destroy?.(); }
}

export async function hmac(name, input, key, { native = true } = {}) {
  limit(input); limit(key, MAX_KEY_BYTES);
  if (!HASH_NAMES.includes(name)) throw new Error('지원하지 않는 HMAC 알고리즘입니다.');
  if (native && NATIVE[name] && key.length && globalThis.crypto?.subtle) {
    try {
      const imported = await globalThis.crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: NATIVE[name] }, false, ['sign']);
      return new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', imported, input));
    } catch (error) { if (error.name !== 'NotSupportedError') throw error; }
  }
  const blockSize = name.startsWith('SHA3-') ? (1600 - +name.slice(5) * 2) / 8
    : name === 'Keccak-256' ? 136 : name === 'SHA384' || name === 'SHA512' ? 128 : name === 'MD2' ? 16 : 64;
  const normalized = key.length > blockSize ? await digest(name, key, { native }) : new Uint8Array(key);
  const pad = new Uint8Array(blockSize).fill(0x36);
  for (let i = 0; i < normalized.length; i++) pad[i] ^= normalized[i];
  let inner, outer, intermediate;
  try {
    inner = await createHash(name);
    intermediate = inner.update(pad).update(input).digest();
    for (let i = 0; i < blockSize; i++) pad[i] ^= 0x36 ^ 0x5c;
    outer = await createHash(name);
    return outer.update(pad).update(intermediate).digest();
  } finally {
    normalized.fill(0); pad.fill(0); intermediate?.fill(0);
    inner?.destroy?.(); outer?.destroy?.();
  }
}
