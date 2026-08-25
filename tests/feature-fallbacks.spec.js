import { test, expect, openTool, ioSection, uploadFile } from './helpers.js';
import { makePng } from './fixtures.js';

test('WebCrypto가 없으면 키 변환을 한국어로 안내한다', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true }));
  await openTool(page, 'jwk-pem');
  const io = ioSection(page);
  await io.locator('textarea.mono:not(.out)').fill('{"kty":"RSA","n":"AA","e":"AQAB"}');
  await io.getByRole('button', { name: 'JWK → PEM' }).click();
  await expect(io.locator('.error').first()).toContainText('WebCrypto');
});

test('Worker가 없으면 파일 해시를 한국어로 안내한다', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(globalThis, 'Worker', { value: undefined, configurable: true }));
  await openTool(page, 'checksum-file');
  const io = ioSection(page);
  await uploadFile(io, '파일 선택 (여러 개 가능, 브라우저 밖으로 전송되지 않습니다)', {
    name: 'abc.txt', mimeType: 'text/plain', buffer: Buffer.from('abc'),
  });
  await expect(io).toContainText('Worker');
});

test('Worker가 없으면 텍스트 Diff를 한국어로 안내한다', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(globalThis, 'Worker', { value: undefined, configurable: true }));
  await openTool(page, 'text-diff');
  const io = ioSection(page);
  await io.getByRole('button', { name: '비교' }).click();
  await expect(io.locator('.error').first()).toContainText('Web Worker');
});

test('ImageBitmap이 없으면 이미지 변환을 한국어로 안내한다', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(globalThis, 'createImageBitmap', { value: undefined, configurable: true }));
  await openTool(page, 'image-convert');
  const io = ioSection(page);
  await uploadFile(io, '이미지 선택 (여러 장 가능)', {
    name: 'pixel.png', mimeType: 'image/png', buffer: makePng(1, 1, () => [0, 0, 0, 255]),
  });
  await expect(io).toContainText('ImageBitmap');
});

test('Canvas가 없으면 QR 생성을 한국어로 안내한다', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await openTool(page, 'qr-generate');
  await expect(ioSection(page).locator('.error').first()).toContainText('Canvas');
});

test('WebAssembly가 없으면 Argon2를 한국어로 안내한다', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(globalThis, 'WebAssembly', { value: undefined, configurable: true }));
  await openTool(page, 'password-hash');
  const io = ioSection(page);
  await io.getByRole('button', { name: '해시 생성' }).click();
  await expect(io.locator('textarea.out')).toHaveValue(/WebAssembly/);
});

test('클립보드 API가 없으면 복사 실패 이유를 한국어로 제공한다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'clipboard', { value: undefined, configurable: true });
    document.queryCommandSupported = () => false;
  });
  await openTool(page, 'base64');
  const io = ioSection(page);
  await io.locator('textarea.mono:not(.out)').fill('복사 테스트');
  await io.getByRole('button', { name: '인코딩' }).click();
  const copy = io.getByRole('button', { name: '복사' });
  await copy.click();
  await expect(copy).toHaveText(/복사 실패/);
  await expect(copy).toHaveAttribute('title', /클립보드/);
});
