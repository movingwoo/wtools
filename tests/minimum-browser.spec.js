import { test, expect } from '@playwright/test';

test('구형 기준 엔진에서 홈과 지연 로드 도구가 동작한다', async ({ page, browserName }) => {
  const toolRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/js/tools/')) toolRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('.home h1')).toHaveText('W-Tools');
  expect(toolRequests).toEqual([]);
  await page.goto('/#/tool/base64');
  await expect(page.locator('.tool-header h1')).toHaveText('Base64 인코딩/디코딩');
  const io = page.locator('#content .io');
  await io.locator('textarea.mono:not(.out)').fill('최소 브라우저');
  await io.getByRole('button', { name: '인코딩' }).click();
  await expect(io.locator('textarea.out')).not.toHaveValue('');
  const features = await page.evaluate(() => ({
    webcrypto: !!globalThis.crypto?.subtle,
    worker: typeof Worker === 'function',
    canvas: !!document.createElement('canvas').getContext('2d'),
    imageBitmap: typeof createImageBitmap === 'function',
    wasm: typeof WebAssembly === 'object',
  }));
  expect(features, `${browserName} 핵심 API`).toEqual({
    webcrypto: true, worker: true, canvas: true, imageBitmap: true, wasm: true,
  });
});
