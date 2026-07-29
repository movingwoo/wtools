import { test as base, expect } from '@playwright/test';
import { cdnCache } from './cdn-cache.js';

// 모든 테스트에서 콘솔 에러와 처리되지 않은 예외를 수집하고, 테스트 끝에 0건임을 확인한다.
const test = base.extend({
  ...cdnCache,
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

test('CSP가 \'unsafe-eval\' 없이 적용된다', async ({ page }) => {
  await page.goto('/');
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toBeTruthy();
  expect(policy).not.toContain("'unsafe-eval'");
});

test('모바일의 닫힌 사이드바를 건너뛰고 본문으로 이동한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/tool/base64');

  const sidebar = page.locator('#sidebar');
  const skipLink = page.getByRole('link', { name: '본문 바로가기' });
  const firstToolLink = page.locator('#nav a[data-id]').first();

  await expect(sidebar).toHaveAttribute('inert', '');
  await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
  await firstToolLink.evaluate((link) => link.focus());
  await expect(firstToolLink).not.toBeFocused();

  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#content')).toBeFocused();
  await expect(page).toHaveURL(/#\/tool\/base64$/);

  await page.locator('#menu-btn').click();
  await expect(sidebar).not.toHaveAttribute('inert', '');
  await expect(sidebar).not.toHaveAttribute('aria-hidden', 'true');
  await expect(firstToolLink).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(sidebar).not.toHaveAttribute('inert', '');
  await expect(sidebar).toBeVisible();
});

test('저장소 쓰기가 차단되어도 즐겨찾기와 메뉴 접기가 동작한다', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('저장소 쓰기 차단', 'QuotaExceededError');
    };
  });
  await page.goto('/');

  const star = page.locator('.card .star-btn').first();
  await star.click();
  await expect(star).toHaveClass(/active/);

  const category = page.locator('#nav .cat:not(.favorites)').first();
  await category.locator('.cat-title').click();
  await expect(category).toHaveClass(/collapsed/);
});

test('좁은 화면에서 공통 레이아웃이 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(page.locator('.card-grid').first()).toHaveCSS('grid-template-columns', '296px');

  await page.goto('/#/tool/uuid-generate');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const alphabet = page.getByLabel('NanoID 알파벳');
  await expect(alphabet).toHaveCSS('width', '296px');
});

test('시스템·라이트·다크 테마를 전환하고 선택을 유지한다', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  const root = page.locator('html');
  const body = page.locator('body');
  const themeColor = page.locator('#theme-color');
  const toggle = page.locator('#theme-toggle');

  await expect(toggle).toContainText('시스템');
  await expect(root).not.toHaveAttribute('data-theme');
  await expect(body).toHaveCSS('background-color', 'rgb(14, 17, 22)');
  await expect(themeColor).toHaveAttribute('content', '#0e1116');

  await toggle.click();
  await expect(toggle).toContainText('라이트');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(body).toHaveCSS('background-color', 'rgb(246, 247, 249)');
  await expect(themeColor).toHaveAttribute('content', '#2563eb');

  await toggle.click();
  await expect(toggle).toContainText('다크');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(toggle).toContainText('다크');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('wtools-theme'))).toBe('dark');

  await toggle.click();
  await expect(toggle).toContainText('시스템');
  await expect(root).not.toHaveAttribute('data-theme');
  await expect(themeColor).toHaveAttribute('content', '#0e1116');
  expect(await page.evaluate(() => localStorage.getItem('wtools-theme'))).toBe('system');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(body).toHaveCSS('background-color', 'rgb(246, 247, 249)');
  await expect(themeColor).toHaveAttribute('content', '#2563eb');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#menu-btn').click();
  await expect(toggle).toBeVisible();
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
