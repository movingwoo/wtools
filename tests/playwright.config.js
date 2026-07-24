import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8917',
    browserName: 'chromium',
  },
  webServer: {
    // 저장소 루트를 그대로 서빙한다. ES 모듈은 file:// 로 동작하지 않기 때문.
    command: 'python3 -m http.server 8917 --directory ..',
    url: 'http://127.0.0.1:8917/',
    reuseExistingServer: !process.env.CI,
  },
});
