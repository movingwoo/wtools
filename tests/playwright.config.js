import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  // CDN 라이브러리를 지연 로드하는 도구가 있어 기본 5초보다 여유를 둔다.
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8917',
    browserName: 'chromium',
    // sw.js는 cdn.jsdelivr.net 등을 자체 캐시로 가로챈다. 서비스워커가 처리한 요청은
    // page.route로 잡히지 않아(Playwright 문서 권고) CDN 캐시 픽스처가 무력화되고,
    // 워커가 제어권을 잡는 시점에 따라 결과도 달라진다. 테스트에서는 등록을 막는다.
    serviceWorkers: 'block',
  },
  webServer: {
    // 저장소 루트를 그대로 서빙한다. ES 모듈은 file:// 로 동작하지 않기 때문.
    command: 'python3 -m http.server 8917 --directory ..',
    url: 'http://127.0.0.1:8917/',
    reuseExistingServer: !process.env.CI,
  },
});
