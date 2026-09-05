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

test('구형 기준 엔진에서 자체 DEFLATE·ZIP과 압축 Worker가 동작한다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const codec = await import('/js/lib/archive/deflate.js');
    const source = new TextEncoder().encode('최소 브라우저 DEFLATE 왕복 '.repeat(100));
    const decoder = new TextDecoder();
    const formats = {};
    for (const format of ['gzip', 'zlib', 'raw-deflate']) {
      const packed = await codec.compress(source, { format, level: 1, preferNative: false });
      const unpacked = await codec.decompress(packed, {
        format, maxOutputLength: source.length, preferNative: false,
      });
      formats[format] = decoder.decode(unpacked);
    }

    const worker = new Worker('/js/workers/archive-codec.js', { type: 'module' });
    const request = (payload, transfer) => new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.output);
      worker.onerror = ({ message }) => reject(new Error(message));
      worker.postMessage(payload, transfer);
    });
    const workerInput = source.slice();
    const packed = await request({ codec: 'gzip', action: 'comp', bytes: workerInput, level: 1 },
      [workerInput.buffer]);
    const unpacked = await request({
      codec: 'gzip', action: 'decomp', bytes: packed, level: 1, maxOutputLength: source.length,
    }, [packed.buffer]);
    worker.terminate();

    const { runZipWorker } = await import('/js/lib/archive/zip-worker-client.js');
    const zipInput = source.slice();
    const archive = await runZipWorker('create', {
      entries: [{ name: '한글.txt', data: zipInput }], level: 6,
    });
    const [zipEntry] = await runZipWorker('extract', { bytes: archive });
    return {
      formats,
      worker: decoder.decode(unpacked),
      zip: { name: zipEntry.name, text: decoder.decode(zipEntry.data) },
    };
  });
  const expected = '최소 브라우저 DEFLATE 왕복 '.repeat(100);
  expect(result).toEqual({
    formats: { gzip: expected, zlib: expected, 'raw-deflate': expected },
    worker: expected,
    zip: { name: '한글.txt', text: expected },
  });
});
