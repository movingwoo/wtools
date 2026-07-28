// 압축 / 아카이브 도구 정밀 테스트.
// 다른 구현(node zlib, python bz2/lzma)이 만든 벡터를 해제해 교차 검증하고,
// 압축 → 해제 왕복과 파일 업로드/다운로드 경로를 확인한다.
import { test, expect, toolCases, openTool, ioSection, runIO, uploadFile, grabDownload } from '../helpers.js';

const MSG = 'hello wtools compression test\n'.repeat(3); // 90바이트
// 원문 MSG를 다른 구현으로 압축한 벡터: node zlib(gzip/deflate/deflateRaw), python bz2/lzma(FORMAT_ALONE)
const V = {
  gzip: 'H4sIAAAAAAAAA8tIzcnJVygvyc/PKVZIzs8tKEotLs7Mz1MoSS0u4cqgQBYAE7HjZFoAAAA=',
  zlib: 'eJzLSM3JyVcoL8nPzylWSM7PLShKLS7OzM9TKEktLuHKoEAWADtGIsk=',
  raw: 'y0jNyclXKC/Jz88pVkjOzy0oSi0uzszPUyhJLS7hyqBAFgA=',
  bz2: 'QlpoOTFBWSZTWc+dPa0AAA1RgAAQQAAKZ9yAIABQpgAAr/VKGNTGopTTa6VMMsvW0rWhDTbLimEpshx8h+LuSKcKEhnzp7Wg',
  lzma: 'XQAAgAD//////////wA0GUnujekXifvO8YJ1YBGu5fh8G5dj9UBAJ1xbGXBa+ARSWXJ/+RdsAA==',
};
// MSG의 raw deflate 스트림 (pako와 node zlib이 동일하게 만든다). 앞뒤로 포맷별 헤더와 체크섬이 붙는다.
const DEFLATE_HEX = 'cb48cdc9c957282fc9cfcf295648cecf2d284a2d2ececccf5328492d2ee1caa0401600';
const B64 = { '입력 형식': 'base64', '출력 형식': 'text' };

const cases = [
  /* ---------- 다른 구현이 만든 벡터 해제 ---------- */
  { name: 'gzip: node zlib 벡터 해제', tool: 'gzip', options: B64, inputs: V.gzip, action: '해제', output: MSG },
  { name: 'zlib: node zlib 벡터 해제', tool: 'zlib', options: B64, inputs: V.zlib, action: '해제', output: MSG },
  { name: 'raw-deflate: node zlib 벡터 해제', tool: 'raw-deflate', options: B64, inputs: V.raw, action: '해제', output: MSG },
  { name: 'lzma: python lzma(alone) 벡터 해제', tool: 'lzma', options: B64, inputs: V.lzma, action: '해제', output: MSG },
  { name: 'bzip2: python bz2 벡터 해제', tool: 'bzip2', io: 0, options: B64, inputs: V.bz2, action: '해제', output: MSG },

  /* ---------- 압축 결과 (포맷 헤더까지 확인) ---------- */
  {
    name: 'gzip: 압축 결과는 1f8b08 헤더 + deflate 스트림', tool: 'gzip', options: { '출력 형식': 'hex' }, inputs: MSG, action: '압축',
    // 끝 8바이트는 crc-32와 원본 길이
    output: '1f8b0800000000000003' + DEFLATE_HEX + '13b1e3645a000000\n\n// 원본 90B → 53B (41.1% 감소)',
  },
  {
    name: 'zlib: 레벨 6은 789c 헤더', tool: 'zlib', options: { '출력 형식': 'hex' }, inputs: MSG, action: '압축',
    output: '789c' + DEFLATE_HEX + '3b4622c9\n\n// 원본 90B → 41B (54.4% 감소)', // 끝 4바이트는 adler-32
  },
  { name: 'zlib: 레벨 1은 7801 헤더', tool: 'zlib', options: { '출력 형식': 'hex', '압축 레벨': '1' }, inputs: MSG, action: '압축', output: '7801' + DEFLATE_HEX + '3b4622c9\n\n// 원본 90B → 41B (54.4% 감소)' },
  { name: 'zlib: 레벨 9는 78da 헤더', tool: 'zlib', options: { '출력 형식': 'hex', '압축 레벨': '9' }, inputs: MSG, action: '압축', output: '78da' + DEFLATE_HEX + '3b4622c9\n\n// 원본 90B → 41B (54.4% 감소)' },
  { name: 'raw-deflate: 압축 결과가 node zlib과 일치', tool: 'raw-deflate', inputs: MSG, action: '압축', output: V.raw + '\n\n// 원본 90B → 35B (61.1% 감소)' },
  {
    // 5d = lc/lp/pb 기본값, 00002000 = 사전 크기, 5a00000000000000 = 원본 90바이트 (리틀엔디언)
    name: 'lzma: 압축 결과는 props·사전 크기·원본 길이 헤더로 시작', tool: 'lzma', options: { '출력 형식': 'hex' }, inputs: MSG, action: '압축',
    output: /^5d000020005a00000000000000.*\n\n\/\/ 원본 90B → 55B \(38\.9% 감소\)$/s,
  },
  { name: 'lz4: 압축 결과는 프레임 매직 04224d18로 시작', tool: 'lz4', options: { '출력 형식': 'hex' }, inputs: MSG, action: '압축', output: /^04224d18.*\n\n\/\/ 원본 90B → 56B \(37\.8% 감소\)$/s },

  /* ---------- 입출력 형식 ---------- */
  { name: 'gzip: Hex 입력도 같은 결과', tool: 'gzip', options: { '입력 형식': 'hex', '출력 형식': 'hex' }, inputs: '414243', action: '압축', output: /^1f8b0800000000000003/ },
  { name: 'zlib: 해제 결과를 Hex로 출력', tool: 'zlib', options: { '입력 형식': 'base64', '출력 형식': 'hex' }, inputs: 'eJxzBAAAQgBC', action: '해제', output: '41' },

  /* ---------- 오류 처리 ---------- */
  { name: 'gzip: 잘못된 데이터 해제는 에러', tool: 'gzip', options: { '입력 형식': 'base64' }, inputs: 'AAAA', action: '해제', error: 'unknown compression method' },
  { name: 'zlib: 잘못된 데이터 해제는 에러', tool: 'zlib', options: { '입력 형식': 'base64' }, inputs: 'AAAA', action: '해제', error: 'unknown compression method' },
  { name: 'lz4: 매직 넘버가 아니면 에러', tool: 'lz4', options: { '입력 형식': 'base64' }, inputs: 'AAAA', action: '해제', error: 'invalid magic number' },
  { name: 'lzma: 잘린 입력은 에러', tool: 'lzma', options: { '입력 형식': 'base64' }, inputs: 'AAAA', action: '해제', error: '해제 실패: Error: truncated input' },
  { name: 'bzip2: bzip2 데이터가 아니면 에러', tool: 'bzip2', io: 0, options: { '입력 형식': 'base64' }, inputs: 'AAAA', action: '해제', error: 'Not bzip data: bad magic' },
];

toolCases('archive', cases);

/* ---------- 압축 → 해제 왕복 ---------- */

const roundTrips = [
  { tool: 'gzip', name: 'Gzip' },
  { tool: 'zlib', name: 'Zlib' },
  { tool: 'raw-deflate', name: 'Raw Deflate' },
  { tool: 'lzma', name: 'LZMA' },
  { tool: 'lz4', name: 'LZ4' },
];

for (const { tool, name } of roundTrips) {
  test(`${tool}: ${name} 압축 → 해제 왕복 (한글 포함)`, async ({ page }) => {
    await openTool(page, tool);
    const io = ioSection(page);
    const src = '압축 왕복 테스트 — WTools 🎁\n'.repeat(4);
    const packed = await runIO(io, { options: { '출력 형식': 'base64' }, inputs: src, action: '압축' });
    const base64 = packed.split('\n')[0];
    const back = await runIO(io, { options: { '입력 형식': 'base64', '출력 형식': 'text' }, inputs: base64, action: '해제' });
    expect(back).toBe(src);
  });
}

/* ---------- 파일 업로드 / 다운로드 ---------- */

test('gzip: 파일 압축 → 해제 왕복', async ({ page }) => {
  await openTool(page, 'gzip');
  const content = page.locator('#content');
  const fileRow = content.locator('.btn-row').filter({ hasText: '압축 (.gz)' });

  await uploadFile(content, '압축하거나 해제할 파일 선택', { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from(MSG) });
  const gz = await grabDownload(page, () => fileRow.getByRole('button', { name: '압축 (.gz)' }).click());
  expect(gz.name).toBe('note.txt.gz');
  expect(gz.bytes.subarray(0, 3).toString('hex')).toBe('1f8b08');
  await expect(content.getByText('note.txt (90 B) → note.txt.gz (53 B) — 41.1% 감소')).toBeVisible();

  await uploadFile(content, '압축하거나 해제할 파일 선택', { name: 'note.txt.gz', mimeType: 'application/gzip', buffer: gz.bytes });
  const back = await grabDownload(page, () => fileRow.getByRole('button', { name: '해제', exact: true }).click());
  expect(back.name).toBe('note.txt');
  expect(back.bytes.toString()).toBe(MSG);
});

test('zip: 파일 묶기 → 풀기 왕복', async ({ page }) => {
  await openTool(page, 'zip');
  const content = page.locator('#content');
  const first = Buffer.from('첫 번째 파일');
  const second = Buffer.from([1, 2, 3, 4]);

  await uploadFile(content, 'ZIP에 추가할 파일 선택', [
    { name: 'a.txt', mimeType: 'text/plain', buffer: first },
    { name: 'dir/b.bin', mimeType: 'application/octet-stream', buffer: second },
  ]);
  await expect(content.getByText('a.txt (17 B)')).toBeVisible();

  const zip = await grabDownload(page, () => content.getByRole('button', { name: 'ZIP 다운로드' }).click());
  expect(zip.name).toBe('wtools.zip');
  expect(zip.bytes.subarray(0, 4).toString('hex')).toBe('504b0304'); // PK\x03\x04

  await uploadFile(content, '해제할 ZIP 파일 선택', { name: 'wtools.zip', mimeType: 'application/zip', buffer: zip.bytes });
  const table = content.locator('table.grid');
  await expect(table).toContainText('a.txt');
  await expect(table).toContainText('dir/b.bin'); // 경로가 있는 항목도 유지
  await expect(table).toContainText('17 B');

  const saved = await grabDownload(page, () => table.locator('tr').nth(1).getByRole('button', { name: '저장' }).click());
  expect(saved.name).toBe('a.txt');
  expect(saved.bytes.equals(first)).toBe(true);
});

test('tar: 파일 묶기 → 풀기 왕복 (.tar)', async ({ page }) => {
  await openTool(page, 'tar');
  const content = page.locator('#content');
  const first = Buffer.from('tar 첫 파일');

  await uploadFile(content, 'Tar에 추가할 파일 선택', [
    { name: 'a.txt', mimeType: 'text/plain', buffer: first },
    { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('tar 두 번째') },
  ]);
  const tar = await grabDownload(page, () => content.getByRole('button', { name: 'Tar 다운로드' }).click());
  expect(tar.name).toBe('wtools.tar');
  expect(tar.bytes.subarray(257, 262).toString()).toBe('ustar'); // POSIX tar 시그니처
  expect(tar.bytes.length).toBe(3072); // 헤더+데이터 512×2 + 종료 블록 1024

  await uploadFile(content, '해제할 Tar 파일 선택', { name: 'wtools.tar', mimeType: 'application/x-tar', buffer: tar.bytes });
  const table = content.locator('table.grid');
  await expect(table).toContainText('a.txt');
  await expect(table).toContainText('b.txt');

  const saved = await grabDownload(page, () => table.locator('tr').nth(1).getByRole('button', { name: '저장' }).click());
  expect(saved.name).toBe('a.txt');
  expect(saved.bytes.equals(first)).toBe(true);
});

test('tar: gzip 옵션은 .tar.gz로 묶고 풀 때 자동 해제', async ({ page }) => {
  await openTool(page, 'tar');
  const content = page.locator('#content');

  await uploadFile(content, 'Tar에 추가할 파일 선택', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('tar gzip 테스트') });
  await content.getByLabel('gzip 압축 (.tar.gz)').check();
  const tgz = await grabDownload(page, () => content.getByRole('button', { name: 'Tar 다운로드' }).click());
  expect(tgz.name).toBe('wtools.tar.gz');
  expect(tgz.bytes.subarray(0, 2).toString('hex')).toBe('1f8b');

  await uploadFile(content, '해제할 Tar 파일 선택', { name: 'wtools.tar.gz', mimeType: 'application/gzip', buffer: tgz.bytes });
  await expect(content.locator('table.grid')).toContainText('a.txt');
});

test('bzip2: 파일 해제와 미리보기', async ({ page }) => {
  await openTool(page, 'bzip2');
  const content = page.locator('#content');

  await uploadFile(content, '해제할 Bzip2 파일 선택', { name: 'note.txt.bz2', mimeType: 'application/x-bzip2', buffer: Buffer.from(V.bz2, 'base64') });
  await expect(content.locator('pre.out-html').first()).toHaveText(MSG);
  await expect(content.getByText('note.txt.bz2 → 90 bytes')).toBeVisible();

  const saved = await grabDownload(page, () => content.getByRole('button', { name: '다운로드' }).click());
  expect(saved.name).toBe('note.txt');
  expect(saved.bytes.toString()).toBe(MSG);
});
