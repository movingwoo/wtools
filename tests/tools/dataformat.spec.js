// 데이터 포맷 변환 도구 정밀 테스트 — 포맷 간 변환 결과와 왕복(round-trip) 보존을 검증한다.
import { test, expect, toolCase, openTool, ioSection, runIO } from '../helpers.js';

const JSON_SRC = '{"name":"WTools","version":1,"tags":["web","tools"]}';
const YAML_SRC = 'name: WTools\nversion: 1\ntags:\n  - web\n  - tools\n';
const JSON_PRETTY = '{\n  "name": "WTools",\n  "version": 1,\n  "tags": [\n    "web",\n    "tools"\n  ]\n}';

const cases = [
  /* ---------- data-convert: 포맷 간 변환 ---------- */
  { name: 'data-convert: JSON → YAML', tool: 'data-convert', options: { '입력 포맷': 'json', '출력 포맷': 'yaml' }, inputs: JSON_SRC, output: YAML_SRC },
  { name: 'data-convert: YAML → JSON', tool: 'data-convert', options: { '입력 포맷': 'yaml', '출력 포맷': 'json' }, inputs: YAML_SRC, output: JSON_PRETTY },
  {
    name: 'data-convert: JSON → XML', tool: 'data-convert', options: { '입력 포맷': 'json', '출력 포맷': 'xml' }, inputs: JSON_SRC,
    output: '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <name>WTools</name>\n  <version>1</version>\n  <tags>web</tags>\n  <tags>tools</tags>\n</root>',
  },
  {
    name: 'data-convert: XML → JSON (속성은 @, 반복 태그는 배열)', tool: 'data-convert',
    options: { '입력 포맷': 'xml', '출력 포맷': 'json' },
    inputs: '<?xml version="1.0"?>\n<root id="7"><name>WTools</name><tag>web</tag><tag>tools</tag></root>',
    output: '{\n  "root": {\n    "@id": "7",\n    "name": "WTools",\n    "tag": [\n      "web",\n      "tools"\n    ]\n  }\n}',
  },
  {
    name: 'data-convert: JSON 배열 → CSV', tool: 'data-convert', options: { '입력 포맷': 'json', '출력 포맷': 'csv' },
    inputs: '[{"id":1,"name":"김철수"},{"id":2,"name":"이영희"}]', output: 'id,name\n1,김철수\n2,이영희',
  },
  {
    name: 'data-convert: CSV → JSON (따옴표 안 쉼표 유지)', tool: 'data-convert', options: { '입력 포맷': 'csv', '출력 포맷': 'json' },
    inputs: 'id,name\n1,김철수\n2,"이,영희"',
    output: '[\n  {\n    "id": "1",\n    "name": "김철수"\n  },\n  {\n    "id": "2",\n    "name": "이,영희"\n  }\n]',
  },
  { name: 'data-convert: JSON → TOML', tool: 'data-convert', options: { '입력 포맷': 'json', '출력 포맷': 'toml' }, inputs: JSON_SRC, output: 'name = "WTools"\nversion = 1\ntags = [ "web", "tools" ]' },
  { name: 'data-convert: TOML → JSON', tool: 'data-convert', options: { '입력 포맷': 'toml', '출력 포맷': 'json' }, inputs: 'name = "WTools"\nversion = 1\ntags = ["web", "tools"]\n', output: JSON_PRETTY },
  {
    name: 'data-convert: JSON → ENV (공백 값은 따옴표)', tool: 'data-convert', options: { '입력 포맷': 'json', '출력 포맷': 'env' },
    inputs: '{"NAME":"W Tools","PORT":8080,"DEBUG":true}', output: 'NAME="W Tools"\nPORT=8080\nDEBUG=true',
  },
  {
    name: 'data-convert: ENV → JSON (주석·export·따옴표 처리)', tool: 'data-convert', options: { '입력 포맷': 'env', '출력 포맷': 'json' },
    inputs: '# 주석\nexport NAME="W Tools"\nPORT=8080\nQUOTED=\'a b\' # 뒤 주석\n',
    output: '{\n  "NAME": "W Tools",\n  "PORT": "8080",\n  "QUOTED": "a b"\n}',
  },

  // data-convert: 오류 처리
  {
    name: 'data-convert: ENV 중복 키는 줄 번호와 함께 에러', tool: 'data-convert', options: { '입력 포맷': 'env', '출력 포맷': 'json' },
    inputs: 'A=1\nA=2\n', error: 'ENV 구문 오류:\n2행: "A" 키가 중복되었습니다. (처음 선언: 1행)',
  },
  {
    name: 'data-convert: ENV 잘못된 변수명은 에러', tool: 'data-convert', options: { '입력 포맷': 'env', '출력 포맷': 'json' },
    inputs: '1PORT=8080\n', error: 'ENV 구문 오류:\n1행: 올바르지 않은 변수명 "1PORT"입니다.',
  },
  {
    name: 'data-convert: 중첩 객체는 ENV로 변환 불가', tool: 'data-convert', options: { '입력 포맷': 'json', '출력 포맷': 'env' },
    inputs: '{"a":{"b":1}}', error: 'ENV는 중첩 객체나 배열을 표현할 수 없습니다. 평면 객체를 입력하세요.',
  },
  {
    name: 'data-convert: 배열은 TOML 최상위가 될 수 없음', tool: 'data-convert', options: { '입력 포맷': 'json', '출력 포맷': 'toml' },
    inputs: '[1,2]', error: 'TOML의 최상위는 객체(테이블)여야 합니다.',
  },
  {
    name: 'data-convert: 객체 배열이 아니면 CSV 변환 불가', tool: 'data-convert', options: { '입력 포맷': 'json', '출력 포맷': 'csv' },
    inputs: '{"a":1}', error: 'CSV로 변환하려면 객체 배열 형태의 데이터가 필요합니다.',
  },
  { name: 'data-convert: 잘못된 JSON은 에러', tool: 'data-convert', options: { '입력 포맷': 'json', '출력 포맷': 'yaml' }, inputs: '{bad json', output: /^⚠ .*JSON/ },

  /* ---------- json-query ---------- */
  {
    name: 'json-query: JSONPath 전체 선택', tool: 'json-query',
    inputs: ['{"users":[{"name":"김민수","age":31},{"name":"이서연","age":27}]}', '$.users[*].name'],
    output: '[\n  "김민수",\n  "이서연"\n]',
  },
  {
    name: 'json-query: JSONPath 필터', tool: 'json-query',
    inputs: ['{"users":[{"name":"김민수","age":31},{"name":"이서연","age":27}]}', '$.users[?(@.age > 30)].name'],
    output: '[\n  "김민수"\n]',
  },
  {
    name: 'json-query: JMESPath 필터', tool: 'json-query', options: { '문법': 'jmespath' },
    inputs: ['{"users":[{"name":"김민수","age":31},{"name":"이서연","age":27}]}', 'users[?age > `30`].name'],
    output: '[\n  "김민수"\n]',
  },
  {
    name: 'json-query: 잘못된 JSON은 에러', tool: 'json-query',
    inputs: ['{bad', '$.a'], output: /^⚠ .*JSON/,
  },

  /* ---------- json-schema ---------- */
  {
    name: 'json-schema: 스키마에 맞는 데이터', tool: 'json-schema',
    inputs: ['{"name":"홍길동","age":20}', null], action: '검증',
    output: '✔ JSON 데이터가 스키마에 맞습니다.',
  },
  {
    name: 'json-schema: 필수 항목 누락과 최솟값 위반', tool: 'json-schema',
    inputs: ['{"age":-1}', null], action: '검증',
    output: "1. /: should have required property 'name'\n2. /age: should be >= 0",
  },
  {
    name: 'json-schema: 스키마 기반 샘플 생성', tool: 'json-schema',
    inputs: [null, null], action: '샘플 생성',
    output: '{\n  "name": "홍길동",\n  "age": 0\n}',
  },
  {
    name: 'json-schema: 스키마가 비면 에러', tool: 'json-schema',
    inputs: ['{}', ' '], action: '검증', error: 'JSON Schema를 입력하세요.',
  },

  /* ---------- table-convert ---------- */
  { name: 'table-convert: CSV → Markdown 표', tool: 'table-convert', options: { '입력': 'csv', '출력': 'md' }, inputs: '이름,나이\n김철수,29', output: '| 이름 | 나이 |\n| --- | --- |\n| 김철수 | 29 |' },
  {
    name: 'table-convert: CSV → HTML 표', tool: 'table-convert', options: { '입력': 'csv', '출력': 'html' }, inputs: '이름,나이\n김철수,29',
    output: '<table>\n  <thead>\n    <tr><th>이름</th><th>나이</th></tr>\n  </thead>\n  <tbody>\n    <tr><td>김철수</td><td>29</td></tr>\n  </tbody>\n</table>',
  },
  {
    name: 'table-convert: CSV → ASCII 표', tool: 'table-convert', options: { '입력': 'csv', '출력': 'ascii' }, inputs: '이름,나이\n김철수,29',
    output: '+-----+----+\n| 이름  | 나이 |\n+-----+----+\n| 김철수 | 29 |\n+-----+----+',
  },
  { name: 'table-convert: Markdown 표 → CSV', tool: 'table-convert', options: { '입력': 'md', '출력': 'csv' }, inputs: '| 이름 | 나이 |\n| --- | --- |\n| 김철수 | 29 |', output: '이름,나이\n김철수,29' },
  { name: 'table-convert: CSV → JSON', tool: 'table-convert', options: { '입력': 'csv', '출력': 'json' }, inputs: '이름,나이\n김철수,29', output: '[\n  {\n    "이름": "김철수",\n    "나이": "29"\n  }\n]' },
  { name: 'table-convert: TSV → CSV (쉼표 포함 값은 따옴표)', tool: 'table-convert', options: { '입력': 'tsv', '출력': 'csv' }, inputs: 'a\tb\n1\t2,3', output: 'a,b\n1,"2,3"' },
  { name: 'table-convert: HTML 표는 특수문자 이스케이프', tool: 'table-convert', options: { '입력': 'csv', '출력': 'html' }, inputs: 'a\n<b>&', output: '<table>\n  <thead>\n    <tr><th>a</th></tr>\n  </thead>\n  <tbody>\n    <tr><td>&lt;b&gt;&amp;</td></tr>\n  </tbody>\n</table>' },

  /* ---------- list-convert ---------- */
  {
    name: 'list-convert: 정렬 + 중복 제거 + 따옴표', tool: 'list-convert',
    options: { '정렬': 'asc', '중복 제거': true, '감싸기': "'", '출력 구분자': ', ' },
    inputs: 'banana\napple\ncherry\napple', output: "'apple', 'banana', 'cherry'\n\n// 3개 항목",
  },
  { name: 'list-convert: 숫자 오름차순', tool: 'list-convert', options: { '정렬': 'num' }, inputs: '10\n9\n100', output: '9\n10\n100\n\n// 3개 항목' },
  { name: 'list-convert: 순서 뒤집기', tool: 'list-convert', options: { '정렬': 'rev' }, inputs: 'a\nb\nc', output: 'c\nb\na\n\n// 3개 항목' },
  {
    name: 'list-convert: 쉼표 입력 → 줄바꿈 출력, 접두사/접미사', tool: 'list-convert',
    options: { '입력 구분자': ',', '접두사': '- ', '접미사': ';' }, inputs: 'a, b ,c',
    output: '- a;\n- b;\n- c;\n\n// 3개 항목',
  },

  /* ---------- color-convert ---------- */
  {
    name: 'color-convert: HEX 입력', tool: 'color-convert', inputs: '#3b82f6',
    kv: { 'HEX': '#3b82f6', 'RGB': 'rgb(59, 130, 246)', 'HSL': 'hsl(217, 91%, 60%)', 'CMYK': 'cmyk(76%, 47%, 0%, 4%)', 'RGB (0-1)': '0.231, 0.510, 0.965' },
  },
  { name: 'color-convert: rgb() 입력', tool: 'color-convert', inputs: 'rgb(255, 0, 0)', kv: { 'HEX': '#ff0000', 'HSL': 'hsl(0, 100%, 50%)', 'CMYK': 'cmyk(0%, 100%, 100%, 0%)' } },
  { name: 'color-convert: hsl() 입력', tool: 'color-convert', inputs: 'hsl(120, 100%, 25%)', kv: { 'HEX': '#008000', 'RGB': 'rgb(0, 128, 0)' } },
  { name: 'color-convert: 3자리 HEX 확장', tool: 'color-convert', inputs: '#f0a', kv: { 'HEX': '#ff00aa' } },
  { name: 'color-convert: 알 수 없는 형식은 에러', tool: 'color-convert', inputs: 'not-a-color', htmlError: '인식할 수 없는 색상 형식입니다. (#hex, rgb(), hsl(), cmyk() 지원)' },

  /* ---------- color-contrast (WCAG) ---------- */
  {
    name: 'color-contrast: 흑백 최대 대비 21:1', tool: 'color-contrast', inputs: ['#000000', '#ffffff'],
    kv: { '대비율': '21.00 : 1', 'AA — 일반 텍스트': '✅ 통과 (기준 4.5:1)', 'AAA — 일반 텍스트': '✅ 통과 (기준 7:1)' },
  },
  {
    name: 'color-contrast: AA 미달 경계값', tool: 'color-contrast', inputs: ['#777777', '#ffffff'],
    kv: { '대비율': '4.48 : 1', 'AA — 일반 텍스트': '❌ 미달 (기준 4.5:1)', 'AA — 큰 텍스트 (18pt 또는 14pt bold)': '✅ 통과 (기준 3:1)' },
  },

  /* ---------- data-unit ---------- */
  {
    name: 'data-unit: 1 GiB 환산표', tool: 'data-unit', options: { '단위': 'GiB' }, inputs: '1',
    kv: { 'B': '1,073,741,824', 'KiB': '1,048,576', 'MiB': '1,024', 'GiB': '1', 'GB': '1.07374182', 'bit': '8,589,934,592' },
  },
  { name: 'data-unit: 1000 B는 1 KB', tool: 'data-unit', options: { '단위': 'B' }, inputs: '1000', kv: { 'KB': '1', 'KiB': '0.9765625' } },
  { name: 'data-unit: 숫자가 아니면 에러', tool: 'data-unit', inputs: 'abc', htmlError: '숫자를 입력하세요.' },

  /* ---------- ip-format ---------- */
  {
    name: 'ip-format: IPv4 분해', tool: 'ip-format', inputs: '192.168.0.1',
    kv: {
      '점 표기 (10진)': '192.168.0.1', '32비트 10진수': '3232235521', '16진수': '0xC0A80001',
      '2진수': '11000000.10101000.00000000.00000001', 'IPv6 매핑 주소': '::ffff:192.168.0.1',
      '6to4 프리픽스': '2002:c0a8:0001::/48',
    },
  },
  { name: 'ip-format: 32비트 10진수 입력', tool: 'ip-format', inputs: '3232235521', kv: { '점 표기 (10진)': '192.168.0.1' } },
  { name: 'ip-format: 옥텟 범위 초과는 에러', tool: 'ip-format', inputs: '999.1.1.1', htmlError: '각 옥텟은 0~255 범위여야 합니다.' },
  { name: 'ip-format: 32비트 범위 초과는 에러', tool: 'ip-format', inputs: '4294967296', htmlError: '32비트 범위를 벗어났습니다.' },
];

for (const c of cases) toolCase(c);

/* ---------- 왕복(round-trip) 변환 ---------- */

test('data-convert: JSON → YAML → JSON 왕복 보존', async ({ page }) => {
  await openTool(page, 'data-convert');
  const io = ioSection(page);
  const yaml = await runIO(io, { options: { '입력 포맷': 'json', '출력 포맷': 'yaml' }, inputs: JSON_SRC });
  const back = await runIO(io, { options: { '입력 포맷': 'yaml', '출력 포맷': 'json' }, inputs: yaml });
  expect(JSON.parse(back)).toEqual(JSON.parse(JSON_SRC));
});

test('data-convert: JSON → TOML → JSON 왕복 보존', async ({ page }) => {
  await openTool(page, 'data-convert');
  const io = ioSection(page);
  const toml = await runIO(io, { options: { '입력 포맷': 'json', '출력 포맷': 'toml' }, inputs: JSON_SRC });
  const back = await runIO(io, { options: { '입력 포맷': 'toml', '출력 포맷': 'json' }, inputs: toml });
  expect(JSON.parse(back)).toEqual(JSON.parse(JSON_SRC));
});

test('data-convert: JSON → CSV → JSON 왕복 (값은 문자열로 남음)', async ({ page }) => {
  await openTool(page, 'data-convert');
  const io = ioSection(page);
  const src = '[{"id":1,"name":"김철수","note":"쉼표, 포함"},{"id":2,"name":"이영희","note":"줄바꿈\\n포함"}]';
  const csv = await runIO(io, { options: { '입력 포맷': 'json', '출력 포맷': 'csv' }, inputs: src });
  const back = await runIO(io, { options: { '입력 포맷': 'csv', '출력 포맷': 'json' }, inputs: csv });
  expect(JSON.parse(back)).toEqual([
    { id: '1', name: '김철수', note: '쉼표, 포함' },
    { id: '2', name: '이영희', note: '줄바꿈\n포함' },
  ]);
});

test('data-convert: JSON → ENV → JSON 왕복 (값은 문자열로 남음)', async ({ page }) => {
  await openTool(page, 'data-convert');
  const io = ioSection(page);
  const src = '{"NAME":"W Tools","PORT":8080,"PATH_A":"/usr/local","QUOTE":"say \\"hi\\""}';
  const env = await runIO(io, { options: { '입력 포맷': 'json', '출력 포맷': 'env' }, inputs: src });
  const back = await runIO(io, { options: { '입력 포맷': 'env', '출력 포맷': 'json' }, inputs: env });
  expect(JSON.parse(back)).toEqual({ NAME: 'W Tools', PORT: '8080', PATH_A: '/usr/local', QUOTE: 'say "hi"' });
});

test('data-convert: JSON → XML → JSON 왕복 (root로 감싸이고 값은 문자열)', async ({ page }) => {
  await openTool(page, 'data-convert');
  const io = ioSection(page);
  const xml = await runIO(io, { options: { '입력 포맷': 'json', '출력 포맷': 'xml' }, inputs: JSON_SRC });
  const back = await runIO(io, { options: { '입력 포맷': 'xml', '출력 포맷': 'json' }, inputs: xml });
  expect(JSON.parse(back)).toEqual({ root: { name: 'WTools', version: '1', tags: ['web', 'tools'] } });
});

test('table-convert: CSV → Markdown → CSV 왕복 보존', async ({ page }) => {
  await openTool(page, 'table-convert');
  const io = ioSection(page);
  const csv = '이름,나이,도시\n김철수,29,서울\n이영희,34,부산';
  const md = await runIO(io, { options: { '입력': 'csv', '출력': 'md' }, inputs: csv });
  const back = await runIO(io, { options: { '입력': 'md', '출력': 'csv' }, inputs: md });
  expect(back).toBe(csv);
});
