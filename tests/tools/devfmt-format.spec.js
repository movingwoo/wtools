// 코드/문서 포맷터 정밀 테스트. sql-formatter·js-beautify·marked 등 CDN 라이브러리 경로도 함께 검증한다.
import { test, expect, toolCases, openTool, ioSection, runIO, uploadFile } from '../helpers.js';
import { makePng } from '../fixtures.js';

const cases = [
  /* ---------- json-format ---------- */
  {
    name: 'json-format: 2칸 들여쓰기 포맷', tool: 'json-format', inputs: '{"b":2,"a":{"d":4,"c":[1,2]}}', action: '포맷',
    htmlValue: '{\n  "b": 2,\n  "a": {\n    "d": 4,\n    "c": [\n      1,\n      2\n    ]\n  }\n}',
  },
  { name: 'json-format: 4칸 들여쓰기', tool: 'json-format', options: { '들여쓰기': '4' }, inputs: '{"a":1}', action: '포맷', htmlValue: '{\n    "a": 1\n}' },
  { name: 'json-format: 탭 들여쓰기', tool: 'json-format', options: { '들여쓰기': 'tab' }, inputs: '{"a":1}', action: '포맷', htmlValue: '{\n\t"a": 1\n}' },
  { name: 'json-format: 키 정렬', tool: 'json-format', options: { '키 정렬': true }, inputs: '{"b":2,"a":1}', action: '포맷', htmlValue: '{\n  "a": 1,\n  "b": 2\n}' },
  { name: 'json-format: 압축', tool: 'json-format', inputs: '{"a": 1,  "b": [1, 2]}', action: '압축', htmlValue: '{"a":1,"b":[1,2]}' },
  { name: 'json-format: 트리 뷰', tool: 'json-format', inputs: '{"a":[1,{"b":true}]}', action: '트리 뷰', htmlContains: ['Object {1}', 'Array(2)', '"b"'] },
  { name: 'json-format: 잘못된 JSON은 에러', tool: 'json-format', inputs: '{oops}', action: '포맷', htmlError: /JSON/ },

  /* ---------- code-format ---------- */
  {
    name: 'code-format: SQL 포맷', tool: 'code-format', options: { '언어': 'sql' },
    inputs: 'select id,name from users where age>20 order by name', action: '포맷',
    output: 'SELECT\n  id,\n  name\nFROM\n  users\nWHERE\n  age > 20\nORDER BY\n  name',
  },
  { name: 'code-format: SQL 압축', tool: 'code-format', options: { '언어': 'sql' }, inputs: 'SELECT id,\n  name\nFROM users', action: '압축', output: 'SELECT id, name FROM users' },
  { name: 'code-format: JavaScript 포맷', tool: 'code-format', options: { '언어': 'js' }, inputs: 'function f(){return 1}', action: '포맷', output: 'function f() {\n  return 1\n}' },
  { name: 'code-format: JavaScript 4칸 들여쓰기', tool: 'code-format', options: { '언어': 'js', '들여쓰기': '4' }, inputs: 'function f(){return 1}', action: '포맷', output: 'function f() {\n    return 1\n}' },
  { name: 'code-format: JavaScript 압축 (주석 제거)', tool: 'code-format', options: { '언어': 'js' }, inputs: 'function f() {\n  // 주석\n  return 1;\n}', action: '압축', output: 'function f() { return 1; }' },
  { name: 'code-format: CSS 포맷', tool: 'code-format', options: { '언어': 'css' }, inputs: 'body{color:red;margin:0}', action: '포맷', output: 'body {\n  color: red;\n  margin: 0\n}' },
  { name: 'code-format: CSS 압축 (주석·공백 제거)', tool: 'code-format', options: { '언어': 'css' }, inputs: '/* c */\nbody { color : red ; }\n', action: '압축', output: 'body{color:red}' },
  { name: 'code-format: HTML 포맷', tool: 'code-format', options: { '언어': 'html' }, inputs: '<div><p>a</p></div>', action: '포맷', output: '<div>\n  <p>a</p>\n</div>' },
  { name: 'code-format: XML 포맷', tool: 'code-format', options: { '언어': 'xml' }, inputs: '<root><a x="1">t</a><b/></root>', action: '포맷', output: '<root>\n  <a x="1">t</a>\n  <b/>\n</root>' },
  { name: 'code-format: XML 압축', tool: 'code-format', options: { '언어': 'xml' }, inputs: '<root>\n  <a>t</a>\n</root>', action: '압축', output: '<root><a>t</a></root>' },
  { name: 'code-format: 잘못된 XML은 에러', tool: 'code-format', options: { '언어': 'xml' }, inputs: '<root><a></root>', action: '포맷', output: /^⚠ XML 파싱 오류: / },
  { name: 'code-format: YAML 포맷 (JSON 입력 허용)', tool: 'code-format', options: { '언어': 'yaml' }, inputs: '{"a": 1, "b": [1, 2]}', action: '포맷', output: 'a: 1\nb:\n  - 1\n  - 2\n' },
  { name: 'code-format: YAML 압축 (flow 스타일)', tool: 'code-format', options: { '언어': 'yaml' }, inputs: 'a: 1\nb:\n  - 1\n  - 2\n', action: '압축', output: '{a: 1, b: [1, 2]}' },

  /* ---------- syntax-highlight ---------- */
  {
    name: 'syntax-highlight: 지정한 언어로 강조', tool: 'syntax-highlight', options: { '언어': 'javascript' },
    inputs: 'const a = 1;', htmlContains: ['const a = 1;', '감지된 언어: javascript'],
  },

  /* ---------- markdown-html ---------- */
  {
    name: 'markdown-html: 헤딩·목록 변환', tool: 'markdown-html', inputs: '# 제목\n\n- 하나\n- 둘\n', action: 'HTML 코드',
    htmlValue: '<h1>제목</h1>\n<ul>\n<li>하나</li>\n<li>둘</li>\n</ul>\n',
  },
  {
    name: 'markdown-html: 강조·코드·링크 변환', tool: 'markdown-html', inputs: '**굵게** `코드` [링크](https://example.com)', action: 'HTML 코드',
    htmlValue: '<p><strong>굵게</strong> <code>코드</code> <a href="https://example.com">링크</a></p>\n',
  },

  /* ---------- markdown-toc ---------- */
  {
    name: 'markdown-toc: H2~H3 목차와 중복 앵커', tool: 'markdown-toc',
    inputs: '# 프로젝트\n\n## 설치\n\n### 요구 사항\n\n## 사용법\n\n## 사용법\n\n```\n# 코드 속 헤딩\n```\n',
    output: '- [설치](#설치)\n  - [요구 사항](#요구-사항)\n- [사용법](#사용법)\n- [사용법](#사용법-1)',
  },
  {
    name: 'markdown-toc: H1 포함 + 번호 매기기', tool: 'markdown-toc',
    options: { 'H1 포함': true, '번호 매기기': true },
    inputs: '# 프로젝트\n\n## 설치\n\n### 요구 사항\n\n## 사용법\n',
    output: '- [1. 프로젝트](#프로젝트)\n  - [1.1. 설치](#설치)\n    - [1.1.1. 요구 사항](#요구-사항)\n  - [1.2. 사용법](#사용법)',
  },
  {
    name: 'markdown-toc: 밑줄 헤딩과 링크·서식 제거', tool: 'markdown-toc', options: { 'H1 포함': true },
    inputs: '제목\n===\n\n## **굵은** [링크](https://example.com) 제목\n',
    output: '- [제목](#제목)\n  - [굵은 링크 제목](#굵은-링크-제목)',
  },
  {
    name: 'markdown-toc: 최대 깊이 제한', tool: 'markdown-toc', options: { '최대 깊이': '2' },
    inputs: '## 설치\n\n### 요구 사항\n\n## 사용법\n', output: '- [설치](#설치)\n- [사용법](#사용법)',
  },
  { name: 'markdown-toc: 헤딩이 없으면 에러', tool: 'markdown-toc', inputs: '본문만 있음', error: 'Markdown 헤딩을 찾을 수 없습니다. # 헤딩 또는 밑줄 형식 헤딩을 사용하세요.' },
  {
    name: 'markdown-toc: 범위 안 헤딩이 없으면 에러', tool: 'markdown-toc', options: { '최대 깊이': '2' },
    inputs: '# 제목만\n', error: 'H2~H2 범위의 헤딩을 찾을 수 없습니다.',
  },

  /* ---------- html-strip ---------- */
  {
    name: 'html-strip: 태그 제거 (script/style 내용 제외)', tool: 'html-strip',
    inputs: '<h1>제목</h1>\n<p>본문 <b>강조</b></p><script>var a=1;</script><style>b{}</style>', action: '태그 제거',
    htmlValue: '제목\n본문 강조',
  },
];

toolCases('devfmt-format', cases);

test('markdown-html: 미리보기는 샌드박스 iframe으로 렌더링', async ({ page }) => {
  await openTool(page, 'markdown-html');
  const io = ioSection(page);
  await io.locator('textarea.mono:not(.out)').fill('# 제목\n\n본문');
  await io.getByRole('button', { name: '미리보기', exact: true }).click();
  const frame = io.locator('.out-html iframe');
  await expect(frame).toHaveAttribute('sandbox', '');
  await expect(frame).toHaveAttribute('srcdoc', /<h1>제목<\/h1>/);
});

/* ---------- 왕복(round-trip) 변환 ---------- */

test('json-format: 포맷 → 압축 왕복 보존', async ({ page }) => {
  await openTool(page, 'json-format');
  const io = ioSection(page);
  const src = '{"name":"WTools","list":[1,2,3],"nested":{"ok":true}}';
  const input = io.locator('textarea.mono:not(.out)');
  const out = io.locator('.out-html');

  await input.fill(src);
  await io.getByRole('button', { name: '포맷', exact: true }).click();
  await expect(out).toContainText('"name": "WTools"');
  const pretty = await out.evaluate((el) => el.textContent);

  await input.fill(pretty);
  await io.getByRole('button', { name: '압축', exact: true }).click();
  await expect.poll(() => out.evaluate((el) => el.textContent)).toBe(src);
});

test('code-format: YAML 포맷 → 압축 → 포맷 왕복 보존', async ({ page }) => {
  await openTool(page, 'code-format');
  const io = ioSection(page);
  const yaml = 'name: WTools\nversion: 1\ntags:\n  - web\n  - tools\n';
  const min = await runIO(io, { options: { '언어': 'yaml' }, inputs: yaml, action: '압축' });
  expect(min).toBe('{name: WTools, version: 1, tags: [web, tools]}');
  const back = await runIO(io, { inputs: min, action: '포맷' });
  expect(back).toBe(yaml);
});

test('code-format: XML 압축 → 포맷 왕복 보존', async ({ page }) => {
  await openTool(page, 'code-format');
  const io = ioSection(page);
  const xml = '<root>\n  <a x="1">t</a>\n  <b/>\n</root>';
  const min = await runIO(io, { options: { '언어': 'xml' }, inputs: xml, action: '압축' });
  expect(min).toBe('<root><a x="1">t</a><b/></root>');
  const back = await runIO(io, { inputs: min, action: '포맷' });
  expect(back).toBe(xml);
});

/* ---------- hex-viewer (파일 / 직접 입력) ---------- */

test('hex-viewer: 파일 업로드 시 크기와 매직 넘버 판별', async ({ page }) => {
  await openTool(page, 'hex-viewer');
  const content = page.locator('#content');
  const png = makePng(8, 8, () => [255, 0, 0]);
  await uploadFile(content, '파일 선택 (브라우저 밖으로 전송되지 않습니다)', { name: 'red.png', mimeType: 'image/png', buffer: png });

  const row = (key) => content.locator('table.kv tr').filter({ has: page.getByText(key, { exact: true }) });
  await expect(row('입력')).toContainText('red.png');
  await expect(row('크기')).toContainText(`${png.length} bytes`);
  await expect(row('형식 추정 (매직 넘버)')).toContainText('PNG 이미지');
  await expect(content.locator('textarea.out')).toHaveValue(
    /^00000000 {2}89 50 4e 47 0d 0a 1a 0a 00 00 00 0d 49 48 44 52 {2}\|\.PNG\.{8}IHDR\|/);
});

test('hex-viewer: 직접 입력한 텍스트를 xxd 형식으로 덤프', async ({ page }) => {
  await openTool(page, 'hex-viewer');
  const content = page.locator('#content');
  await content.getByLabel('또는 직접 입력').fill('abc');
  // 오프셋 + 16바이트 자리(47칸)에 맞춘 hex + ASCII 열
  await expect(content.locator('textarea.out')).toHaveValue('00000000  61 62 63' + ' '.repeat(39) + '  |abc|');
  await expect(content.locator('table.kv')).toContainText('알려진 시그니처 없음');
});

test('hex-viewer: Hex 입력으로 다른 포맷 판별', async ({ page }) => {
  await openTool(page, 'hex-viewer');
  const content = page.locator('#content');
  await content.getByLabel('입력 형식').selectOption('hex');
  await content.getByLabel('또는 직접 입력').fill('1f8b0800');
  await expect(content.locator('table.kv')).toContainText('Gzip 압축');
  await expect(content.locator('table.kv')).toContainText('직접 입력 (hex)');
});
