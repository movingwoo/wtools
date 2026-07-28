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
  // 도구 id와 사이드바에 표시되는 이름을 함께 모은다 (이름으로 실제 전환 여부를 확인).
  const entries = await page.locator('#nav a[data-id]').evaluateAll((els) => {
    const seen = new Map();
    for (const el of els) if (!seen.has(el.dataset.id)) seen.set(el.dataset.id, el.textContent.trim());
    return [...seen].map(([id, name]) => ({ id, name }));
  });
  expect(entries.length).toBeGreaterThan(50);
  expect(errors, '홈 로드 중 에러').toEqual([]);

  const failures = [];
  for (const { id, name } of entries) {
    await page.goto('/#/tool/' + id);
    // 해시만 바뀌는 이동이라 페이지가 새로 로드되지 않는다. 제목이 "보이는지"만 보면
    // 직전 도구의 제목이 남아 있어도 통과하므로, 해당 도구 이름과 일치하는지까지 확인한다.
    try {
      await expect(page.locator('.tool-header h1')).toHaveText(name, { timeout: 5000 });
    } catch {
      failures.push(`${id}: 도구 제목이 "${name}"으로 렌더링되지 않음`);
    }
    // 라우터는 render() 예외를 잡아 안내 문단으로 바꾸므로, 그 문단이 있는지 직접 확인해야 한다.
    const loadError = page.locator('#content p.error', { hasText: '도구 로드 중 오류' });
    if (await loadError.count()) failures.push(`${id}: ${(await loadError.first().innerText()).trim()}`);
    // 아무것도 그리지 않고 조용히 끝난 도구도 실패로 본다.
    if (!(await page.locator('#content .tool-body').innerHTML()).trim())
      failures.push(`${id}: 도구 본문이 비어 있음`);
    for (const err of errors.splice(0)) failures.push(`${id}: ${err}`);
  }
  expect(failures).toEqual([]);
});
