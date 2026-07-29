import { defineConfig } from '@playwright/test';

const crossBrowserTests = [
  '**/smoke.spec.js',
  '**/tools-render.spec.js',
  '**/tools/media.spec.js',
];

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  // CDN 라이브러리를 지연 로드하는 도구가 있어 기본 5초보다 여유를 둔다.
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8917',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', testMatch: crossBrowserTests, use: { browserName: 'firefox' } },
    { name: 'webkit', testMatch: crossBrowserTests, use: { browserName: 'webkit' } },
  ],
  webServer: {
    // 저장소 루트를 그대로 서빙한다. ES 모듈은 file:// 로 동작하지 않기 때문.
    command: 'python3 -m http.server 8917 --directory ..',
    url: 'http://127.0.0.1:8917/',
    reuseExistingServer: !process.env.CI,
  },
});
