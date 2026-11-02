import { trackWorkerResources } from '../lib/common/runtime-resources.js';
trackWorkerResources();
import { createHash } from '../lib/crypto/hash.js';
import { hex } from '../lib/crypto/bytes.js';

const hashers = new Map();
const ALGORITHMS = ['MD5', 'SHA1', 'SHA256', 'SHA512'];

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'start') {
      if (!ALGORITHMS.includes(data.algorithm)) throw new Error('지원하지 않는 파일 해시 알고리즘입니다.');
      if (hashers.size) throw new Error('진행 중인 파일 해시 작업이 있습니다.');
      hashers.set(data.job, await createHash(data.algorithm));
      self.postMessage({ request: data.request });
      return;
    }
    const hasher = hashers.get(data.job);
    if (!hasher) throw new Error('파일 해시 작업 상태를 찾지 못했습니다.');
    if (data.type === 'chunk') {
      const input = data.bytes;
      if (!(input instanceof Uint8Array) || input.length > 2 * 1024 * 1024)
        throw new Error('파일 해시 청크는 최대 2 MiB의 바이트 배열이어야 합니다.');
      try { hasher.update(input); } finally { input.fill(0); }
      self.postMessage({ request: data.request });
      return;
    }
    if (data.type === 'finish') {
      const digest = hex(hasher.digest());
      hasher.destroy?.();
      hashers.delete(data.job);
      self.postMessage({ request: data.request, digest });
      return;
    }
    throw new Error('알 수 없는 파일 해시 요청입니다.');
  } catch (error) {
    hashers.get(data.job)?.destroy?.();
    hashers.delete(data.job);
    self.postMessage({ request: data.request, error: error?.message || '파일 해시 계산에 실패했습니다.' });
  }
};
