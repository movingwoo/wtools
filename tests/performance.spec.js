import { test, expect } from './helpers.js';

test('홈은 도구 구현 없이 초기 JavaScript 예산 안에서 상호작용 가능해진다', async ({ page }) => {
  const toolRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/js/tools/')) toolRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  expect(toolRequests).toEqual([]);
  const metrics = await page.evaluate(() => {
    const localScripts = performance.getEntriesByType('resource').filter((entry) => {
      const url = new URL(entry.name);
      return url.origin === location.origin && url.pathname.startsWith('/js/');
    });
    return {
      bytes: localScripts.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
      readyMs: performance.now(),
      paths: localScripts.map((entry) => new URL(entry.name).pathname),
    };
  });
  expect(metrics.paths).not.toContainEqual(expect.stringMatching(/^\/js\/tools\//));
  expect(metrics.bytes).toBeLessThanOrEqual(140 * 1024);
  expect(metrics.readyMs).toBeLessThan(2_500);
});

test.describe('도구 모듈 장애 격리', () => {
  test.use({ allowConsoleErrors: ['Failed to load resource'] });

  test('한 모듈 실패는 홈을 중단하지 않고 재시도할 수 있다', async ({ page }) => {
    const route = '**/js/tools/encoding.js*';
    await page.route(route, (request) => request.fulfill({ status: 503, body: '일시 오류' }));
    await page.goto('/#/tool/base64');
    await expect(page.locator('#content')).toContainText('MOD001');
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();

    await page.unroute(route);
    await page.getByRole('button', { name: '다시 시도' }).click();
    await expect(page.locator('.tool-header h1')).toHaveText('Base64 인코딩/디코딩');
    await expect(page.locator('#content .io')).toBeVisible();

    await page.locator('.brand').click();
    await expect(page.locator('.home h1')).toHaveText('W-Tools');
  });
});
