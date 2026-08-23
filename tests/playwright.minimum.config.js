import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/minimum-browser.spec.js',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8917',
    browserName: process.env.WTOOLS_BASELINE_BROWSER,
  },
  webServer: {
    command: 'python3 -m http.server 8917 --directory ..',
    url: 'http://127.0.0.1:8917/',
  },
});
