import { test, expect } from './helpers.js';

for (const viewport of [
  { name: '데스크톱', width: 1280, height: 800 },
  { name: '모바일', width: 390, height: 844 },
]) {
  for (const theme of ['light', 'dark']) {
    test(`${viewport.name} ${theme} 핵심 화면의 시각 계약`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((value) => localStorage.setItem('wtools-theme', value), theme);
      await page.goto('/');
      await expect(page.locator('.card').first()).toBeVisible();
      const contract = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const first = document.querySelector('.card').getBoundingClientRect();
        return {
          theme: document.documentElement.dataset.theme,
          background: getComputedStyle(document.body).backgroundColor,
          panel: root.getPropertyValue('--panel').trim(),
          text: root.getPropertyValue('--text').trim(),
          cardInside: first.left >= 0 && first.right <= document.documentElement.clientWidth,
          overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        };
      });
      expect(contract.theme).toBe(theme);
      expect(contract.cardInside).toBe(true);
      expect(contract.overflow).toBe(true);
      expect(contract.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(contract.panel).not.toBe(contract.text);
      const screenshot = await page.screenshot({ fullPage: true });
      expect(screenshot.subarray(1, 4).toString()).toBe('PNG');
      expect(screenshot.length).toBeGreaterThan(10_000);
    });
  }
}
