const hashers = new Map();
let loadedUrl = '';

function loadCryptoJs(value) {
  const url = new URL(value, self.location.href);
  if (url.origin !== self.location.origin)
    throw new Error('검증되지 않은 외부 해시 모듈은 실행할 수 없습니다.');
  if (loadedUrl && loadedUrl !== url.href)
    throw new Error('파일 해시 모듈 주소가 작업 중에 변경되었습니다.');
  if (loadedUrl) return;
  importScripts(url.href);
  if (!globalThis.CryptoJS) throw new Error('파일 해시 모듈을 초기화하지 못했습니다.');
  loadedUrl = url.href;
}

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'start') {
      loadCryptoJs(data.cryptoJsUrl);
      const algorithm = CryptoJS.algo[data.algorithm];
      if (!algorithm) throw new Error('지원하지 않는 파일 해시 알고리즘입니다.');
      hashers.set(data.job, algorithm.create());
      self.postMessage({ request: data.request });
      return;
    }
    const hasher = hashers.get(data.job);
    if (!hasher) throw new Error('파일 해시 작업 상태를 찾지 못했습니다.');
    if (data.type === 'chunk') {
      hasher.update(CryptoJS.lib.WordArray.create(new Uint8Array(data.bytes)));
      self.postMessage({ request: data.request });
      return;
    }
    if (data.type === 'finish') {
      const digest = hasher.finalize().toString();
      hashers.delete(data.job);
      self.postMessage({ request: data.request, digest });
      return;
    }
    throw new Error('알 수 없는 파일 해시 요청입니다.');
  } catch (error) {
    self.postMessage({ request: data.request, error: error?.message || String(error) });
  }
};
