// 서비스 워커 무결성·오프라인 캐시 전용 테스트. 일반 spec과 달리 등록을 허용한다.
import { readFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';
import { cdnCache } from './cdn-cache.js';

const test = base.extend({ ...cdnCache });
test.use({ allowServiceWorker: true });

const EXTERNAL_URL = 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js';
const REMOVED_YAML_URL = 'https://cdn.jsdelivr.net/npm/js-yaml@4.3.1/dist/js-yaml.min.js';
const REMOVED_MARKED_URL = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js';
const REMOVED_HIGHLIGHT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
const REMOVED_HIGHLIGHT_CSS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark-dimmed.min.css';
const REMOVED_BEAUTIFY_JS_URL = 'https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify.min.js';
const REMOVED_BEAUTIFY_CSS_URL = 'https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify-css.min.js';
const REMOVED_BEAUTIFY_HTML_URL = 'https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify-html.min.js';
const REMOVED_SQL_FORMATTER_URL = 'https://cdn.jsdelivr.net/npm/sql-formatter@15.3.2/dist/sql-formatter.min.js';
const VENDORED_PATH = '/assets/vendor/smol-toml-1.6.1.mjs';
const emojiLock = JSON.parse(readFileSync(new URL('../scripts/emoji-data-lock.json', import.meta.url), 'utf8'));
const emojiCount = Object.values(emojiLock.groupCounts).reduce((sum, count) => sum + count, 0);

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
  await page.evaluate(async ({ externalUrl, removedYamlUrl }) => {
    await caches.open('wtools-shell-v0');
    await caches.open('wtools-external-v0');
    const response = await fetch(externalUrl);
    const oldCache = await caches.open('wtools-external-v2');
    await oldCache.put(externalUrl, response.clone());
    await caches.open('wtools-external-v3');
    const olderCache = await caches.open('wtools-external-v4');
    await olderCache.put(externalUrl, response.clone());
    const previousCache = await caches.open('wtools-external-v5');
    await previousCache.put(externalUrl, response.clone());
    await previousCache.put('https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
      new Response('stale marked response', { status: 200 }));
    const latestCache = await caches.open('wtools-external-v6');
    await latestCache.put(externalUrl, response.clone());
    await latestCache.put('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
      new Response('stale highlight response', { status: 200 }));
    await latestCache.put('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark-dimmed.min.css',
      new Response('stale highlight theme', { status: 200 }));
    const formatterCache = await caches.open('wtools-external-v7');
    await formatterCache.put(externalUrl, response.clone());
    await formatterCache.put('https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify.min.js',
      new Response('stale JavaScript beautifier', { status: 200 }));
    await formatterCache.put('https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify-css.min.js',
      new Response('stale CSS beautifier', { status: 200 }));
    await formatterCache.put('https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify-html.min.js',
      new Response('stale HTML beautifier', { status: 200 }));
    const sqlFormatterCache = await caches.open('wtools-external-v8');
    await sqlFormatterCache.put(externalUrl, response.clone());
    await sqlFormatterCache.put('https://cdn.jsdelivr.net/npm/sql-formatter@15.3.2/dist/sql-formatter.min.js',
      new Response('stale SQL formatter', { status: 200 }));
    const yamlCache = await caches.open('wtools-external-v9');
    await yamlCache.put(externalUrl, response.clone());
    await yamlCache.put(removedYamlUrl, new Response('stale YAML parser', { status: 200 }));
  }, { externalUrl: EXTERNAL_URL, removedYamlUrl: REMOVED_YAML_URL });

  await page.goto('/');
  await waitForControl(page);
  const state = await page.evaluate(async ({
    externalUrl, removedMarkedUrl, removedHighlightUrl, removedHighlightCssUrl,
    removedBeautifyJsUrl, removedBeautifyCssUrl, removedBeautifyHtmlUrl, removedSqlFormatterUrl,
    removedYamlUrl, vendoredPath,
  }) => {
    const keys = await caches.keys();
    const shellName = keys.find((key) => key.startsWith('wtools-shell-'));
    const shell = await caches.open(shellName);
    const vendorResponse = await shell.match(vendoredPath);
    const entry = globalThis.WTOOLS_DEPENDENCIES.vendored.smolToml;
    const digest = await crypto.subtle.digest('SHA-384', await vendorResponse.clone().arrayBuffer());
    const integrity = 'sha384-' + btoa(String.fromCharCode(...new Uint8Array(digest)));
    const external = await caches.open('wtools-external-v10');
    return {
      keys,
      vendorIntegrity: integrity,
      expectedVendorIntegrity: entry.integrity,
      externalCached: !!await external.match(externalUrl),
      removedMarkedCached: !!await external.match(removedMarkedUrl),
      removedHighlightCached: !!await external.match(removedHighlightUrl),
      removedHighlightCssCached: !!await external.match(removedHighlightCssUrl),
      removedBeautifyJsCached: !!await external.match(removedBeautifyJsUrl),
      removedBeautifyCssCached: !!await external.match(removedBeautifyCssUrl),
      removedBeautifyHtmlCached: !!await external.match(removedBeautifyHtmlUrl),
      removedSqlFormatterCached: !!await external.match(removedSqlFormatterUrl),
      removedYamlCached: !!await external.match(removedYamlUrl),
      shellName,
    };
  }, {
    externalUrl: EXTERNAL_URL,
    removedMarkedUrl: REMOVED_MARKED_URL,
    removedHighlightUrl: REMOVED_HIGHLIGHT_URL,
    removedHighlightCssUrl: REMOVED_HIGHLIGHT_CSS_URL,
    removedBeautifyJsUrl: REMOVED_BEAUTIFY_JS_URL,
    removedBeautifyCssUrl: REMOVED_BEAUTIFY_CSS_URL,
    removedBeautifyHtmlUrl: REMOVED_BEAUTIFY_HTML_URL,
    removedSqlFormatterUrl: REMOVED_SQL_FORMATTER_URL,
    removedYamlUrl: REMOVED_YAML_URL,
    vendoredPath: VENDORED_PATH,
  });
  expect(state.keys).not.toContain('wtools-shell-v0');
  expect(state.keys).not.toContain('wtools-external-v0');
  expect(state.keys).not.toContain('wtools-external-v2');
  expect(state.keys).not.toContain('wtools-external-v3');
  expect(state.keys).not.toContain('wtools-external-v4');
  expect(state.keys).not.toContain('wtools-external-v5');
  expect(state.keys).not.toContain('wtools-external-v6');
  expect(state.keys).not.toContain('wtools-external-v7');
  expect(state.keys).not.toContain('wtools-external-v8');
  expect(state.keys).not.toContain('wtools-external-v9');
  expect(state.shellName).toMatch(/^wtools-shell-[0-9a-f]{12}$/);
  expect(state.vendorIntegrity).toBe(state.expectedVendorIntegrity);
  expect(state.externalCached).toBe(true);
  expect(state.removedMarkedCached).toBe(false);
  expect(state.removedHighlightCached).toBe(false);
  expect(state.removedHighlightCssCached).toBe(false);
  expect(state.removedBeautifyJsCached).toBe(false);
  expect(state.removedBeautifyCssCached).toBe(false);
  expect(state.removedBeautifyHtmlCached).toBe(false);
  expect(state.removedSqlFormatterCached).toBe(false);
  expect(state.removedYamlCached).toBe(false);

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
  await io.getByLabel('입력 포맷').selectOption('yaml');
  await io.locator('textarea.mono:not(.out)').fill('base: &base\n  enabled: true\nitem:\n  <<: *base\n  name: offline');
  await expect(io.locator('textarea.out')).toHaveValue('{\n  "base": {\n    "enabled": true\n  },\n  "item": {\n    "enabled": true,\n    "name": "offline"\n  }\n}');

  await page.evaluate(() => { location.hash = '#/tool/markdown-html'; });
  const markdown = page.locator('#content .io');
  await markdown.locator('textarea.mono:not(.out)').fill('**오프라인**');
  await markdown.getByRole('button', { name: 'HTML 코드', exact: true }).click();
  await expect(markdown.locator('.out-html')).toContainText('<strong>오프라인</strong>');
  const workerHtml = await page.evaluate(() => new Promise((resolve, reject) => {
    const worker = new Worker('/js/workers/markdown-render.js', { type: 'module' });
    worker.addEventListener('message', ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.html);
    }, { once: true });
    worker.addEventListener('error', reject, { once: true });
    worker.postMessage({ text: '# Worker 오프라인' });
  }));
  expect(workerHtml).toBe('<h1>Worker 오프라인</h1>\n');

  await page.evaluate(() => { location.hash = '#/tool/syntax-highlight'; });
  const syntax = page.locator('#content .io');
  await syntax.getByLabel('언어').selectOption('javascript');
  await syntax.locator('textarea.mono:not(.out)').fill('const offline = true;');
  await expect(syntax.locator('.syntax-highlight code')).toHaveText('const offline = true;');
  await expect(syntax.locator('.syn-keyword')).toHaveText('const');

  await page.evaluate(() => { location.hash = '#/tool/code-format'; });
  const formatter = page.locator('#content .io');
  await formatter.getByLabel('언어').selectOption('js');
  await formatter.locator('textarea.mono:not(.out)').fill('const value={url:"https://example.com/a//b",items:[1,2]};');
  await formatter.getByRole('button', { name: '포맷', exact: true }).click();
  await expect(formatter.locator('textarea.out')).toHaveValue(/url: "https:\/\/example\.com\/a\/\/b"/);
  await formatter.getByLabel('언어').selectOption('sql');
  await formatter.locator('textarea.mono:not(.out)').fill('select id,name from users where active=true');
  await formatter.getByRole('button', { name: '포맷', exact: true }).click();
  await expect(formatter.locator('textarea.out')).toHaveValue('SELECT\n  id,\n  name\nFROM\n  users\nWHERE\n  active = TRUE');
  const workerFormatted = await page.evaluate(() => new Promise((resolve, reject) => {
    const worker = new Worker('/js/workers/code-format.js', { type: 'module' });
    worker.addEventListener('message', ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    }, { once: true });
    worker.addEventListener('error', reject, { once: true });
    worker.postMessage({ text: '.a{color:red}', lang: 'css', action: 'fmt', indentSize: 2 });
  }));
  expect(workerFormatted).toBe('.a {\n  color: red\n}');
});

test('오프라인에서 직접 도구 URL 새로고침과 navigation fallback을 복구한다', async ({ page, context }) => {
  await page.goto('/#/tool/base64');
  await waitForControl(page);
  await expect(page.locator('#content .tool-header h1')).toHaveText('Base64 인코딩/디코딩');

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#content .tool-header h1')).toHaveText('Base64 인코딩/디코딩');

  await page.evaluate(() => { location.hash = '#/tool/emoji-picker'; });
  const emoji = page.locator('#content .tool-body');
  await expect(emoji.locator('.note[role="status"]')).toContainText(`${emojiCount.toLocaleString('ko-KR')}개`);
  await emoji.getByPlaceholder('검색 (예: 하트, fire, 웃음)').fill('rocket');
  await expect(emoji.locator('button[title="로켓"]')).toBeVisible();

  await page.goto('/#/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#content .home h1')).toHaveText('W-Tools');

  // 앱 셸에 없는 navigation 요청은 캐시된 index.html로 돌아오고 해시 라우팅을 유지해야 한다.
  await page.goto('/offline-navigation#/tool/data-convert', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#content .tool-header h1')).toHaveText('JSON ↔ YAML ↔ XML ↔ CSV ↔ TOML ↔ ENV');
  await expect(page.locator('#content .io')).toBeVisible();
});

test('대기 중인 새 Worker를 적용하면 페이지를 정확히 한 번 새로고침한다', async ({ page }) => {
  await page.addInitScript(() => {
    const count = Number(sessionStorage.getItem('wtools-update-test-loads') || '0') + 1;
    sessionStorage.setItem('wtools-update-test-loads', String(count));
  });
  await page.goto('/');
  await waitForControl(page);

  // 같은 scope에 쿼리가 다른 스크립트 URL을 등록해 실제 updatefound/waiting 흐름을 만든다.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js?update-flow=1', { updateViaCache: 'none' });
    if (registration.waiting) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('새 Worker가 대기 상태가 되지 않았습니다.')), 10_000);
      const watch = (worker) => worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && registration.waiting) {
          clearTimeout(timeout);
          resolve();
        }
      });
      registration.addEventListener('updatefound', () => watch(registration.installing));
      watch(registration.installing);
    });
  });

  const notice = page.locator('#update-notice');
  await expect(notice).toBeVisible();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    notice.getByRole('button', { name: '새 버전 적용' }).click(),
  ]);
  await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem('wtools-update-test-loads'))))
    .toBe(2);
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => Number(sessionStorage.getItem('wtools-update-test-loads')))).toBe(2);
});

test('변조된 제3자 응답과 캐시를 폐기하고 한국어 오류를 반환한다', async ({ page }) => {
  await page.goto('/');
  await waitForControl(page);
  const result = await page.evaluate(async () => {
    await import('/js/sw-integrity.js');
    const { verifiedCached, fetchVerified, IntegrityError, integrityErrorResponse } = globalThis.WTOOLS_INTEGRITY;
    const integrity = globalThis.WTOOLS_DEPENDENCIES.cdn.pako.integrity;
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
    let putCalled = false;
    const networkCache = {
      put: async () => { putCalled = true; },
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
      errorCode: response.headers.get('X-WTools-Error'),
      cacheControl: response.headers.get('Cache-Control'),
      cached,
      cachedDeleted,
      fetchedDeleted,
      putCalled,
      integrityError,
    };
  });
  expect(result.status).toBe(502);
  expect(result.body).toContain('무결성 검증에 실패했습니다');
  expect(result.errorCode).toBe('WTI001');
  expect(result.cacheControl).toBe('no-store');
  expect(result.cached).toBeNull();
  expect(result.cachedDeleted).toBe(true);
  expect(result.fetchedDeleted).toBe(true);
  expect(result.putCalled).toBe(false);
  expect(result.integrityError).toBe(true);
});
