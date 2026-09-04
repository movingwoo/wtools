const ZIP_WORKER_URL = new URL('../../workers/zip.js', import.meta.url);

function abortError() {
  return new DOMException('작업이 취소되었습니다.', 'AbortError');
}

function transferBuffers(payload) {
  const buffers = new Set();
  if (payload.bytes?.buffer instanceof ArrayBuffer) buffers.add(payload.bytes.buffer);
  for (const entry of payload.entries || []) {
    if (entry.data?.buffer instanceof ArrayBuffer) buffers.add(entry.data.buffer);
  }
  return [...buffers];
}

function receivedBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError('ZIP Worker 결과가 바이트 배열이 아닙니다.');
}

export function runZipWorker(action, payload, { signal, onProgress } = {}) {
  if (typeof Worker === 'undefined') return Promise.reject(new Error('이 브라우저는 Web Worker를 지원하지 않습니다.'));
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const worker = new Worker(ZIP_WORKER_URL, { type: 'module' });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(result);
    };
    const abort = () => finish(abortError());
    signal?.addEventListener('abort', abort, { once: true });
    worker.addEventListener('message', ({ data }) => {
      if (data.type === 'progress') {
        onProgress?.(data.progress);
        return;
      }
      if (data.error) finish(new Error(data.error));
      else if (action === 'create') finish(null, receivedBytes(data.output));
      else finish(null, data.entries.map((entry) => ({ ...entry, data: receivedBytes(entry.data) })));
    });
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      finish(new Error(event.message || 'ZIP Worker를 실행하지 못했습니다.'));
    });
    try {
      worker.postMessage({ action, ...payload }, transferBuffers(payload));
    } catch (error) {
      finish(error);
    }
  });
}
