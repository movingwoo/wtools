import { test as base, expect } from '@playwright/test';
import { cdnCache } from './cdn-cache.js';

const test = base.extend({ ...cdnCache });
test.use({ allowServiceWorker: true });

test('manifest·아이콘·시작 URL이 Chromium 설치 가능성 검사를 통과한다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const session = await page.context().newCDPSession(page);
  const appManifest = await session.send('Page.getAppManifest');
  expect(appManifest.errors).toEqual([]);
  expect(appManifest.data).toContain('"id": "./"');

  const manifest = await page.evaluate(() => fetch('manifest.json').then((response) => response.json()));
  expect(manifest.id).toBe('./');
  expect(manifest.start_url).toBe('./');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512', '512x512']);
  const iconSizes = await page.evaluate(async (icons) => Promise.all(icons.map((icon) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(`${image.naturalWidth}x${image.naturalHeight}`);
    image.onerror = reject;
    image.src = icon.src;
  }))), manifest.icons);
  expect(iconSizes).toEqual(['192x192', '512x512', '512x512']);

  const installability = await session.send('Page.getInstallabilityErrors');
  expect(installability.installabilityErrors).toEqual([]);
});
