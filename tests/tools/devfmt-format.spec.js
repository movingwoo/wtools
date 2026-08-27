// 코드/문서 포맷터 정밀 테스트. 자체 구문 강조·Markdown 파서와 남은 포맷터 CDN 경로를 검증한다.
import { test, expect, toolCases, openTool, ioSection, runIO, uploadFile } from '../helpers.js';
import { makePng } from '../fixtures.js';
import {
  formatJavaScript, minifyJavaScript, formatCss, minifyCss, formatHtml, minifyHtml,
} from '../../js/lib/code/formatter.js';

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
  {
    name: 'code-format: JavaScript 리터럴·정규식·주석 보존', tool: 'code-format', options: { '언어': 'js' }, action: '포맷',
    inputs: 'const config={url:"https://example.com/a//b",pattern:/a\\/\\/*b/g,render:(name)=>`Hello ${name}`};if(config){console.log(config)}else{/* no-op */}',
    output: 'const config = {\n  url: "https://example.com/a//b",\n  pattern: /a\\/\\/*b/g,\n  render: (name) => `Hello ${name}`\n};\nif (config) {\n  console.log(config)\n} else {\n  /* no-op */\n}',
  },
  {
    name: 'code-format: JavaScript 압축 시 문자열 속 주석 기호 보존', tool: 'code-format', options: { '언어': 'js' }, action: '압축',
    inputs: 'const url = "https://example.com/a//b"; // 제거\nconst pattern = /a\\/\\/*b/g;',
    output: 'const url = "https://example.com/a//b"; const pattern = /a\\/\\/*b/g;',
  },
  { name: 'code-format: CSS 포맷', tool: 'code-format', options: { '언어': 'css' }, inputs: 'body{color:red;margin:0}', action: '포맷', output: 'body {\n  color: red;\n  margin: 0\n}' },
  { name: 'code-format: CSS 압축 (주석·공백 제거)', tool: 'code-format', options: { '언어': 'css' }, inputs: '/* c */\nbody { color : red ; }\n', action: '압축', output: 'body{color:red}' },
  {
    name: 'code-format: CSS 중첩·함수·문자열 보존', tool: 'code-format', options: { '언어': 'css' }, action: '포맷',
    inputs: '@media screen and (min-width:600px){.card,.item:hover{color:var(--accent,red);background:url("data:image/svg+xml;a;b");margin:calc(100% - 2rem)}}',
    output: '@media screen and (min-width:600px) {\n  .card,\n  .item:hover {\n    color: var(--accent, red);\n    background: url("data:image/svg+xml;a;b");\n    margin: calc(100% - 2rem)\n  }\n}',
  },
  {
    name: 'code-format: CSS 압축 시 문자열 속 구분자 보존', tool: 'code-format', options: { '언어': 'css' }, action: '압축',
    inputs: '/* 제거 */ .card { content: "a;b:c"; background: url("data:a;b") ; }',
    output: '.card{content:"a;b:c";background:url("data:a;b")}',
  },
  { name: 'code-format: HTML 포맷', tool: 'code-format', options: { '언어': 'html' }, inputs: '<div><p>a</p></div>', action: '포맷', output: '<div>\n  <p>a</p>\n</div>' },
  {
    name: 'code-format: HTML 주석·속성·인라인 구조 보존', tool: 'code-format', options: { '언어': 'html' }, action: '포맷',
    inputs: '<!doctype html><!--c--><main><p>Hello <strong>world</strong></p><img src="x>y"><section><span>x</span></section></main>',
    output: '<!doctype html>\n<!--c-->\n<main>\n  <p>Hello <strong>world</strong></p>\n  <img src="x>y">\n  <section><span>x</span></section>\n</main>',
  },
  {
    name: 'code-format: HTML 압축 시 pre 공백 보존', tool: 'code-format', options: { '언어': 'html' }, action: '압축',
    inputs: '<div>  <p>a</p> </div><pre>  a\n    b</pre>',
    output: '<div><p>a</p></div><pre>  a\n    b</pre>',
  },
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

test('syntax-highlight: 22개 언어 토큰화가 원문을 보존한다', async ({ page }) => {
  await page.goto('/');
  const corpus = {
    javascript: 'const greet = (name) => console.log(`Hello ${name}`);',
    typescript: 'interface User { name: string }\nconst user: User = { name: "Ada" };',
    python: 'def greet(name: str):\n    print(f"Hello {name}")\n',
    java: 'public class Main { public static void main(String[] args) { System.out.println("hi"); } }',
    c: '#include <stdio.h>\nint main(void) { printf("hi\\n"); return 0; }',
    cpp: '#include <iostream>\nint main() { std::cout << "hi" << std::endl; }',
    csharp: 'using System;\nnamespace Demo { public class App { static void Main() { Console.WriteLine("hi"); } } }',
    go: 'package main\nimport "fmt"\nfunc main() { message := "hi"; fmt.Println(message) }',
    rust: 'fn main() { let mut items = vec![1, 2]; println!("{:?}", items); }',
    kotlin: 'package demo\ndata class User(val name: String)\nfun main() { println(User("Ada")) }',
    swift: 'import Foundation\nprotocol Greeter { func greet() -> String }\nlet name = "Ada"',
    php: '<?php\n$name = "Ada";\necho "Hello $name";\n?>',
    ruby: 'class Greeter\n  def greet(name)\n    puts "Hello #{name}"\n  end\nend',
    sql: 'SELECT users.name, COUNT(*) FROM users LEFT JOIN logs ON logs.user_id = users.id GROUP BY users.name;',
    html: '<!doctype html><html><body><button class="primary">저장</button></body></html>',
    xml: '<?xml version="1.0"?><catalog><book id="1"><title>WTools</title></book></catalog>',
    css: '.card:hover { color: #2563eb; margin: 1rem; }',
    json: '{"name":"WTools","enabled":true,"count":3}',
    yaml: 'name: WTools\nenabled: true\nitems:\n  - one\n  - two',
    bash: '#!/usr/bin/env bash\nfor file in "$@"; do\n  echo "${file}"\ndone',
    shell: '#!/bin/sh\nfor file in "$@"; do\n  printf "%s\\n" "$file"\ndone',
    markdown: '# 제목\n\n- [문서](https://example.com)\n\n```js\nconst ok = true;\n```',
  };
  const expectedToken = {
    javascript: ['keyword', 'const'], typescript: ['keyword', 'interface'], python: ['keyword', 'def'],
    java: ['keyword', 'public'], c: ['meta', '#include <stdio.h>'], cpp: ['meta', '#include <iostream>'],
    csharp: ['keyword', 'using'], go: ['keyword', 'package'], rust: ['keyword', 'fn'],
    kotlin: ['keyword', 'data'], swift: ['keyword', 'import'], php: ['meta', '<?php'],
    ruby: ['keyword', 'class'], sql: ['keyword', 'SELECT'], html: ['title', 'html'],
    xml: ['title', 'catalog'], css: ['selector', '.card:hover'], json: ['attr', '"name"'],
    yaml: ['attr', 'name'], bash: ['meta', '#!/usr/bin/env bash'], shell: ['meta', '#!/bin/sh'],
    markdown: ['keyword', '# '],
  };
  const result = await page.evaluate(async ({ samples, expected }) => {
    const { highlight, SUPPORTED_LANGUAGES } = await import('/js/lib/code/syntax-highlighter.js');
    return {
      supported: SUPPORTED_LANGUAGES,
      rows: SUPPORTED_LANGUAGES.map((language) => {
        const output = highlight(samples[language], language);
        return {
          language: output.language,
          rebuilt: output.tokens.map((token) => token.value).join(''),
          tokenTypes: [...new Set(output.tokens.map((token) => token.type).filter(Boolean))],
          hasExpected: output.tokens.some((token) => token.type === expected[language][0]
            && token.value === expected[language][1]),
        };
      }),
    };
  }, { samples: corpus, expected: expectedToken });

  expect(result.supported).toEqual(Object.keys(corpus));
  for (const row of result.rows) {
    expect(row.rebuilt).toBe(corpus[row.language]);
    expect(row.tokenTypes.length, `${row.language} 토큰 종류`).toBeGreaterThan(0);
    expect(row.hasExpected, `${row.language} 대표 토큰`).toBe(true);
  }
  await openTool(page, 'syntax-highlight');
  const uiLanguages = await ioSection(page).getByLabel('언어').locator('option').evaluateAll((options) =>
    options.map((option) => option.value).filter((value) => value !== 'auto'));
  expect(uiLanguages).toEqual(result.supported);
});

test('syntax-highlight: 자동 감지 정확도와 일반 텍스트 오탐 방지 코퍼스', async ({ page }) => {
  await page.goto('/');
  const expected = {
    javascript: 'const greet = (name) => console.log(`Hello ${name}`);',
    typescript: 'interface User { name: string }\nconst user: User = { name: "Ada" };',
    python: 'def greet(name: str):\n    print(f"Hello {name}")',
    java: 'public class Main { public static void main(String[] args) { System.out.println("hi"); } }',
    c: '#include <stdio.h>\nint main(void) { printf("hi"); return 0; }',
    cpp: '#include <iostream>\nint main() { std::cout << "hi" << std::endl; }',
    csharp: 'using System;\nnamespace Demo { public class App { static void Main() { Console.WriteLine("hi"); } } }',
    go: 'package main\nimport "fmt"\nfunc main() { message := "hi"; fmt.Println(message) }',
    rust: 'fn main() { let mut items = vec![1, 2]; println!("{:?}", items); }',
    kotlin: 'package demo\ndata class User(val name: String)\nfun main() { println(User("Ada")) }',
    swift: 'import Foundation\nprotocol Greeter { func greet() -> String }',
    php: '<?php\n$name = "Ada";\necho "Hello $name";',
    ruby: 'class Greeter\n  def greet(name)\n    puts "Hello #{name}"\n  end\nend',
    sql: 'SELECT users.name, COUNT(*) FROM users LEFT JOIN logs ON logs.user_id = users.id GROUP BY users.name;',
    html: '<!doctype html><html><body><button>저장</button></body></html>',
    xml: '<?xml version="1.0"?><catalog><book id="1"/></catalog>',
    css: '.card:hover { color: #2563eb; margin: 1rem; }',
    json: '{"name":"WTools","enabled":true,"count":3}',
    yaml: 'name: WTools\nenabled: true\nitems:\n  - one\n  - two',
    bash: '#!/usr/bin/env bash\nfor file in "$@"; do echo "${file}"; done',
    markdown: '# 제목\n\n- [문서](https://example.com)\n\n```js\nconst ok = true;\n```',
  };
  const plain = [
    '안녕하세요. 오늘 회의는 오후 세 시입니다.',
    'The quick brown fox jumps over the lazy dog.',
    'name',
    '2026-08-26',
    'hello@example.com',
    '프로젝트 이름: W-Tools',
    'SELECT라는 단어와 FROM이라는 단어를 설명하는 일반 문장입니다.',
  ];
  const result = await page.evaluate(async ({ samples, prose }) => {
    const { highlightAuto } = await import('/js/lib/code/syntax-highlighter.js');
    return {
      detected: Object.fromEntries(Object.entries(samples).map(([language, source]) =>
        [language, highlightAuto(source).language])),
      falsePositives: prose.map((source) => highlightAuto(source).language),
    };
  }, { samples: expected, prose: plain });
  expect(result.detected).toEqual(Object.fromEntries(Object.keys(expected).map((language) => [language, language])));
  expect(result.falsePositives).toEqual(plain.map(() => null));
});

test('syntax-highlight: 최신 언어 프로필의 어휘와 문자열 형식을 처리한다', async ({ page }) => {
  await page.goto('/');
  const samples = {
    javascript: ['enum implements interface package private protected public', [['enum', 'keyword'], ['public', 'keyword']]],
    typescript: ['using resource = open();\naccessor value: string;', [['using', 'keyword'], ['accessor', 'keyword']]],
    python: ['type Point = tuple[int, int]\nmatch value:\n  case _:\n    text = f"""hello {value}"""', [['type', 'keyword'], ['_', 'keyword'], ['f"""hello {value}"""', 'string']]],
    java: ['non-sealed class App { Object _; boolean ok = value instanceof int when true; String text = """hello"""; }', [['non-sealed', 'keyword'], ['_', 'keyword'], ['when', 'keyword'], ['"""hello"""', 'string']]],
    c: ['alignas(16) bool ok = true; constexpr int n = 1; typeof(n) copy; void *p = nullptr; _BitInt(32) wide;', [['alignas', 'keyword'], ['bool', 'type'], ['constexpr', 'keyword'], ['typeof', 'keyword'], ['nullptr', 'literal'], ['_BitInt', 'type']]],
    cpp: ['export module demo; import <string>; char8_t c; bool same = a and_eq b; auto raw = R"tag(a " b)tag";', [['module', 'keyword'], ['import', 'keyword'], ['char8_t', 'type'], ['and_eq', 'keyword'], ['R"tag(a " b)tag"', 'string']]],
    csharp: ['extension WidgetExtensions { scoped ref int Value => ref field; }\nvar a = @"a ""b""";\nvar b = $$"""hello {{name}}""";', [['extension', 'keyword'], ['scoped', 'keyword'], ['field', 'keyword'], ['@"a ""b"""', 'string'], ['$$"""hello {{name}}"""', 'string']]],
    go: ['func f[T comparable](items []T) any { clear(items); return max(1, min(2, 3)) }', [['comparable', 'type'], ['any', 'type'], ['clear', 'built-in'], ['max', 'built-in'], ['min', 'built-in']]],
    rust: ['gen fn future() {}\nlet raw = r##"a "# b"##;', [['gen', 'keyword'], ['r##"a "# b"##', 'string']]],
    kotlin: ['context(Logger)\nfun log() { val text = """hello""" }', [['context', 'keyword'], ['"""hello"""', 'string']]],
    swift: ['borrowing func read(_ value: consuming Item) { let text = #"""hello"""# }', [['borrowing', 'keyword'], ['consuming', 'keyword'], ['#"""hello"""#', 'string']]],
  };
  const result = await page.evaluate(async (corpus) => {
    const { highlight } = await import('/js/lib/code/syntax-highlighter.js');
    return Object.fromEntries(Object.entries(corpus).map(([language, [source, expected]]) => {
      const output = highlight(source, language);
      return [language, {
        rebuilt: output.tokens.map((token) => token.value).join(''),
        matches: expected.map(([value, type]) => output.tokens.some((token) => token.value === value && token.type === type)),
      }];
    }));
  }, samples);
  for (const [language, [source]] of Object.entries(samples)) {
    expect(result[language].rebuilt, `${language} 원문`).toBe(source);
    expect(result[language].matches, `${language} 최신 토큰`).not.toContain(false);
  }
});

test('syntax-highlight: 자동 감지는 적대 입력을 선형 시간에 처리한다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { detectLanguage } = await import('/js/lib/code/syntax-highlighter.js');
    const samples = ['a'.repeat(40_000), '('.repeat(40_000), '['.repeat(40_000), 'function(' + 'a'.repeat(39_991)];
    return samples.map((source) => {
      const started = performance.now();
      const detected = detectLanguage(source);
      return { elapsed: performance.now() - started, detected };
    });
  });
  for (const row of result) {
    expect(row.detected).toEqual({ language: null, relevance: 0 });
    expect(row.elapsed).toBeLessThan(1000);
  }
});

test('syntax-highlight: 안전한 DOM 렌더링·내부 테마·외부 요청 없음', async ({ page }) => {
  const highlightRequests = [];
  page.on('request', (request) => {
    if (/highlight(?:\.min)?\.js|github-dark-dimmed/i.test(request.url())) highlightRequests.push(request.url());
  });
  await openTool(page, 'syntax-highlight');
  const io = ioSection(page);
  const input = '<img src=x onerror="window.__syntaxInjected=true"><script>window.__syntaxInjected=true</script>';
  await io.getByLabel('언어').selectOption('html');
  await io.locator('textarea.mono:not(.out)').fill(input);
  const code = io.locator('.syntax-highlight code');
  await expect(code).toHaveText(input);
  await expect(code.locator('.syn-title')).toHaveCount(3);
  await expect(io.locator('.syntax-highlight-note')).toHaveText('감지된 언어: html');
  expect(await io.locator('img, script').count()).toBe(0);
  expect(await page.evaluate(() => globalThis.__syntaxInjected)).toBeUndefined();

  const colors = await page.evaluate(() => {
    const keyword = document.querySelector('.syn-title');
    document.documentElement.dataset.theme = 'light';
    const light = getComputedStyle(keyword).color;
    document.documentElement.dataset.theme = 'dark';
    const dark = getComputedStyle(keyword).color;
    const classes = ['comment', 'keyword', 'string', 'number', 'title', 'type', 'meta', 'operator'];
    const rgb = (value) => value.match(/[\d.]+/g).slice(0, 3).map((part) => Number(part) / 255);
    const luminance = (value) => rgb(value).map((part) => part <= 0.04045
      ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4)
      .reduce((sum, part, index) => sum + part * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const contrast = {};
    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset.theme = theme;
      contrast[theme] = classes.map((name) => {
        const span = document.createElement('span');
        span.className = 'syn-' + name;
        document.querySelector('.syntax-highlight code').append(span);
        const result = ratio(getComputedStyle(span).color,
          getComputedStyle(document.querySelector('.syntax-highlight')).backgroundColor);
        span.remove();
        return result;
      });
    }
    return { light, dark, contrast };
  });
  expect(colors.light).not.toBe(colors.dark);
  expect(Math.min(...colors.contrast.light)).toBeGreaterThanOrEqual(4.5);
  expect(Math.min(...colors.contrast.dark)).toBeGreaterThanOrEqual(4.5);
  expect(highlightRequests).toEqual([]);
});

test('syntax-highlight: 빈 입력·잘못된 언어·대용량 입력 경계', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { highlight, highlightAuto } = await import('/js/lib/code/syntax-highlighter.js');
    const large = 'const value = 123; // comment\n'.repeat(10000);
    const started = performance.now();
    const output = highlight(large, 'javascript');
    let invalid;
    try { highlight('x', 'brainfuck'); } catch (error) { invalid = { name: error.name, message: error.message }; }
    return {
      empty: highlight('', 'javascript'),
      autoEmpty: highlightAuto(''),
      invalid,
      rebuilt: output.tokens.map((token) => token.value).join('') === large,
      malformedCss: ['{-;}', '{ -; }', '.x { --: 1; }'].map((source) =>
        highlight(source, 'css').tokens.map((token) => token.value).join('') === source),
      elapsed: performance.now() - started,
    };
  });
  expect(result.empty).toEqual({ language: 'javascript', relevance: 0, tokens: [] });
  expect(result.autoEmpty).toEqual({ language: null, relevance: 0, tokens: [] });
  expect(result.invalid).toEqual({ name: 'RangeError', message: '지원하지 않는 구문 강조 언어입니다: brainfuck' });
  expect(result.rebuilt).toBe(true);
  expect(result.malformedCss).toEqual([true, true, true]);
  expect(result.elapsed).toBeLessThan(2000);
});

test('syntax-highlight: 큰 입력은 승인·취소할 수 있고 최대 길이를 제한한다', async ({ page }) => {
  await openTool(page, 'syntax-highlight');
  const io = ioSection(page);
  await io.getByLabel('언어').selectOption('css');
  await io.locator('textarea.mono:not(.out)').evaluate((input) => {
    input.value = '.item { color: red; margin: 1rem; }\n'.repeat(8_000);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(io.locator('.large-input-warning')).toBeVisible();
  await io.getByRole('button', { name: '그래도 처리' }).click();
  await expect(io.getByRole('button', { name: '취소' })).toBeVisible();
  await io.getByRole('button', { name: '취소' }).click();
  await expect(io.locator('.out-html')).toContainText('작업이 취소되었습니다.');

  await io.locator('textarea.mono:not(.out)').evaluate((input) => {
    input.value = 'a'.repeat(1_000_001);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await io.getByRole('button', { name: '그래도 처리' }).click();
  await expect(io.locator('.out-html')).toContainText('구문 강조 입력은 1,000,000자 이하여야 합니다.');
});

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

test('code-format: JavaScript 결과를 Node 파서·실행 결과와 교차 검증', async () => {
  const source = [
    'const url="https://example.com/a//b";',
    'const pattern=/a\\/\\/*b/g;',
    'const text=`outer ${`inner ${2+3}`}`;',
    'let shifted=8;shifted<<=1;shifted>>=2;',
    'const numbers=[1.,.5,1e3,1.2e-3,0xffn];',
    'const data={url,source:pattern.source,text,shifted,numbers:numbers.map(String),nested:{items:[1,2,3]}};',
  ].join('');
  const formatted = formatJavaScript(source, { indentSize: 2 });
  const minified = minifyJavaScript(source);
  const evaluate = (code) => Function(`${code}\nreturn JSON.stringify(data);`)();
  expect(evaluate(formatted)).toBe(evaluate(source));
  expect(evaluate(minified)).toBe(evaluate(source));
  expect(formatted).toContain('`outer ${`inner ${2+3}`}`');
  expect(formatJavaScript('const view=<Panel>{items.map(item=><Row key={item.id}/>)}</Panel>;'))
    .toContain('<Panel>{items.map(item=><Row key={item.id}/>)}</Panel>');

  const asi = 'function boundary(){return\n{x:1}}';
  expect(Function(`${formatJavaScript(asi)};return boundary();`)()).toBeUndefined();
  expect(Function(`${minifyJavaScript(asi)};return boundary();`)()).toBeUndefined();
  const semicolonless = 'let count=1\ncount++\n++count';
  expect(Function(`${formatJavaScript(semicolonless)};return count;`)()).toBe(3);
  expect(Function(`${minifyJavaScript(semicolonless)};return count;`)()).toBe(3);

  const edgeCases = [
    'globalThis.result=77 .toExponential()',
    String.raw`const \u0061=1;globalThis.result=a`,
    "let hit=false;if(true) /a/.test('a')&&(hit=true);globalThis.result=hit",
    "let hit=false;{} /a/.test('a')&&(hit=true);globalThis.result=hit",
    "let hit=false;class Example{} /a/.test('a')&&(hit=true);globalThis.result=hit",
    'function f(){return/*\n*/42}globalThis.result=f()',
    'let a=1,b=1;a/*\n*/++b;globalThis.result=[a,b]',
    'const 𐐀=7;globalThis.result=𐐀',
  ];
  for (const edge of edgeCases) {
    const execute = (code) => {
      const box = {};
      Function('globalThis', code)(box);
      return box.result;
    };
    expect(execute(formatJavaScript(edge))).toEqual(execute(edge));
    expect(execute(minifyJavaScript(edge))).toEqual(execute(edge));
  }
  const hashbang = '#!/usr/bin/env node\nconst value=1;';
  expect(formatJavaScript(hashbang)).toMatch(/^#!\/usr\/bin\/env node\n/);
  expect(minifyJavaScript(hashbang)).toMatch(/^#!\/usr\/bin\/env node\n/);
});

test('code-format: CSS 결과를 브라우저 CSSOM과 교차 검증', async ({ page }) => {
  const source = '@media screen and (min-width:600px){.card,.item:hover{color:var(--accent,red);margin:calc(100% - 2rem)}}';
  const outputs = [formatCss(source, { indentSize: 2 }), minifyCss(source)];
  const parsed = await page.evaluate(([original, ...candidates]) => {
    const cssom = (css) => {
      const style = document.createElement('style');
      const target = document.createElement('div');
      target.className = 'card';
      style.textContent = css;
      document.head.append(style);
      document.body.append(target);
      const computed = getComputedStyle(target);
      const result = {
        rules: style.sheet.cssRules.length,
        nestedRules: style.sheet.cssRules[0]?.cssRules?.length || 0,
        color: computed.color,
        margin: computed.margin,
      };
      style.remove();
      target.remove();
      return result;
    };
    return { original: cssom(original), candidates: candidates.map(cssom) };
  }, [source, ...outputs]);
  expect(parsed.candidates).toEqual([parsed.original, parsed.original]);

  for (const edge of [
    '.a :hover{color:red}',
    '.a [data-x]{color:red}',
    '.a{width:calc(1px + 2px)}',
    '@font-face{font-family:x;src:url(x);unicode-range:U+0025-00FF}',
    '.a{background:url(data:image/svg+xml;base64,AAAA)}',
  ]) {
    const candidates = [edge, formatCss(edge), minifyCss(edge)];
    const rules = await page.evaluate((values) => values.map((css) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      return [...sheet.cssRules].map((rule) => rule.cssText);
    }), candidates);
    expect(rules.slice(1)).toEqual([rules[0], rules[0]]);
  }
});

test('code-format: HTML 결과를 DOMParser 구조와 교차 검증하고 raw 내용을 보존', async ({ page }) => {
  const source = '<main><p>Hello <strong>world</strong></p><img src="x>y"><section><span>1 < 2</span></section></main>';
  const outputs = [formatHtml(source, { indentSize: 2 }), minifyHtml(source)];
  const snapshots = await page.evaluate(([original, ...candidates]) => {
    const snapshot = (html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const visit = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const value = node.parentElement?.matches('pre, textarea')
            ? node.nodeValue : node.nodeValue.replace(/\s+/g, ' ').trim();
          return value ? ['text', value] : null;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return null;
        return [node.localName, [...node.attributes].map(({ name, value }) => [name, value]).sort(),
          [...node.childNodes].map(visit).filter(Boolean)];
      };
      return [...doc.body.children].map(visit);
    };
    return { original: snapshot(original), candidates: candidates.map(snapshot) };
  }, [source, ...outputs]);
  expect(snapshots.candidates).toEqual([snapshots.original, snapshots.original]);

  const raw = '<div><script>const value=`line 1\n  line 2`;</script><style>.a{content:"a;b:c"}</style><pre>  a\n    b</pre></div>';
  const formatted = formatHtml(raw, { indentSize: 2 });
  expect(formatted).toContain('`line 1\n  line 2`');
  expect(formatted).toContain('content: "a;b:c"');
  expect(formatted).toContain('<pre>  a\n    b</pre>');
  expect(minifyHtml(raw)).toContain('<pre>  a\n    b</pre>');

  for (const edge of [
    '<span>a</span> <span>b</span>',
    '<span>a</span><span>b</span>',
    '<p>a<span> b </span>c</p>',
  ]) {
    const rendered = await page.evaluate((values) => values.map((html) => {
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.append(host);
      const result = { text: host.innerText, content: host.textContent };
      host.remove();
      return result;
    }), [edge, formatHtml(edge), minifyHtml(edge)]);
    expect(rendered.slice(1)).toEqual([rendered[0], rendered[0]]);
  }

  const dataScript = '<script type="text/x-template">{{ user  name }} // keep</script>';
  expect(formatHtml(dataScript)).toBe(dataScript);
  expect(minifyHtml(dataScript)).toBe(dataScript);
  const quotedAttributeText = '<script data-note=" type=application/json src=/fake.js">const value=1;</script>';
  expect(formatHtml(quotedAttributeText)).toContain('const value = 1;');
  const importMap = '<script type="importmap"> { "imports": { "x": "/x.js" } } </script>';
  for (const output of [formatHtml(importMap), minifyHtml(importMap)]) {
    const value = output.match(/<script[^>]*>([\s\S]*)<\/script>/)?.[1];
    expect(JSON.parse(value)).toEqual({ imports: { x: '/x.js' } });
  }
});

test('code-format: 중첩 템플릿과 과대 결과를 제한한다', () => {
  let nested = '`x`';
  for (let index = 0; index < 300; index++) nested = '`${' + nested + '}`';
  try {
    formatJavaScript(nested);
    throw new Error('중첩 제한이 적용되지 않았습니다.');
  } catch (error) {
    expect(error.code).toBe('FORMAT_NESTING');
  }
  try {
    formatJavaScript('{'.repeat(30) + 'a;'.repeat(100) + '}'.repeat(30), { maxOutputLength: 1_000 });
    throw new Error('출력 제한이 적용되지 않았습니다.');
  } catch (error) {
    expect(error.code).toBe('FORMAT_OUTPUT_LIMIT');
  }
});

test('code-format: 과도한 중첩을 한국어로 거부', async ({ page }) => {
  await openTool(page, 'code-format');
  const io = ioSection(page);
  await io.getByLabel('언어').selectOption('html');
  await io.locator('textarea.mono:not(.out)').fill('<div>'.repeat(258) + '</div>'.repeat(258));
  await io.getByRole('button', { name: '포맷', exact: true }).click();
  await expect(io.locator('textarea.out')).toHaveValue('⚠ HTML 중첩이 너무 깊습니다. 중첩을 256단계 이하로 줄이세요.');
});

test('code-format: 큰 자체 포맷 작업은 Worker에서 실행하고 취소', async ({ page }) => {
  await page.route('**/js/workers/code-format.js', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ response });
  });
  await openTool(page, 'code-format');
  const io = ioSection(page);
  await io.getByLabel('언어').selectOption('js');
  await io.locator('textarea.mono:not(.out)').evaluate((textarea) => {
    textarea.value = 'const value={a:1,b:[2,3]};\n'.repeat(8_000);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await io.getByRole('button', { name: '포맷', exact: true }).click();
  await expect(io.locator('.large-input-warning')).toBeVisible();
  await io.getByRole('button', { name: '그래도 처리' }).click();
  await expect(io.getByRole('button', { name: '취소' })).toBeVisible();
  await io.getByRole('button', { name: '취소' }).click();
  await expect(io.locator('.io-status')).toHaveText('작업이 취소되었습니다.');

  await io.locator('textarea.mono:not(.out)').evaluate((textarea) => {
    textarea.value = 'a'.repeat(4 * 1024 * 1024 + 1);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await io.getByRole('button', { name: '포맷', exact: true }).click();
  await io.getByRole('button', { name: '그래도 처리' }).click();
  await expect(io.locator('textarea.out')).toHaveValue('⚠ 코드 포맷터 입력은 4,194,304자 이하여야 합니다.');
});

test('code-format: 중간 크기 입력은 경고 없이 Worker에서 처리', async ({ page }) => {
  let workerRequests = 0;
  await page.route('**/js/workers/code-format.js', async (route) => {
    workerRequests++;
    await route.continue();
  });
  await openTool(page, 'code-format');
  const io = ioSection(page);
  await io.getByLabel('언어').selectOption('js');
  await io.locator('textarea.mono:not(.out)').fill('a;'.repeat(1_100));
  await io.getByRole('button', { name: '포맷', exact: true }).click();
  await expect(io.locator('textarea.out')).not.toHaveValue('');
  await expect(io.locator('.large-input-warning')).toBeHidden();
  expect(workerRequests).toBe(1);
});

test('code-format: JavaScript·CSS·HTML 처리 중 js-beautify 외부 요청이 없다', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => {
    if (request.url().includes('js-beautify')) requests.push(request.url());
  });
  await openTool(page, 'code-format');
  const io = ioSection(page);
  for (const [lang, source] of [
    ['js', 'const value={a:1};'],
    ['css', '.a{color:red}'],
    ['html', '<div><span>a</span></div>'],
  ]) {
    await io.getByLabel('언어').selectOption(lang);
    await io.locator('textarea.mono:not(.out)').fill(source);
    await io.getByRole('button', { name: '포맷', exact: true }).click();
    await expect(io.locator('textarea.out')).not.toHaveValue('');
  }
  expect(requests).toEqual([]);
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
