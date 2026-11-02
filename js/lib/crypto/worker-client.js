import { digest, hmac } from './hash.js';
import { limit, MAX_CRYPTO_BYTES, MAX_KEY_BYTES } from './bytes.js';

const WORKER_URL = new URL('../../workers/crypto.js', import.meta.url);
const abortError = () => new DOMException('작업이 취소되었습니다.', 'AbortError');

// A worker belongs to one request. Termination also drops its private key state.
// Structured clone retains caller-owned buffers; no caller buffer is detached.
export function runCrypto(action, payload, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  if (payload.data) limit(payload.data);
  if (payload.key instanceof Uint8Array) limit(payload.key, MAX_KEY_BYTES);
  if (payload.values) {
    if (payload.values.text.length > MAX_CRYPTO_BYTES * 3) throw new Error('암호 입력은 최대 16 MiB입니다.');
    if (payload.values.key.length > MAX_KEY_BYTES) throw new Error('키 또는 비밀번호는 최대 64 KiB입니다.');
  }
  if (typeof Worker === 'undefined') return Promise.reject(new Error('이 브라우저는 암호 작업에 필요한 Web Worker를 지원하지 않습니다.'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, { type: 'module' });
    const finish = (error, result) => {
      worker.terminate(); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(abortError());
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data.result);
    worker.onerror = (event) => {
      event.preventDefault();
      finish(new Error('암호 Worker를 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.'));
    };
    try { worker.postMessage({ action, ...payload }); }
    catch (error) { finish(error); }
  });
}

export function digestBytes(name, data, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  limit(data);
  return data.length >= 64 * 1024 ? runCrypto('digest', { name, data }, signal) : digest(name, data);
}

export function hmacBytes(name, data, key, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  limit(data); limit(key, MAX_KEY_BYTES);
  return data.length >= 64 * 1024 || key.length >= 16 * 1024
    ? runCrypto('hmac', { name, data, key }, signal) : hmac(name, data, key);
}
