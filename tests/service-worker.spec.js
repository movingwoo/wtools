// 서비스 워커 무결성·오프라인 캐시 전용 테스트. 일반 spec과 달리 등록을 허용한다.
import { test as base, expect } from '@playwright/test';
import { cdnCache } from './cdn-cache.js';

const test = base.extend({ ...cdnCache });
test.use({ allowServiceWorker: true });

const EXTERNAL_URL = 'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js';
const VENDORED_PATH = '/assets/vendor/smol-toml-1.2.2.mjs';

async function waitForControl(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
      if (navigator.serviceWorker.controller) resolve();
    });
  });
}

test('설치 시 검증된 자산만 캐시하고 이전 버전 캐시를 삭제한다', async ({ page, context }) => {
  await page.goto('/404.html');
  await page.evaluate(async (externalUrl) => {
    await caches.open('wtools-shell-v0');
    await caches.open('wtools-external-v0');
    const response = await fetch(externalUrl);
    const cache = await caches.open('wtools-external-v2');
    await cache.put(externalUrl, response);
  }, EXTERNAL_URL);

  await page.goto('/');
  await waitForControl(page);
  const state = await page.evaluate(async ({ externalUrl, vendoredPath }) => {
    const keys = await caches.keys();
    const shell = await caches.open('wtools-shell-v10');
    const vendorResponse = await shell.match(vendoredPath);
    const entry = globalThis.WTOOLS_DEPENDENCIES.vendored.smolToml;
    const digest = await crypto.subtle.digest('SHA-384', await vendorResponse.clone().arrayBuffer());
    const integrity = 'sha384-' + btoa(String.fromCharCode(...new Uint8Array(digest)));
    const external = await caches.open('wtools-external-v2');
    return {
      keys,
      vendorIntegrity: integrity,
      expectedVendorIntegrity: entry.integrity,
      externalCached: !!await external.match(externalUrl),
    };
  }, { externalUrl: EXTERNAL_URL, vendoredPath: VENDORED_PATH });
  expect(state.keys).not.toContain('wtools-shell-v0');
  expect(state.keys).not.toContain('wtools-external-v0');
  expect(state.vendorIntegrity).toBe(state.expectedVendorIntegrity);
  expect(state.externalCached).toBe(true);

  await context.setOffline(true);
  const externalStatus = await page.evaluate((url) => fetch(url).then((response) => response.status), EXTERNAL_URL);
  expect(externalStatus).toBe(200);

  await page.evaluate(() => { location.hash = '#/tool/data-convert'; });
  const content = page.locator('#content');
  await expect(content.locator('.tool-header h1')).toHaveText('JSON ↔ YAML ↔ XML ↔ CSV ↔ TOML ↔ ENV');
  const io = content.locator('.io');
  await io.getByLabel('입력 포맷').selectOption('toml');
  await io.getByLabel('출력 포맷').selectOption('json');
  await io.locator('textarea.mono:not(.out)').fill('name = "offline"');
  await expect(io.locator('textarea.out')).toHaveValue('{\n  "name": "offline"\n}');
});

test('변조된 제3자 응답과 캐시를 폐기하고 한국어 오류를 반환한다', async ({ page }) => {
  await page.goto('/');
  await waitForControl(page);
  const result = await page.evaluate(async () => {
    await import('/js/sw-integrity.js');
    const { verifiedCached, fetchVerified, IntegrityError, integrityErrorResponse } = globalThis.WTOOLS_INTEGRITY;
    const integrity = globalThis.WTOOLS_DEPENDENCIES.cdn.jsyaml.integrity;
    const altered = () => new Response('globalThis.altered = true;', {
      headers: { 'Content-Type': 'application/javascript' },
    });
    let cachedDeleted = false;
    const corruptCache = {
      match: async () => altered(),
      delete: async () => { cachedDeleted = true; },
    };
    const cached = await verifiedCached(corruptCache, 'https://example.com/library.js', integrity);

    let fetchedDeleted = false;
    const networkCache = {
      put: async () => {},
      delete: async () => { fetchedDeleted = true; },
    };
    let integrityError = false;
    try {
      await fetchVerified(networkCache, 'https://example.com/library.js', integrity, async () => altered());
    } catch (error) {
      integrityError = error instanceof IntegrityError;
    }
    const response = integrityErrorResponse();
    return {
      status: response.status,
      body: await response.text(),
      cached,
      cachedDeleted,
      fetchedDeleted,
      integrityError,
    };
  });
  expect(result.status).toBe(502);
  expect(result.body).toContain('무결성 검증에 실패했습니다');
  expect(result.cached).toBeNull();
  expect(result.cachedDeleted).toBe(true);
  expect(result.fetchedDeleted).toBe(true);
  expect(result.integrityError).toBe(true);
});
