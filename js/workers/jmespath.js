import { formatError, parseJson, search, stringifyResult } from '../lib/data/jmespath.js';

self.addEventListener('message', ({ data }) => {
  try {
    if (data?.action !== 'query' || typeof data.text !== 'string' || typeof data.expression !== 'string')
      throw new Error('지원하지 않는 JMESPath Worker 작업입니다.');
    self.postMessage({ result: stringifyResult(search(parseJson(data.text), data.expression)) });
  } catch (error) {
    self.postMessage({
      error: formatError(error),
      code: error?.code,
      index: error?.index,
    });
  }
}, { once: true });
