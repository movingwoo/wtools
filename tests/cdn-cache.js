// 도구가 지연 로드하는 외부 라이브러리(CDN)를 디스크에 캐시하는 Playwright 픽스처.
//
// CDN이 잠깐 안 잡히면 lzma·lz4처럼 라이브러리를 받아 쓰는 케이스가 통째로 실패한다.
// 실제로 CI에서 재시도까지 함께 실패한 적이 있어서, 한 번 받은 응답은 파일로 두고 다음
// 실행부터는 네트워크를 타지 않게 한다. CI에서는 actions/cache가 이 디렉터리를 넘겨준다.
//
// 외부 classic script/CSS는 브라우저가 dependencies.js의 SRI 해시로 검증한다.
// 동적 ESM/WASM은 검토한 로컬 자산이므로 이 픽스처를 거치지 않는다.
//
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '.lib-cache');
const entryPath = (url) => join(CACHE_DIR, createHash('sha256').update(url).digest('hex').slice(0, 32));

// 저장한 헤더로 그대로 응답하면 content-encoding·content-length가 실제 본문과 어긋난다.
// 로드에 필요한 것만 직접 만든다. crossorigin="anonymous"로 붙는 스크립트라 CORS 헤더는 필수.
const responseHeaders = (contentType) => ({
  'content-type': contentType || 'application/javascript',
  'access-control-allow-origin': '*',
});

async function fetchWithRetry(route, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await route.fetch();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function handle(route) {
  const url = route.request().url();
  const path = entryPath(url);
  if (existsSync(`${path}.meta`)) {
    const meta = JSON.parse(readFileSync(`${path}.meta`, 'utf8'));
    await route.fulfill({ status: 200, headers: responseHeaders(meta.contentType), body: readFileSync(`${path}.body`) });
    return;
  }
  const response = await fetchWithRetry(route);
  const body = await response.body();
  // 실패 응답이나 빈 본문을 캐시에 남기면 이후 실행이 전부 그 응답을 재사용하게 된다.
  if (response.status() === 200 && body.length > 0) {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(`${path}.body`, body);
    writeFileSync(`${path}.meta`, JSON.stringify({ url, contentType: response.headers()['content-type'] ?? null }));
  }
  await route.fulfill({ response, body });
}

// sw.js는 cdn.jsdelivr.net 등을 자체 캐시로 가로챈다. 서비스워커가 처리한 요청은
// page.route에 잡히지 않아 위 캐시가 무력화되고, 워커가 제어권을 잡는 시점에 따라
// 결과도 달라진다. 그래서 등록만 막는다.
//
// Playwright의 serviceWorkers:'block'은 쓸 수 없다. 그 옵션은 모든 문서에
// `navigator.serviceWorker.register = ...` init 스크립트를 주입하는데,
// markdown-html 미리보기처럼 sandbox 속성이 빈 iframe에서는 navigator.serviceWorker를
// 읽는 것 자체가 SecurityError라 pageerror가 난다. 같은 일을 예외에 안전하게 한다.
const blockServiceWorker = () => {
  try {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {});
  } catch {
    // 샌드박스 프레임에서는 navigator.serviceWorker 접근 자체가 막혀 있다. 그러면 등록도 불가능하다.
  }
};

// 다른 spec의 test 객체에 그대로 펼쳐 넣는다: base.extend({ ...cdnCache, ... })
export const cdnCache = {
  allowServiceWorker: [false, { option: true }],
  _cdnCache: [async ({ page, baseURL, allowServiceWorker }, use) => {
    const origin = new URL(baseURL).origin;
    const external = (url) => (url.protocol === 'http:' || url.protocol === 'https:') && !url.href.startsWith(origin);
    if (!allowServiceWorker) await page.addInitScript(blockServiceWorker);
    await page.route(external, handle);
    try {
      await use();
    } finally {
      // 테스트가 외부 라이브러리 로딩 중 끝나도 route.fetch()의 종료 오류가
      // 테스트 실패로 번지지 않게 진행 중인 라우트 콜백을 안전하게 정리한다.
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  }, { auto: true }],
};
