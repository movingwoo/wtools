import { limit, bytes, MAX_KEY_BYTES, MAX_CRYPTO_BYTES } from './bytes.js';

const MODES = ['CBC', 'CFB', 'CTR', 'OFB', 'ECB'];
const loaders = new Map();
function load(path) {
  if (!loaders.has(path)) loaders.set(path, import(path).catch((cause) => {
    loaders.delete(path);
    throw new Error('암호 구현을 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.', { cause });
  }));
  return loaders.get(path);
}

export async function createCipher(algorithm, key, legacy = false) {
  limit(key, MAX_KEY_BYTES);
  if (algorithm === 'AES') return (await load('./aes.js')).createAes(key);
  if (algorithm === 'DES') return (await load('./des.js')).createDes(key);
  if (algorithm === 'TripleDES') return (await load('./des.js')).createTripleDes(key);
  if (algorithm === 'Blowfish') return (await load('./blowfish.js')).createBlowfish(key, { legacy });
  throw new Error('지원하지 않는 암호 알고리즘입니다.');
}

export async function cipher({ algorithm = 'AES', mode = 'CBC', data, key, iv, decrypt = false, padding = true, native = true, legacy = false }) {
  limit(data, MAX_CRYPTO_BYTES + (decrypt ? 16 : 0)); limit(key, MAX_KEY_BYTES); bytes(iv);
  if (!MODES.includes(mode)) throw new Error('지원하지 않는 암호 모드입니다.');
  const blockSize = algorithm === 'AES' ? 16 : 8;
  if (iv.length !== (mode === 'ECB' ? 0 : blockSize)) throw new Error('IV 길이가 올바르지 않습니다.');
  const padded = padding && (mode === 'CBC' || mode === 'ECB');
  const aligned = mode === 'CBC' || mode === 'ECB';
  if (aligned && ((decrypt || !padded) && data.length % blockSize || decrypt && padded && !data.length))
    throw new Error(`${mode} 암호문 길이는 ${blockSize}바이트의 배수여야 합니다.`);
  if (algorithm === 'AES' && ![16, 24, 32].includes(key.length)) throw new Error('AES 키는 16, 24, 32바이트여야 합니다.');
  if (native && algorithm === 'AES' && key.length !== 24 && globalThis.crypto?.subtle && (mode === 'CTR' || mode === 'CBC' && padded)) {
    try {
      const name = `AES-${mode}`;
      const imported = await globalThis.crypto.subtle.importKey('raw', key, name, false, [decrypt ? 'decrypt' : 'encrypt']);
      const parameters = mode === 'CTR' ? { name, counter: iv, length: 32 } : { name, iv };
      const output = new Uint8Array(await globalThis.crypto.subtle[decrypt ? 'decrypt' : 'encrypt'](parameters, imported, data));
      if (decrypt && output.length > MAX_CRYPTO_BYTES) {
        output.fill(0);
        throw new Error('복호화 결과는 최대 16 MiB입니다.');
      }
      return output;
    } catch (error) {
      // AES-192 always uses the portable implementation; native data errors stay failures.
      if (error.name !== 'NotSupportedError')
        throw new Error('복호화 또는 암호화에 실패했습니다. 키, IV, 모드와 암호문을 확인하세요.', { cause: error });
    }
  }
  const engine = await createCipher(algorithm, key, legacy);
  let input = data;
  if (!decrypt && padded) {
    const amount = blockSize - data.length % blockSize;
    input = new Uint8Array(data.length + amount);
    input.set(data); input.fill(amount, data.length);
  }
  const out = new Uint8Array(input.length), block = new Uint8Array(blockSize), chain = new Uint8Array(iv), saved = new Uint8Array(blockSize);
  try {
    for (let offset = 0; offset < input.length; offset += blockSize) {
      const n = Math.min(blockSize, input.length - offset);
      block.fill(0); block.set(input.subarray(offset, offset + n));
      if (mode === 'CBC' || mode === 'ECB') {
        if (decrypt) {
          saved.set(block); engine.decrypt(block);
          if (mode === 'CBC') { for (let i = 0; i < blockSize; i++) block[i] ^= chain[i]; chain.set(saved); }
        } else {
          if (mode === 'CBC') for (let i = 0; i < blockSize; i++) block[i] ^= chain[i];
          engine.encrypt(block);
          if (mode === 'CBC') chain.set(block);
        }
      } else {
        saved.set(block); block.set(chain); engine.encrypt(block);
        if (mode === 'OFB') chain.set(block);
        for (let i = 0; i < n; i++) block[i] ^= saved[i];
        if (mode === 'CFB') chain.set(decrypt ? saved : block);
        if (mode === 'CTR') {
          // CryptoJS compatibility: wrap the final 32 bits, never carry into prior words.
          for (let i = blockSize - 1; i >= blockSize - 4; i--) { chain[i]++; if (chain[i]) break; }
        }
      }
      out.set(block.subarray(0, n), offset);
    }
    if (decrypt && padded) {
      const amount = out[out.length - 1];
      let invalid = +(amount === 0 || amount > blockSize);
      // Check every byte in the last block; do not return partial plaintext on failure.
      for (let i = 1; i <= blockSize; i++) invalid |= +(i <= amount) * (out[out.length - i] ^ amount);
      if (invalid) throw new Error('복호화 실패: 키, IV, 모드와 암호문을 확인하세요.');
      limit(out.subarray(0, out.length - amount));
      return out.slice(0, out.length - amount);
    }
    if (decrypt) limit(out);
    return out.slice();
  } finally {
    engine.destroy(); block.fill(0); chain.fill(0); saved.fill(0); out.fill(0);
    if (input !== data) input.fill(0);
  }
}
