// 도구가 지연 로드하는 외부 라이브러리(CDN)를 디스크에 캐시하는 Playwright 픽스처.
//
// CDN이 잠깐 안 잡히면 lzma·lz4처럼 라이브러리를 받아 쓰는 케이스가 통째로 실패한다.
// 실제로 CI에서 재시도까지 함께 실패한 적이 있어서, 한 번 받은 응답은 파일로 두고 다음
// 실행부터는 네트워크를 타지 않게 한다. CI에서는 actions/cache가 이 디렉터리를 넘겨준다.
//
// 캐시된 응답도 브라우저가 core.js의 SRI(integrity) 해시로 검증하므로, 캐시본이 핀과
// 다르면 그대로 로드 실패한다. 캐시가 조용히 썩는 것은 막힌다.
//
// WTOOLS_LIVE_CDN=1이면 가로채지 않고 실제 CDN을 그대로 쓴다. 핀이 죽었거나 패키지가
// 내려간 경우를 잡기 위한 nightly 잡용.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '.lib-cache');
const LIVE = process.env.WTOOLS_LIVE_CDN === '1';

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

// 다른 spec의 test 객체에 그대로 펼쳐 넣는다: base.extend({ ...cdnCache, ... })
export const cdnCache = {
  _cdnCache: [async ({ page, baseURL }, use) => {
    if (!LIVE) {
      const origin = new URL(baseURL).origin;
      const external = (url) => (url.protocol === 'http:' || url.protocol === 'https:') && !url.href.startsWith(origin);
      await page.route(external, handle);
    }
    await use();
  }, { auto: true }],
};
