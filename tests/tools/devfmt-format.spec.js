// 코드/문서 포맷터 정밀 테스트. 자체 Markdown 파서와 남은 포맷터 CDN 경로를 함께 검증한다.
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
  {
    name: 'markdown-html: 블록·raw HTML 변환', tool: 'markdown-html', action: 'HTML 코드',
    inputs: '문서 제목\n=========\n\n> 인용문\n>\n> 다음 문단\n\n---\n\n<section>\n<strong>raw</strong>\n</section>\n',
    htmlValue: '<h1>문서 제목</h1>\n<blockquote>\n<p>인용문</p>\n<p>다음 문단</p>\n</blockquote>\n<hr>\n<section>\n<strong>raw</strong>\n</section>\n',
  },
  {
    name: 'markdown-html: 코드 펜스·이스케이프·줄바꿈', tool: 'markdown-html', action: 'HTML 코드',
    inputs: '```js extra\nconst tag = "<a>";\n```\n\n일반 `a & < b`  \n다음 줄',
    htmlValue: '<pre><code class="language-js">const tag = &quot;&lt;a&gt;&quot;;\n</code></pre>\n<p>일반 <code>a &amp; &lt; b</code><br>다음 줄</p>\n',
  },
  {
    name: 'markdown-html: 시작 번호·혼합 중첩 목록', tool: 'markdown-html', action: 'HTML 코드',
    inputs: '3. 셋\n4. 넷\n   - 하위 A\n     1. 더 하위\n   - 하위 B\n5. 다섯',
    htmlValue: '<ol start="3">\n<li>셋</li>\n<li>넷<ul>\n<li>하위 A<ol>\n<li>더 하위</li>\n</ol>\n</li>\n<li>하위 B</li>\n</ul>\n</li>\n<li>다섯</li>\n</ol>\n',
  },
  {
    name: 'markdown-html: GFM 표·작업 목록·취소선', tool: 'markdown-html', action: 'HTML 코드',
    inputs: '| 왼쪽 | 가운데 | 오른쪽 |\n| :--- | :---: | ---: |\n| **굵게** | `코드` | ~~취소~~ |\n\n- [x] 완료\n- [ ] 대기',
    htmlValue: '<table>\n<thead>\n<tr>\n<th align="left">왼쪽</th>\n<th align="center">가운데</th>\n<th align="right">오른쪽</th>\n</tr>\n</thead>\n<tbody><tr>\n<td align="left"><strong>굵게</strong></td>\n<td align="center"><code>코드</code></td>\n<td align="right"><del>취소</del></td>\n</tr>\n</tbody></table>\n<ul>\n<li><input checked="" disabled="" type="checkbox"> 완료</li>\n<li><input disabled="" type="checkbox"> 대기</li>\n</ul>\n',
  },
  {
    name: 'markdown-html: 참조·이미지·자동 링크', tool: 'markdown-html', action: 'HTML 코드',
    inputs: '[문서][docs]와 ![대체 텍스트](image.png "그림"), <https://example.com?q=1&x=2>\n\n[docs]: https://example.com/a_(b) "문서 제목"',
    htmlValue: '<p><a href="https://example.com/a_(b)" title="문서 제목">문서</a>와 <img src="image.png" alt="대체 텍스트" title="그림">, <a href="https://example.com?q=1&amp;x=2">https://example.com?q=1&amp;x=2</a></p>\n',
  },
  { name: 'markdown-html: 빈 입력', tool: 'markdown-html', inputs: '', action: 'HTML 코드', htmlValue: '' },
  {
    name: 'markdown-html: 닫히지 않은 인라인 문법은 텍스트로 보존', tool: 'markdown-html', action: 'HTML 코드',
    inputs: '닫히지 않은 **강조와 [링크](https://example.com',
    htmlValue: '<p>닫히지 않은 **강조와 [링크](<a href="https://example.com">https://example.com</a></p>\n',
  },
  {
    name: 'markdown-html: 과도한 중첩 차단', tool: 'markdown-html', action: 'HTML 코드',
    inputs: '> '.repeat(65) + '본문',
    htmlError: 'Markdown 중첩이 너무 깊습니다. 목록과 인용문 중첩을 64단계 이하로 줄이세요.',
  },
  {
    name: 'markdown-html: 탭 들여쓰기와 중첩 목록', tool: 'markdown-html', action: 'HTML 코드',
    inputs: '  \tcode\n\n - foo\n   - bar\n\t - baz\n',
    htmlValue: '<pre><code>code\n</code></pre>\n<ul>\n<li>foo<ul>\n<li>bar<ul>\n<li>baz</li>\n</ul>\n</li>\n</ul>\n</li>\n</ul>\n',
  },
  {
    name: 'markdown-html: 빈 인용문 뒤 본문과 문단 내 HTML', tool: 'markdown-html', action: 'HTML 코드',
    inputs: '> bar\n>\noutside\n\nText before\n<a href="bar">\nafter\n',
    htmlValue: '<blockquote>\n<p>bar</p>\n</blockquote>\n<p>outside</p>\n<p>Text before\n<a href="bar">\nafter</p>\n',
  },
  {
    name: 'markdown-html: GFM 문단 중단·구두점·자동 링크 조합', tool: 'markdown-html', action: 'HTML 코드',
    inputs: '123\n456\n| a | b |\n| --- | --- |\nd | e\n\nThis is not ~~~~~one~~~~~ huge strikethrough.\n\n**Autolink and http://example.com**\n\n~~www.example.com~~\n',
    htmlValue: '<p>123\n456</p>\n<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>d</td>\n<td>e</td>\n</tr>\n</tbody></table>\n<p>This is not ~~~~~one~~~~~ huge strikethrough.</p>\n<p><strong>Autolink and <a href="http://example.com">http://example.com</a></strong></p>\n<p><del><a href="http://www.example.com">www.example.com</a></del></p>\n',
  },
  {
    name: 'markdown-html: 이스케이프가 다른 참조 링크는 연결하지 않음', tool: 'markdown-html', action: 'HTML 코드',
    inputs: '[bar][foo\\!]\n\n[foo!]: /url\n',
    htmlValue: '<p>[bar][foo!]</p>\n',
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
  await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect(frame).toHaveAttribute('srcdoc', /<h1>제목<\/h1>/);
});

test.describe('markdown-html: 악성 미리보기 격리', () => {
  // 빈 sandbox가 script를 차단할 때 Chromium이 남기는 예상 가능한 보안 로그다.
  test.use({ allowConsoleErrors: [/Blocked script execution.*frame is sandboxed/] });

  test('raw script와 이벤트 핸들러를 실행하지 않음', async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.__markdownPreviewMessages = [];
      addEventListener('message', (event) => globalThis.__markdownPreviewMessages.push(event.data));
    });
    await openTool(page, 'markdown-html');
    const io = ioSection(page);
    await io.locator('textarea.mono:not(.out)').fill(
      '<script>parent.postMessage("script-ran", "*")</script>\n\n'
        + '<img src="data:image/png;base64,broken" onerror="parent.postMessage(\'handler-ran\', \'*\')">');
    await io.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(io.locator('.out-html iframe')).toBeVisible();
    await page.waitForTimeout(200);
    await expect.poll(() => page.evaluate(() => globalThis.__markdownPreviewMessages)).toEqual([]);
  });
});

test('markdown-html: 큰 입력을 누락 없이 변환', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const source = Array.from({ length: 5000 }, (_, index) => `- 항목 ${index + 1}`).join('\n');
    const worker = new Worker('/js/workers/markdown-render.js', { type: 'module' });
    try {
      const html = await new Promise((resolve, reject) => {
        worker.addEventListener('message', ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.html), { once: true });
        worker.addEventListener('error', reject, { once: true });
        worker.postMessage({ text: source });
      });
      return {
        first: html.includes('<li>항목 1</li>'),
        last: html.includes('<li>항목 5000</li>'),
        items: (html.match(/<li>/g) || []).length,
      };
    } finally {
      worker.terminate();
    }
  });
  expect(result).toEqual({ first: true, last: true, items: 5000 });
});

test('markdown-html: 큰 입력 Worker를 취소', async ({ page }) => {
  await openTool(page, 'markdown-html');
  const io = ioSection(page);
  await io.locator('textarea.mono:not(.out)').evaluate((textarea) => {
    textarea.value = '**굵게** '.repeat(150000);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => io.evaluate((root) => !root.querySelector('.large-input-warning')?.hidden)).toBe(true);
  await io.evaluate((root) => root.querySelector('.large-input-warning button').click());
  await expect.poll(() => io.evaluate((root) => {
    const cancel = [...root.querySelectorAll('button')].find((button) => button.textContent === '취소');
    return Boolean(cancel && !cancel.hidden && !cancel.disabled);
  })).toBe(true);
  await io.evaluate((root) => {
    [...root.querySelectorAll('button')].find((button) => button.textContent === '취소').click();
  });
  await expect.poll(() => io.getAttribute('aria-busy')).toBe('false');
  await expect(io.locator('.out-html')).toContainText('작업이 취소되었습니다.');
});

test('markdown-html: 공개 CommonMark·GFM 벡터', async ({ page }) => {
  await page.goto('/');
  // Frozen from CommonMark 0.31.2 and GitHub's cmark-gfm extension examples.
  const vectors = [
    {
      markdown: '[foo](/bar\\* "ti\\*tle")\n',
      html: '<p><a href="/bar*" title="ti*tle">foo</a></p>\n',
    },
    {
      markdown: '| f\\|oo  |\n| ------ |\n| b `\\|` az |\n| b **\\|** im |\n',
      html: '<table>\n<thead>\n<tr>\n<th>f|oo</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>b <code>|</code> az</td>\n</tr>\n<tr>\n<td>b <strong>|</strong> im</td>\n</tr>\n</tbody></table>\n',
    },
    {
      markdown: 'www.commonmark.org\n',
      html: '<p><a href="http://www.commonmark.org">www.commonmark.org</a></p>\n',
    },
    {
      markdown: '- [x] 완료\n- [ ] 대기\n',
      html: '<ul>\n<li><input checked="" disabled="" type="checkbox"> 완료</li>\n<li><input disabled="" type="checkbox"> 대기</li>\n</ul>\n',
    },
  ];
  const results = await page.evaluate(async (inputs) => {
    const { parseMarkdown } = await import('/js/lib/markdown/parser.js');
    return inputs.map(({ markdown }) => parseMarkdown(markdown));
  }, vectors);
  expect(results).toEqual(vectors.map(({ html }) => html));
});

test('markdown-html: 닫는 괄호가 많은 자동 링크를 선형 시간에 처리', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { parseMarkdown } = await import('/js/lib/markdown/parser.js');
    const markdown = 'https://example.com/' + ')'.repeat(30000);
    const started = performance.now();
    const html = parseMarkdown(markdown);
    return {
      elapsed: performance.now() - started,
      linked: html.startsWith('<p><a href="https://example.com/">https://example.com/</a>'),
      closingCount: (html.match(/\)/g) || []).length,
    };
  });
  expect(result.elapsed).toBeLessThan(1000);
  expect(result.linked).toBe(true);
  expect(result.closingCount).toBe(30000);
});

test('markdown-html: 입력·출력·구조 상한', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { MARKDOWN_LIMITS, parseMarkdown } = await import('/js/lib/markdown/parser.js');
    const code = (run) => {
      try {
        run();
        return null;
      } catch (error) {
        return error.code;
      }
    };
    return {
      limits: MARKDOWN_LIMITS,
      input: code(() => parseMarkdown('a'.repeat(MARKDOWN_LIMITS.inputLength + 1))),
      output: code(() => parseMarkdown('# 제목', { maxOutputLength: 5 })),
      structures: code(() => parseMarkdown('- 항목\n'.repeat(6), { maxStructures: 5 })),
      inlineStructures: code(() => parseMarkdown('*a'.repeat(6), { maxStructures: 5 })),
    };
  });
  expect(result).toEqual({
    limits: { inputLength: 4 * 1024 * 1024, outputLength: 32 * 1024 * 1024, structures: 100000, nesting: 64 },
    input: 'MAX_INPUT', output: 'MAX_OUTPUT', structures: 'MAX_STRUCTURES',
    inlineStructures: 'MAX_STRUCTURES',
  });
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
