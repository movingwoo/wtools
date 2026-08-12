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

test('사이드바에서 GitHub 저장소 링크를 제공한다', async ({ page }) => {
  await page.goto('/');

  const repositoryLink = page.getByRole('link', { name: 'GitHub 저장소 (새 창)' });
  await expect(repositoryLink).toBeVisible();
  await expect(repositoryLink).toHaveAttribute('href', 'https://github.com/movingwoo/wtools');
  await expect(repositoryLink).toHaveAttribute('target', '_blank');
  await expect(repositoryLink).toHaveAttribute('rel', 'noopener');

  await page.locator('.brand').focus();
  await page.keyboard.press('Tab');
  await expect(repositoryLink).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#theme-toggle')).toBeFocused();
});

test('검색 및 공유 메타데이터와 크롤러 문서를 제공한다', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    '브라우저에서 바로 실행되는 개발자 유틸리티 모음',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://wtools.movingwoo.com/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://wtools.movingwoo.com/assets/favicon-512.png',
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary');

  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain('Sitemap: https://wtools.movingwoo.com/sitemap.xml');

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain('<loc>https://wtools.movingwoo.com/</loc>');

  const notFound = await request.get('/404.html');
  expect(notFound.ok()).toBe(true);
  expect(await notFound.text()).toContain('페이지를 찾을 수 없습니다');
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

test('사이드바 카테고리를 키보드로 접고 펼칠 수 있다', async ({ page }) => {
  await page.goto('/');

  const category = page.locator('#nav .cat:not(.favorites)').first();
  const title = category.locator('button.cat-title');
  const itemsId = await title.getAttribute('aria-controls');

  expect(itemsId).toBeTruthy();
  await expect(page.locator(`#${itemsId}`)).toBeVisible();
  await expect(title).toHaveAttribute('aria-expanded', 'true');

  await title.focus();
  await page.keyboard.press('Enter');
  await expect(category).toHaveClass(/collapsed/);
  await expect(title).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(`#${itemsId}`)).toBeHidden();

  await page.keyboard.press('Space');
  await expect(category).not.toHaveClass(/collapsed/);
  await expect(title).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`#${itemsId}`)).toBeVisible();
});

test('좁은 화면에서 공통 레이아웃이 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(page.locator('.card-grid').first()).toHaveCSS('grid-template-columns', '296px');

  await page.locator('#menu-btn').click();
  const brandRow = page.locator('.brand-row');
  expect(await brandRow.evaluate((row) => row.scrollWidth)).toBeLessThanOrEqual(
    await brandRow.evaluate((row) => row.clientWidth),
  );
  await expect(page.getByRole('link', { name: 'GitHub 저장소 (새 창)' })).toBeVisible();
  await expect(page.locator('#theme-toggle')).toBeVisible();
  await page.locator('#menu-btn').click();

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

test('검색 입력과 드롭 값을 디바운스해 형식을 자동 감지한다', async ({ page }) => {
  await page.goto('/');
  const search = page.locator('#search');
  const detection = page.locator('#detect-result');

  await search.pressSequentially('https://example.com/path');
  await expect(detection.locator('strong')).toHaveText('URL');
  await expect(detection.getByRole('link', { name: 'URL 파서로 열기' })).toBeVisible();

  await search.evaluate((input) => {
    input.value = '{"source":"drop"}';
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: input.value,
      inputType: 'insertFromDrop',
    }));
  });
  await expect(detection.locator('strong')).toHaveText('JSON');

  await search.fill('A'.repeat(64 * 1024 + 1));
  await page.waitForTimeout(300);
  await expect(detection).toBeHidden();
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
  await page.getByRole('button', { name: '디코딩', exact: true }).click();
  await expect(output).toHaveValue('Hello');
});

test('파일 입력 공통 UI가 끌어놓기와 클립보드 붙여넣기를 처리한다', async ({ page }) => {
  await page.goto('/#/tool/checksum-file');
  const content = page.locator('#content');
  const zone = content.locator('.file-drop-zone');
  await expect(zone).toContainText('파일을 여기에 끌어놓거나');
  await expect(zone).toContainText('파일 내용은 브라우저 밖으로 전송되지 않습니다.');
  await expect(zone.getByRole('button', { name: '클립보드 파일 붙여넣기' })).toBeVisible();

  await zone.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['drop-content'], 'drop.txt', { type: 'text/plain' }));
    element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(content).toContainText('drop.txt (12 bytes)');
  await expect(zone.locator('.file-drop-status')).toContainText('끌어놓기에서 1개 파일을 가져왔습니다.');
  await expect(content.locator('.io-status')).toHaveText('처리가 완료되었습니다.');

  await zone.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['paste'], 'paste.txt', { type: 'text/plain' }));
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    element.dispatchEvent(event);
  });
  await expect(content).toContainText('paste.txt (5 bytes)');
  await expect(zone.locator('.file-drop-status')).toContainText('클립보드에서 1개 파일을 가져왔습니다.');
});

test('파일 입력 공통 UI가 accept와 단일/다중 선택을 지킨다', async ({ page }) => {
  await page.goto('/#/tool/image-convert');
  const content = page.locator('#content');
  const zone = content.locator('.file-drop-zone');
  await zone.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['not-image'], 'note.txt', { type: 'text/plain' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(zone.locator('.file-drop-status')).toHaveText('이 입력에서 지원하지 않는 파일 형식입니다.');
  expect(await content.getByLabel('이미지 선택 (여러 장 가능)').evaluate((input) => input.files.length)).toBe(0);
});

test('결과를 주소·저장소에 남기지 않고 호환 도구로 전달한다', async ({ page }) => {
  await page.goto('/#/tool/base64');
  const io = page.locator('#content .io');
  const secretJson = '{"secret":"브라우저 메모리에서만 전달"}';
  const encoded = Buffer.from(secretJson).toString('base64');

  await io.locator('textarea.mono:not(.out)').fill(encoded);
  await io.getByRole('button', { name: '디코딩', exact: true }).click();
  await expect(io.locator('textarea.out')).toHaveValue(secretJson);
  await io.getByRole('button', { name: '다른 도구로 보내기' }).click();
  await io.getByLabel('전달할 도구').selectOption('json-format');
  await io.getByRole('button', { name: '보내기', exact: true }).click();

  await expect(page).toHaveURL(/#\/tool\/json-format$/);
  await expect(page.locator('#content textarea.mono:not(.out)').first()).toHaveValue(secretJson);
  expect(page.url()).not.toContain('secret');
  expect(await page.evaluate((secret) => {
    const stored = [...Object.values(localStorage), ...Object.values(sessionStorage)].join('\n');
    return stored.includes(secret);
  }, secretJson)).toBe(false);

  await page.goBack();
  await expect(page.locator('.tool-header h1')).toHaveText('Base64 인코딩/디코딩');
  await page.goto('/#/tool/json-format');
  await expect(page.locator('#content textarea.mono:not(.out)').first()).not.toHaveValue(secretJson);
});

test('여러 입력을 받는 전달 대상에서 입력 칸을 선택한다', async ({ page }) => {
  const schema = '{"type":"object","required":["name"]}';
  await page.goto('/#/tool/json-format');
  const io = page.locator('#content .io');
  await io.locator('textarea.mono:not(.out)').fill(schema);
  await io.getByRole('button', { name: '다른 도구로 보내기' }).click();
  await io.getByLabel('전달할 도구').selectOption('json-schema');
  await expect(io.getByLabel('전달할 입력 칸')).toBeVisible();
  await io.getByLabel('전달할 입력 칸').selectOption('schema');
  await io.getByRole('button', { name: '보내기', exact: true }).click();

  await expect(page).toHaveURL(/#\/tool\/json-schema$/);
  await expect(page.locator('#content textarea.mono:not(.out)').nth(1)).toHaveValue(
    JSON.stringify(JSON.parse(schema), null, 2),
  );
});

test('JSON·JWT payload·해시 결과의 우선 연결이 동작한다', async ({ page }) => {
  await page.goto('/#/tool/json-format');
  let io = page.locator('#content .io');
  await io.locator('textarea.mono:not(.out)').fill('[{"name":"WTools"}]');
  await io.getByRole('button', { name: '다른 도구로 보내기' }).click();
  await io.getByLabel('전달할 도구').selectOption('data-convert');
  await io.getByRole('button', { name: '보내기', exact: true }).click();
  io = page.locator('#content .io');
  await expect(io.getByLabel('입력 포맷', { exact: true })).toHaveValue('json');
  await expect(io.locator('textarea.out')).toHaveValue(/name: WTools/);

  const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
  const payload = Buffer.from('{"sub":"transfer-test"}').toString('base64url');
  await page.goto('/#/tool/jwt');
  io = page.locator('#content .io').first();
  await io.getByLabel('JWT 토큰').fill(`${header}.${payload}.signature`);
  await io.getByRole('button', { name: '다른 도구로 보내기' }).click();
  await io.getByLabel('전달할 도구').selectOption('json-format');
  await io.getByRole('button', { name: '보내기', exact: true }).click();
  await expect(page.locator('#content textarea.mono:not(.out)').first()).toHaveValue(/transfer-test/);

  await page.goto('/#/tool/hmac');
  io = page.locator('#content .io');
  await io.getByRole('button', { name: '다른 도구로 보내기' }).click();
  await io.getByRole('button', { name: '보내기', exact: true }).click();
  await expect(page).toHaveURL(/#\/tool\/hash-analyze$/);
  await expect(page.locator('#content .out-html')).toContainText('SHA-256');
});

test('모바일에서도 결과 전달 UI가 화면 너비 안에서 동작한다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/#/tool/base64');
  const io = page.locator('#content .io');
  await io.locator('textarea.mono:not(.out)').fill('eyJtb2JpbGUiOnRydWV9');
  await io.getByRole('button', { name: '디코딩', exact: true }).click();
  await io.getByRole('button', { name: '다른 도구로 보내기' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await io.getByRole('button', { name: '보내기', exact: true }).click();
  await expect(page).toHaveURL(/#\/tool\/json-format$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
