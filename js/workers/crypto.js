import { trackWorkerResources } from '../lib/common/runtime-resources.js';
trackWorkerResources();
import { digest, hmac, HASH_NAMES } from '../lib/crypto/hash.js';
import { hex } from '../lib/crypto/bytes.js';

async function loadAdapter(path) {
  try { return await import(path); }
  catch (cause) { throw new Error('암호 구현을 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.', { cause }); }
}

self.onmessage = async ({ data }) => {
  try {
    let result;
    switch (data.action) {
      case 'hash-all': {
        result = [];
        for (const name of HASH_NAMES) result.push([name, hex(await digest(name, data.data))]);
        break;
      }
      case 'digest': result = await digest(data.name, data.data); break;
      case 'hmac': result = await hmac(data.name, data.data, data.key); break;
      case 'aes': result = await (await loadAdapter('../lib/crypto/aes-envelope.js')).processAes(data.values, data.options, data.operation); break;
      case 'legacy': result = await (await loadAdapter('../lib/crypto/legacy.js')).processLegacy(data.algorithm, data.values, data.options, data.operation); break;
      default: throw new Error('알 수 없는 암호 작업입니다.');
    }
    self.postMessage({ result }, result instanceof Uint8Array ? [result.buffer] : []);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '암호 작업에 실패했습니다.' });
  } finally { data.data?.fill(0); if (data.key instanceof Uint8Array) data.key.fill(0); }
};
