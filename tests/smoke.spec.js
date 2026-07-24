import { test as base, expect } from '@playwright/test';

// 모든 테스트에서 콘솔 에러와 처리되지 않은 예외를 수집하고, 테스트 끝에 0건임을 확인한다.
const test = base.extend({
  pageErrors: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    await use(errors);
  },
});

test.afterEach(async ({ pageErrors }) => {
  expect(pageErrors).toEqual([]);
});

test('홈 화면이 렌더링된다', async ({ page, pageErrors }) => {
  await page.goto('/');
  await expect(page.locator('.home h1')).toHaveText('W-Tools');
  await expect(page.locator('.card').first()).toBeVisible();
  // 사이드바에 도구 목록이 채워져야 한다.
  expect(await page.locator('#nav a[data-id]').count()).toBeGreaterThan(30);
});

test('검색이 도구를 필터링한다', async ({ page }) => {
  await page.goto('/');
  await page.fill('#search', 'base64');
  await expect(page.locator('#nav a[data-id="base64"]')).toBeVisible();
  // 검색어와 무관한 도구는 숨겨진다.
  await expect(page.locator('#nav a[data-id="url-parser"]')).toBeHidden();
});

test('해시 라우팅 직접 진입과 새로고침이 동작한다', async ({ page }) => {
  await page.goto('/#/tool/url-encode');
  await expect(page.locator('.tool-header h1')).toHaveText('URL 인코딩/디코딩');
  await expect(page.locator('#content textarea.mono').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.tool-header h1')).toHaveText('URL 인코딩/디코딩');
});

test('사이드바 하단까지 스크롤해도 즐겨찾기 별을 클릭할 수 있다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#sidebar').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(page.locator('#sidebar-top')).toBeVisible();
  // 고정된 '맨 위로' 버튼이 별 버튼을 가리면 실좌표 클릭이 가로채져 즐겨찾기가 토글되지 않는다.
  const lastStar = page.locator('#nav .nav-item .star-btn').last();
  const box = await lastStar.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(lastStar).toHaveText('★');
});

test('Base64 도구가 입력을 변환한다', async ({ page }) => {
  await page.goto('/#/tool/base64');
  const input = page.locator('#content textarea.mono:not(.out)').first();
  const output = page.locator('#content textarea.out');

  // 입력 즉시 자동 실행(첫 액션 = 인코딩).
  await input.fill('Hello, World!');
  await expect(output).toHaveValue('SGVsbG8sIFdvcmxkIQ==');

  // 액션 버튼 클릭으로 디코딩.
  await input.fill('SGVsbG8=');
  await page.getByRole('button', { name: '디코딩' }).click();
  await expect(output).toHaveValue('Hello');
});
