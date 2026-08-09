// 이미지 / 미디어 / QR 도구 정밀 테스트.
// 이미지는 tests/fixtures.js에서 만들어 업로드하고, 결과는 다운로드 바이트나 캔버스 픽셀로 확인한다.
import { test, expect, toolCase, openTool, ioSection, uploadFile, grabDownload, setOption, fillInputs } from '../helpers.js';
import { makePng, makeJpegWithExif } from '../fixtures.js';

// 왼쪽 위 4×4만 빨강이고 나머지는 흰색인 8×8 이미지 (빨강 25%, 흰색 75%)
const RED_PNG = makePng(8, 8, (x, y) => (x < 4 && y < 4 ? [255, 0, 0] : [255, 255, 255]));
const RED_PNG_B64 = RED_PNG.toString('base64');
// 가로 4색 띠 — 스캔 순서로 색이 연속이라 median cut 결과가 정확히 4색이 된다
const BANDS_PNG = makePng(8, 8, (x, y) => [[255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 0, 0]][y >> 1]);
const CLEAR_PNG = makePng(2, 2, () => [255, 0, 0, 0]);
const TEXT_PNG = makePng(4, 4, () => [0, 128, 255], { text: '지워질 주석' });
const EXIF_JPEG = makeJpegWithExif();

const IMAGE_LABEL = '이미지 선택 (브라우저 밖으로 전송되지 않습니다)';
const PHOTO_LABEL = '사진 선택 (여러 장 가능, 브라우저 밖으로 전송되지 않습니다)';

const cases = [
  /* ---------- wifi-qr: QR에 실리는 payload 문자열 ---------- */
  { name: 'wifi-qr: WPA payload', tool: 'wifi-qr', options: { 'SSID(네트워크명)': 'MyWiFi', '비밀번호': 'pw1234' }, htmlContains: ['WIFI:T:WPA;S:MyWiFi;P:pw1234;;'] },
  { name: 'wifi-qr: 개방 네트워크는 비밀번호 없음', tool: 'wifi-qr', options: { 'SSID(네트워크명)': 'Free', '보안': 'nopass' }, htmlContains: ['WIFI:T:nopass;S:Free;;'] },
  { name: 'wifi-qr: 숨김 네트워크', tool: 'wifi-qr', options: { 'SSID(네트워크명)': 'Hidden', '비밀번호': 'pw', '숨김 네트워크': true }, htmlContains: ['WIFI:T:WPA;S:Hidden;P:pw;H:true;;'] },
  {
    name: 'wifi-qr: 특수문자는 역슬래시로 이스케이프', tool: 'wifi-qr',
    options: { 'SSID(네트워크명)': 'a;b,c:d"e\\f', '비밀번호': 'p;w' },
    htmlContains: ['WIFI:T:WPA;S:a\\;b\\,c\\:d\\"e\\\\f;P:p\\;w;;'],
  },

  /* ---------- base64-image: Base64 → 이미지 ---------- */
  { name: 'base64-image: Data URI 미리보기', tool: 'base64-image', io: 1, inputs: `data:image/png;base64,${RED_PNG_B64}`, htmlContains: ['이미지 저장'] },
  { name: 'base64-image: 순수 Base64는 MIME 옵션 사용', tool: 'base64-image', io: 1, options: { '(순수 Base64인 경우) MIME': 'image/png' }, inputs: RED_PNG_B64, htmlContains: ['이미지 저장'] },

  /* ---------- image-palette ---------- */
  {
    name: 'image-palette: 색이 두 개면 두 항목만 (중복 없음)', tool: 'image-palette',
    upload: { label: IMAGE_LABEL, file: { name: 'red.png', mimeType: 'image/png', buffer: RED_PNG } },
    kv: { '#ffffff': '75.0 %', '#ff0000': '25.0 %' }, paletteCount: 2,
  },
  {
    name: 'image-palette: 4색 띠는 각 25%', tool: 'image-palette',
    upload: { label: IMAGE_LABEL, file: { name: 'bands.png', mimeType: 'image/png', buffer: BANDS_PNG } },
    kv: { '#ff0000': '25.0 %', '#00ff00': '25.0 %', '#0000ff': '25.0 %', '#000000': '25.0 %' },
  },
  {
    name: 'image-palette: 전부 투명하면 에러', tool: 'image-palette',
    upload: { label: IMAGE_LABEL, file: { name: 'clear.png', mimeType: 'image/png', buffer: makePng(4, 4, () => [1, 2, 3, 0]) } },
    htmlError: '색상을 추출할 수 없습니다 (전부 투명한 이미지).',
  },

  /* ---------- exif-viewer ---------- */
  {
    name: 'exif-viewer: EXIF와 GPS 좌표 읽기', tool: 'exif-viewer',
    upload: { label: PHOTO_LABEL, file: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: EXIF_JPEG } },
    kv: { '제조사': 'WTools', '카메라 모델': 'TestCam', '회전(Orientation)': '6', 'GPS 좌표 ⚠': '37.500000, 127.000000' },
    htmlContains: ['제거할 메타데이터: APP1 (EXIF/XMP)'],
  },
  {
    name: 'exif-viewer: PNG의 tEXt 청크도 제거 대상', tool: 'exif-viewer',
    upload: { label: PHOTO_LABEL, file: { name: 'note.png', mimeType: 'image/png', buffer: TEXT_PNG } },
    htmlContains: ['제거할 메타데이터: tEXt'],
  },
  {
    name: 'exif-viewer: 메타데이터가 없으면 안내', tool: 'exif-viewer',
    upload: { label: PHOTO_LABEL, file: { name: 'plain.png', mimeType: 'image/png', buffer: makePng(2, 2, () => [10, 20, 30]) } },
    htmlContains: ['제거할 메타데이터 세그먼트가 없습니다.'],
  },
  {
    name: 'exif-viewer: JPEG/PNG가 아니면 에러', tool: 'exif-viewer',
    upload: { label: PHOTO_LABEL, file: { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('그냥 텍스트') } },
    htmlError: 'JPEG 또는 PNG 파일만 지원합니다.',
  },
];

// 업로드가 필요한 케이스는 makeIO 블록이 아니라 #content 전체를 대상으로 실행한다.
test.describe('media', () => {
  for (const c of cases) {
    if (!c.upload) { toolCase(c); continue; }
    test(c.name, async ({ page }) => {
      await openTool(page, c.tool);
      const content = page.locator('#content');
      await uploadFile(content, c.upload.label, c.upload.file);
      for (const [label, value] of Object.entries(c.options ?? {})) await setOption(content, label, value);
      for (const text of c.htmlContains ?? []) await expect(content).toContainText(text);
      if (c.htmlError) await expect(content.locator('.error').first()).toHaveText(c.htmlError);
      for (const [key, expected] of Object.entries(c.kv ?? {})) {
        await expect(content.locator('table.kv tr').filter({ has: page.getByText(key, { exact: true }) })).toContainText(expected);
      }
      if (c.paletteCount != null) await expect(content.locator('table.kv tr')).toHaveCount(c.paletteCount);
    });
  }
});

/* ---------- QR 생성 → 리더 왕복 ---------- */

async function qrCanvasPng(page) {
  const dataUri = await page.locator('#content canvas').evaluate((canvas) => canvas.toDataURL('image/png'));
  return Buffer.from(dataUri.split(',')[1], 'base64');
}

for (const payload of ['https://github.com', '한글 텍스트 QR 테스트']) {
  test(`qr-generate → qr-read 왕복: ${payload}`, async ({ page }) => {
    await openTool(page, 'qr-generate');
    const io = ioSection(page);
    await fillInputs(io, payload);
    await expect(page.locator('#content canvas')).toBeVisible();
    const png = await qrCanvasPng(page);

    await openTool(page, 'qr-read');
    await uploadFile(page.locator('#content'), 'QR 이미지 선택 (브라우저 밖으로 전송되지 않습니다)', { name: 'qr.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('#content table.kv')).toContainText(payload);
    await expect(page.locator('#content table.kv')).toContainText(`${payload.length}자`);
  });
}

test('qr-generate: PNG 다운로드', async ({ page }) => {
  await openTool(page, 'qr-generate');
  await expect(page.locator('#content canvas')).toBeVisible();
  const png = await grabDownload(page, () => page.getByRole('button', { name: 'PNG 다운로드' }).click());
  expect(png.name).toBe('qrcode.png');
  expect(png.bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
});

test('wifi-qr: 생성한 QR을 리더가 WiFi 정보로 인식', async ({ page }) => {
  await openTool(page, 'wifi-qr');
  const content = page.locator('#content');
  await setOption(content, 'SSID(네트워크명)', '우리집');
  await setOption(content, '비밀번호', 'secret123');
  await expect(content.locator('canvas')).toBeVisible();
  await expect(content.locator('p.mono')).toHaveText('WIFI:T:WPA;S:우리집;P:secret123;;');
  const png = await qrCanvasPng(page);

  await openTool(page, 'qr-read');
  await uploadFile(page.locator('#content'), 'QR 이미지 선택 (브라우저 밖으로 전송되지 않습니다)', { name: 'wifi.png', mimeType: 'image/png', buffer: png });
  const table = page.locator('#content table.kv');
  await expect(table).toContainText('WiFi 접속 정보');
  await expect(table).toContainText('우리집');
  await expect(table).toContainText('secret123');
});

test('qr-read: QR이 없는 이미지는 에러', async ({ page }) => {
  await openTool(page, 'qr-read');
  const content = page.locator('#content');
  await uploadFile(content, 'QR 이미지 선택 (브라우저 밖으로 전송되지 않습니다)', { name: 'red.png', mimeType: 'image/png', buffer: RED_PNG });
  await expect(content.locator('.error')).toContainText('QR 코드를 찾지 못했습니다.');
});

/* ---------- base64-image 왕복 ---------- */

test('base64-image: 이미지 → Base64 → 이미지 왕복', async ({ page }) => {
  await openTool(page, 'base64-image');
  const content = page.locator('#content');

  await uploadFile(content, 'Base64로 변환할 이미지 선택', { name: 'red.png', mimeType: 'image/png', buffer: RED_PNG });
  const uri = content.locator('.io').first().locator('textarea.mono');
  await expect(uri).toHaveValue(`data:image/png;base64,${RED_PNG_B64}`);
  await expect(content.getByText(`Data URI (image/png, ${(RED_PNG.length * 4 / 3 / 1024).toFixed(1)} KB`, { exact: false })).toBeVisible();

  await fillInputs(ioSection(page, 1), await uri.inputValue());
  const saved = await grabDownload(page, () => content.getByRole('button', { name: '이미지 저장' }).click());
  expect(saved.name).toBe('image.png');
  expect(saved.bytes.equals(RED_PNG)).toBe(true);
});

/* ---------- image-convert ---------- */

async function convertOnce(page, { format, options = {} } = {}) {
  const content = page.locator('#content');
  await uploadFile(content, '이미지 선택 (여러 장 가능)', { name: 'red.png', mimeType: 'image/png', buffer: RED_PNG });
  await expect(content.getByText('원본: 8 × 8')).toBeVisible();
  if (format) await setOption(content, '출력 포맷', format);
  for (const [label, value] of Object.entries(options)) await setOption(content, label, value);
  await expect(content.getByText('변환이 완료되었습니다.')).toBeVisible();
  return grabDownload(page, () => content.getByRole('button', { name: '다운로드', exact: true }).click());
}

const formats = [
  { format: 'image/png', name: 'converted.png', magic: '89504e47', label: 'PNG' },
  { format: 'image/jpeg', name: 'converted.jpg', magic: 'ffd8ff', label: 'JPEG' },
  { format: 'image/webp', name: 'converted.webp', magic: '52494646', label: 'WebP' }, // RIFF
  { format: 'image/gif', name: 'converted.gif', magic: '47494638', label: 'GIF' },
  { format: 'image/bmp', name: 'converted.bmp', magic: '424d', label: 'BMP' },
];

test('image-convert: 포맷 한계와 재인코딩 방식을 UI에 표시', async ({ page }) => {
  await openTool(page, 'image-convert');
  const content = page.locator('#content');
  const format = content.getByLabel('출력 포맷');
  await expect(format.locator('option[value="original"]')).toHaveText('원본 포맷 유지 (재인코딩)');
  await expect(format.locator('option[value="image/gif"]')).toHaveText('GIF (단일 프레임)');
  await expect(format.locator('option[value="image/svg+xml"]')).toHaveText('SVG (PNG 포함)');
  await expect(content.locator('.note')).toContainText('애니메이션 입력도 정지 이미지 한 장으로 바뀝니다.');
  await expect(content.locator('.note')).toContainText('벡터화가 아니라 PNG 이미지를 포함한 SVG 파일입니다.');
  await expect(content.getByLabel('JPEG/GIF/BMP 배경색')).toHaveValue('#ffffff');
});

for (const { format, name, magic, label } of formats) {
  test(`image-convert: ${label}로 변환`, async ({ page }) => {
    await openTool(page, 'image-convert');
    const file = await convertOnce(page, { format });
    expect(file.name).toBe(name);
    expect(file.bytes.subarray(0, magic.length / 2).toString('hex')).toBe(magic);
  });
}

test('image-convert: SVG는 PNG를 내장한 SVG 파일', async ({ page }) => {
  await openTool(page, 'image-convert');
  const file = await convertOnce(page, { format: 'image/svg+xml' });
  expect(file.name).toBe('converted.svg');
  expect(file.bytes.toString()).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"');
  expect(file.bytes.toString()).toContain('href="data:image/png;base64,');
});

test('image-convert: BMP 인코더는 24비트 무압축 헤더를 만든다', async ({ page }) => {
  await openTool(page, 'image-convert');
  const file = await convertOnce(page, { format: 'image/bmp' });
  const rowSize = Math.ceil(8 * 3 / 4) * 4; // 4바이트 정렬
  expect(file.bytes.readUInt32LE(2)).toBe(54 + rowSize * 8); // 파일 크기
  expect(file.bytes.readUInt32LE(10)).toBe(54); // 픽셀 데이터 오프셋
  expect(file.bytes.readInt32LE(18)).toBe(8); // 폭
  expect(file.bytes.readInt32LE(22)).toBe(8); // 높이
  expect(file.bytes.readUInt16LE(28)).toBe(24); // 비트 수
});

test('image-convert: 투명 픽셀을 선택한 BMP 배경색으로 합성', async ({ page }) => {
  await openTool(page, 'image-convert');
  const content = page.locator('#content');
  await setOption(content, '출력 포맷', 'image/bmp');
  await setOption(content, 'JPEG/GIF/BMP 배경색', '#00ff00');
  await uploadFile(content, '이미지 선택 (여러 장 가능)', { name: 'clear.png', mimeType: 'image/png', buffer: CLEAR_PNG });
  await expect(content.getByText('변환이 완료되었습니다.')).toBeVisible();
  const file = await grabDownload(page, () => content.getByRole('button', { name: '다운로드', exact: true }).click());
  expect(file.bytes.subarray(54, 57)).toEqual(Buffer.from([0, 255, 0])); // BMP의 BGR 순서
});

test('image-convert: 비율 축소', async ({ page }) => {
  await openTool(page, 'image-convert');
  const content = page.locator('#content');
  await uploadFile(content, '이미지 선택 (여러 장 가능)', { name: 'red.png', mimeType: 'image/png', buffer: RED_PNG });
  await expect(content.getByText('원본: 8 × 8')).toBeVisible();
  await setOption(content, '크기(%)', '50');
  await expect(content.getByText('4 × 4,', { exact: false })).toBeVisible();
});

test('image-convert: 확대하지 않기 옵션', async ({ page }) => {
  await openTool(page, 'image-convert');
  const content = page.locator('#content');
  await uploadFile(content, '이미지 선택 (여러 장 가능)', { name: 'red.png', mimeType: 'image/png', buffer: RED_PNG });
  await expect(content.getByText('원본: 8 × 8')).toBeVisible();
  await setOption(content, '크기(%)', '200');
  await expect(content.getByText('8 × 8,', { exact: false })).toBeVisible(); // 확대되지 않음

  await setOption(content, '확대하지 않기', false);
  await expect(content.getByText('16 × 16,', { exact: false })).toBeVisible();
});

test('image-convert: 여러 장은 ZIP으로 묶어 받는다', async ({ page }) => {
  await openTool(page, 'image-convert');
  const content = page.locator('#content');
  await uploadFile(content, '이미지 선택 (여러 장 가능)', [
    { name: 'a.png', mimeType: 'image/png', buffer: RED_PNG },
    { name: 'b.png', mimeType: 'image/png', buffer: BANDS_PNG },
  ]);
  await expect(content.getByText('2개 파일 선택됨')).toBeVisible();
  const zip = await grabDownload(page, () => content.getByRole('button', { name: '전체 ZIP 다운로드 (2개)' }).click());
  expect(zip.name).toBe('converted.zip');
  expect(zip.bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
  expect(zip.bytes.toString('latin1')).toContain('a.png');
  expect(zip.bytes.toString('latin1')).toContain('b.png');
});

/* ---------- bg-remove ---------- */

test('bg-remove: 흰 배경이 투명해지고 픽셀은 남는다', async ({ page }) => {
  await openTool(page, 'bg-remove');
  const content = page.locator('#content');
  await uploadFile(content, IMAGE_LABEL, { name: 'red.png', mimeType: 'image/png', buffer: RED_PNG });

  await expect(content.getByText('#ffffff', { exact: false })).toBeVisible(); // 모서리에서 배경색 자동 감지
  await expect(content.getByText('8 × 8, 75.0% 투명 처리', { exact: false })).toBeVisible();

  // 배경(오른쪽 아래)은 알파 0, 빨강 영역(왼쪽 위)은 그대로 남아야 한다
  const pixels = await content.locator('canvas').evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    return { bg: [...ctx.getImageData(7, 7, 1, 1).data], fg: [...ctx.getImageData(1, 1, 1, 1).data] };
  });
  expect(pixels.bg[3]).toBe(0);
  expect(pixels.fg).toEqual([255, 0, 0, 255]);

  const png = await grabDownload(page, () => content.getByRole('button', { name: 'PNG 다운로드' }).click());
  expect(png.name).toBe('transparent.png');
  expect(png.bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
});

/* ---------- exif-viewer 다운로드 ---------- */

test('exif-viewer: JPEG에서 APP1만 제거하고 나머지는 그대로', async ({ page }) => {
  await openTool(page, 'exif-viewer');
  const content = page.locator('#content');
  await uploadFile(content, PHOTO_LABEL, { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: EXIF_JPEG });

  const clean = await grabDownload(page, () => content.getByRole('button', { name: '메타데이터 제거본 다운로드' }).click());
  expect(clean.name).toBe('photo_clean.jpg');
  expect(clean.bytes.includes(Buffer.from('Exif'))).toBe(false);
  // SOI + SOS 이후 원본 그대로
  const sos = EXIF_JPEG.indexOf(Buffer.from([0xff, 0xda]));
  expect(clean.bytes.equals(Buffer.concat([EXIF_JPEG.subarray(0, 2), EXIF_JPEG.subarray(sos)]))).toBe(true);
});

test('exif-viewer: PNG에서 tEXt만 제거하고 픽셀 데이터는 유지', async ({ page }) => {
  await openTool(page, 'exif-viewer');
  const content = page.locator('#content');
  await uploadFile(content, PHOTO_LABEL, { name: 'note.png', mimeType: 'image/png', buffer: TEXT_PNG });

  const clean = await grabDownload(page, () => content.getByRole('button', { name: '메타데이터 제거본 다운로드' }).click());
  expect(clean.name).toBe('note_clean.png');
  expect(clean.bytes.includes(Buffer.from('tEXt'))).toBe(false);
  // 같은 픽셀의 tEXt 없는 PNG와 바이트 단위로 같아야 한다
  expect(clean.bytes.equals(makePng(4, 4, () => [0, 128, 255]))).toBe(true);
});

/* ---------- favicon-gen ---------- */

test('favicon-gen: ICO와 크기별 PNG 생성', async ({ page }) => {
  await openTool(page, 'favicon-gen');
  const content = page.locator('#content');
  await uploadFile(content, '이미지 선택 (512px 이상 정사각형 권장)', { name: 'red.png', mimeType: 'image/png', buffer: RED_PNG });

  await expect(content.locator('canvas')).toHaveCount(6);
  expect(await content.locator('canvas').evaluateAll((list) => list.map((c) => [c.width, c.height])))
    .toEqual([[16, 16], [32, 32], [48, 48], [180, 180], [192, 192], [512, 512]]);
  await expect(content.locator('textarea.mono')).toHaveValue(
    '<link rel="icon" href="/favicon.ico" sizes="32x32">\n'
    + '<link rel="icon" type="image/png" href="/favicon-192.png" sizes="192x192">\n'
    + '<link rel="apple-touch-icon" href="/apple-touch-icon.png">');

  const ico = await grabDownload(page, () => content.getByRole('button', { name: 'favicon.ico 다운로드 (16+32+48)' }).click());
  expect(ico.name).toBe('favicon.ico');
  expect(ico.bytes.readUInt16LE(0)).toBe(0); // reserved
  expect(ico.bytes.readUInt16LE(2)).toBe(1); // type: icon
  expect(ico.bytes.readUInt16LE(4)).toBe(3); // 16, 32, 48
  expect([...ico.bytes.subarray(6, 8)]).toEqual([16, 16]);
  expect([...ico.bytes.subarray(22, 24)]).toEqual([32, 32]);
  expect([...ico.bytes.subarray(38, 40)]).toEqual([48, 48]);

  const png48 = await grabDownload(page, () => content.getByRole('button', { name: '48px' }).click());
  expect(png48.name).toBe('favicon-48.png');
  expect(png48.bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

  const apple = await grabDownload(page, () => content.getByRole('button', { name: '180px' }).click());
  expect(apple.name).toBe('apple-touch-icon.png');
});

/* ---------- image-palette 옵션 ---------- */

test('image-palette: 색상 수 옵션', async ({ page }) => {
  await openTool(page, 'image-palette');
  const content = page.locator('#content');
  // 8단계 회색 그라데이션 — 요청한 색 수만큼 나온다
  const gray = makePng(8, 8, (x, y) => [y * 32, y * 32, y * 32]);
  await uploadFile(content, IMAGE_LABEL, { name: 'gray.png', mimeType: 'image/png', buffer: gray });
  await expect(content.locator('table.kv tr')).toHaveCount(8);

  await setOption(content, '추출 색상 수', '4');
  await expect(content.locator('table.kv tr')).toHaveCount(4);
});
