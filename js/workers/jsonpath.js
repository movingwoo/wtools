import { parseJsonPathJson, queryJsonPath, stringifyJsonPathResult } from '../lib/data/jsonpath.js';

self.addEventListener('message', ({ data }) => {
  try {
    if (data?.action !== 'query' || typeof data.text !== 'string' || typeof data.path !== 'string')
      throw new Error('지원하지 않는 JSONPath Worker 작업입니다.');
    const json = parseJsonPathJson(data.text);
    self.postMessage({ result: stringifyJsonPathResult(queryJsonPath(json, data.path)) });
  } catch (error) {
    self.postMessage({ error: error?.message || String(error), code: error?.code });
  }
}, { once: true });
