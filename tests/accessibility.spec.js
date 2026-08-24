import { readFileSync } from 'node:fs';
import { test, expect, openTool } from './helpers.js';

const axeSource = readFileSync(new URL('./node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

test.use({ bypassCSP: true });

async function expectAccessible(page, context) {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  }));
  const summary = results.violations.map(({ id, nodes }) => ({
    id,
    targets: nodes.map((node) => node.target.join(' ')),
  }));
  expect(summary, `${context} 접근성 위반`).toEqual([]);
}

for (const entry of [
  { name: '홈', open: async (page) => page.goto('/') },
  { name: '검색 결과', open: async (page) => { await page.goto('/'); await page.locator('#search').fill('base64'); } },
  { name: '표준 입출력', open: async (page) => openTool(page, 'base64') },
  { name: '파일 UI', open: async (page) => openTool(page, 'image-convert') },
  { name: '카메라 UI', open: async (page) => openTool(page, 'qr-read') },
]) {
  test(`${entry.name} 화면은 자동 WCAG 검사를 통과한다`, async ({ page }) => {
    await entry.open(page);
    await expectAccessible(page, entry.name);
  });
}

test('320px·200% 확대·키보드·감소 모션에서 핵심 흐름을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto('/#/tool/base64');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.locator('#menu-btn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  await page.locator('#search').fill('URL');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#search')).toHaveAttribute('aria-activedescendant', /nav-tool-/);
  expect(await page.locator('#sidebar').screenshot()).not.toHaveLength(0);
});
