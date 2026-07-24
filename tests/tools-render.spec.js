import { test, expect } from '@playwright/test';

// 사이드바에 등록된 모든 도구 페이지를 순회하며
// 렌더링 실패, 처리되지 않은 예외, 콘솔 에러를 전수 검사한다.
test('모든 도구 페이지가 콘솔 에러 없이 렌더링된다', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/');
  const ids = await page.locator('#nav a[data-id]')
    .evaluateAll((els) => [...new Set(els.map((el) => el.dataset.id))]);
  expect(ids.length).toBeGreaterThan(50);
  expect(errors, '홈 로드 중 에러').toEqual([]);

  const failures = [];
  for (const id of ids) {
    await page.goto('/#/tool/' + id);
    try {
      await page.locator('.tool-header h1').waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      failures.push(`${id}: 도구 제목이 렌더링되지 않음`);
    }
    for (const err of errors.splice(0)) failures.push(`${id}: ${err}`);
  }
  expect(failures).toEqual([]);
});
