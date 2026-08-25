// 데이터 포맷 변환 도구 정밀 테스트 — 포맷 간 변환 결과와 왕복(round-trip) 보존을 검증한다.
import { test, expect, toolCases, openTool, ioSection, runIO, setOption, fillInputs, clickAction, uploadFile, grabDownload, kvValue } from '../helpers.js';

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
  {
    name: 'data-convert: 중복·빈 헤더와 헤더보다 긴 행의 열을 모두 보존', tool: 'data-convert', options: { '입력 포맷': 'csv', '출력 포맷': 'json' },
    inputs: 'id,,id\n1,가,2,추가',
    output: '[\n  {\n    "id": "1",\n    "열2": "가",\n    "id_2": "2",\n    "열4": "추가"\n  }\n]',
  },
  {
    name: 'data-convert: 세미콜론 구분자와 헤더 없는 CSV', tool: 'data-convert',
    options: { '입력 포맷': 'csv', '출력 포맷': 'json', 'CSV 구분자': ';', 'CSV 헤더 포함': false },
    inputs: '1;김철수\n2;이영희',
    output: '[\n  {\n    "열1": "1",\n    "열2": "김철수"\n  },\n  {\n    "열1": "2",\n    "열2": "이영희"\n  }\n]',
  },
  {
    name: 'data-convert: JSON → 파이프 구분·헤더 없는 CSV', tool: 'data-convert',
    options: { '입력 포맷': 'json', '출력 포맷': 'csv', 'CSV 구분자': '|', 'CSV 헤더 포함': false },
    inputs: '[{"id":1,"name":"김철수"},{"id":2,"name":"이영희"}]', output: '1|김철수\n2|이영희',
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
  {
    name: 'data-convert: 닫히지 않은 따옴표는 시작 줄과 함께 에러', tool: 'data-convert', options: { '입력 포맷': 'csv', '출력 포맷': 'json' },
    inputs: 'id,note\r\n1,"첫 줄\r\n둘째 줄', error: 'CSV 구문 오류: 2행에서 시작한 따옴표가 닫히지 않았습니다.',
  },
  {
    name: 'data-convert: 닫는 따옴표 뒤의 문자는 에러', tool: 'data-convert', options: { '입력 포맷': 'csv', '출력 포맷': 'json' },
    inputs: 'id,note\n1,"값"oops', error: 'CSV 구문 오류: 2행의 닫는 따옴표 뒤에는 구분자나 줄바꿈만 올 수 있습니다.',
  },
  { name: 'data-convert: 잘못된 JSON은 에러', tool: 'data-convert', options: { '입력 포맷': 'json', '출력 포맷': 'yaml' }, inputs: '{bad json', output: /^⚠ .*JSON/ },

  /* ---------- JSON Lines / NDJSON ---------- */
  {
    name: 'json-lines: NDJSON → JSON 배열', tool: 'json-lines', action: '변환',
    options: { '입력 포맷': 'ndjson', '출력 포맷': 'json' },
    inputs: '{"id":1,"name":"김민수"}\n{"id":2,"name":"이서연"}',
    output: '[\n  {\n    "id": 1,\n    "name": "김민수"\n  },\n  {\n    "id": 2,\n    "name": "이서연"\n  }\n]',
  },
  {
    name: 'json-lines: JSON 배열 → NDJSON', tool: 'json-lines', action: '변환',
    options: { '입력 포맷': 'json', '출력 포맷': 'ndjson' },
    inputs: '[{"id":1},{"id":2,"ok":true}]', output: '{"id":1}\n{"id":2,"ok":true}',
  },
  {
    name: 'json-lines: NDJSON → CSV는 전체 키와 중첩 값을 보존', tool: 'json-lines', action: '변환',
    options: { '입력 포맷': 'ndjson', '출력 포맷': 'csv' },
    inputs: '{"id":1,"meta":{"active":true}}\n{"id":2,"name":"이서연"}',
    output: 'id,meta,name\n1,"{""active"":true}",\n2,,이서연',
  },
  {
    name: 'json-lines: CSV → NDJSON', tool: 'json-lines', action: '변환',
    options: { '입력 포맷': 'csv', '출력 포맷': 'ndjson', 'CSV 구분자': ';' },
    inputs: 'id;name\n1;김민수\n2;이서연', output: '{"id":"1","name":"김민수"}\n{"id":"2","name":"이서연"}',
  },
  {
    name: 'json-lines: NDJSON → YAML 목록', tool: 'json-lines', action: '변환',
    options: { '입력 포맷': 'ndjson', '출력 포맷': 'yaml' },
    inputs: '{"id":1,"name":"김민수"}\n{"id":2,"name":"이서연"}',
    output: '- id: 1\n  name: 김민수\n- id: 2\n  name: 이서연\n',
  },
  {
    name: 'json-lines: BOM·CRLF·빈 줄 허용', tool: 'json-lines', action: '변환',
    options: { '입력 포맷': 'ndjson', '출력 포맷': 'json' },
    inputs: '\uFEFF{"id":1}\r\n\r\n{"id":2}\r\n', output: '[\n  {\n    "id": 1\n  },\n  {\n    "id": 2\n  }\n]',
  },
  {
    name: 'json-lines: 잘못된 레코드는 실제 줄 번호로 에러', tool: 'json-lines', action: '변환',
    options: { '입력 포맷': 'ndjson', '출력 포맷': 'json' },
    inputs: '{"id":1}\n\n{"id":}', error: 'NDJSON 구문 오류: 3행의 JSON 문법이 올바르지 않습니다. 입력: {"id":}',
  },
  {
    name: 'json-lines: JSON 객체 하나는 레코드 배열로 묵시 변환하지 않음', tool: 'json-lines', action: '변환',
    options: { '입력 포맷': 'json', '출력 포맷': 'ndjson' },
    inputs: '{"id":1}', error: 'JSON에서 레코드를 변환하려면 최상위 데이터가 배열이어야 합니다.',
  },
  {
    name: 'json-lines: CSV 출력은 객체 레코드만 허용', tool: 'json-lines', action: '변환',
    options: { '입력 포맷': 'ndjson', '출력 포맷': 'csv' },
    inputs: '{"id":1}\n"문자열"', error: 'CSV로 변환할 2번째 레코드는 객체여야 합니다.',
  },

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
  // JSON Schema Test Suite의 draft4/type.json, draft6/const.json,
  // draft7/contains.json과 최신 draft의 해당 핵심 키워드 벡터를 축약해 고정한다.
  {
    name: 'json-schema 공식 벡터: Draft 4 type', tool: 'json-schema',
    inputs: ['"1"', '{"$schema":"http://json-schema.org/draft-04/schema#","type":"integer"}'],
    action: '검증', output: '1. /: 예상 타입은 integer이지만 실제 타입은 string입니다.',
  },
  {
    name: 'json-schema 공식 벡터: Draft 6 const', tool: 'json-schema',
    inputs: ['2', '{"$schema":"http://json-schema.org/draft-06/schema#","const":1}'],
    action: '검증', output: '1. /: const에 지정된 값과 일치하지 않습니다.',
  },
  {
    name: 'json-schema 공식 벡터: Draft 7 contains', tool: 'json-schema',
    inputs: ['[1,2,3]', '{"$schema":"http://json-schema.org/draft-07/schema#","contains":{"type":"string"}}'],
    action: '검증', output: '1. /: contains 스키마와 일치하는 배열 항목이 없습니다.',
  },
  {
    name: 'json-schema: 스키마에 맞는 데이터', tool: 'json-schema',
    inputs: ['{"name":"홍길동","age":20}', null], action: '검증',
    output: '✔ JSON 데이터가 스키마에 맞습니다.',
  },
  {
    name: 'json-schema: 필수 항목 누락과 최솟값 위반', tool: 'json-schema',
    inputs: ['{"age":-1}', null], action: '검증',
    output: '1. /: 필수 속성 "name"이(가) 없습니다.\n2. /age: 값 -1은(는) 최솟값 0보다 작습니다.',
  },
  {
    name: 'json-schema: Draft 2019-09 dependentRequired 검증', tool: 'json-schema',
    inputs: [
      '{"creditCard":"1234"}',
      '{"$schema":"https://json-schema.org/draft/2019-09/schema","type":"object","dependentRequired":{"creditCard":["billingAddress"]}}',
    ],
    action: '검증', output: '1. /: 검증에 실패했습니다 (dependentRequired).',
  },
  {
    name: 'json-schema: Draft 2020-12 prefixItems 검증', tool: 'json-schema',
    inputs: [
      '["첫째",2]',
      '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"array","prefixItems":[{"type":"string"}],"items":false}',
    ],
    action: '검증', output: '1. /1: 허용되지 않은 값입니다.',
  },
  {
    name: 'json-schema: 스키마 기반 샘플 생성', tool: 'json-schema',
    inputs: [null, null], action: '샘플 생성',
    output: '{\n  "name": "홍길동",\n  "age": 0\n}',
  },
  {
    name: 'json-schema: 로컬 $ref와 required, allOf, pattern 샘플', tool: 'json-schema',
    inputs: [null, '{"$defs":{"base":{"type":"object","required":["id"],"properties":{"id":{"type":"string","pattern":"^[A-Z]{2}-\\\\d{3}$"}}},"person":{"type":"object","required":["name"],"properties":{"name":{"const":"홍길동"}}}},"allOf":[{"$ref":"#/$defs/base"},{"$ref":"#/$defs/person"}]}'],
    action: '샘플 생성', output: '{\n  "id": "AA-000",\n  "name": "홍길동"\n}',
  },
  {
    name: 'json-schema: oneOf 첫 분기 샘플', tool: 'json-schema',
    inputs: [null, '{"oneOf":[{"type":"string","const":"첫째"},{"type":"integer","minimum":10}]}'],
    action: '샘플 생성', output: '"첫째"',
  },
  {
    name: 'json-schema: prefixItems와 minItems 샘플', tool: 'json-schema',
    inputs: [null, '{"type":"array","prefixItems":[{"const":"머리"},{"type":"integer","minimum":5}],"items":{"type":"boolean"},"minItems":4}'],
    action: '샘플 생성', output: '[\n  "머리",\n  5,\n  false,\n  false\n]',
  },
  {
    name: 'json-schema: items false는 빈 배열 샘플', tool: 'json-schema',
    inputs: [null, '{"type":"array","items":false}'], action: '샘플 생성', output: '[]',
  },
  {
    name: 'json-schema: 외부 $ref는 네트워크 요청 없이 거부', tool: 'json-schema',
    inputs: [null, '{"$ref":"https://example.com/schema.json"}'], action: '샘플 생성',
    error: '외부 $ref는 네트워크로 가져오지 않습니다: https://example.com/schema.json',
  },
  {
    name: 'json-schema: 미지원 최신 키워드는 묵살하지 않고 거부', tool: 'json-schema',
    inputs: ['{}', '{"$schema":"https://json-schema.org/draft/2020-12/schema","unevaluatedProperties":false}'],
    action: '검증', error: '현재 검증기가 지원하지 않는 키워드입니다: unevaluatedProperties',
  },
  {
    name: 'json-schema: 스키마가 비면 에러', tool: 'json-schema',
    inputs: ['{}', ' '], action: '검증', error: 'JSON Schema를 입력하세요.',
  },
  {
    name: 'json-schema: 잘못된 스키마는 에러', tool: 'json-schema',
    inputs: ['{}', '{"type":"unknown"}'], action: '검증',
    error: 'JSON Schema 오류: 키워드 "type"에 올바른 형식의 값이 필요합니다: array,boolean,integer,number,null,object,string',
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

toolCases('dataformat', cases);

test('json-lines: 텍스트 결과를 선택한 포맷 파일로 다운로드한다', async ({ page }) => {
  await openTool(page, 'json-lines');
  const io = ioSection(page, 0);
  await setOption(io, '입력 포맷', 'ndjson');
  await setOption(io, '출력 포맷', 'json');
  await fillInputs(io, '{"id":1}\n{"id":2}');
  const result = await grabDownload(page, () => clickAction(io, '결과 다운로드'));
  expect(result.name).toBe('wtools-json-lines.json');
  expect(JSON.parse(result.bytes.toString('utf8'))).toEqual([{ id: 1 }, { id: 2 }]);
});

test('json-lines: 큰 NDJSON 파일을 청크 경계 너머까지 읽고 전체 키로 CSV를 만든다', async ({ page }) => {
  await openTool(page, 'json-lines');
  const io = ioSection(page, 1);
  const records = Array.from({ length: 7000 }, (_, index) => ({
    id: index + 1,
    name: `행-${index + 1}-${'가'.repeat(70)}`,
    nested: { even: index % 2 === 0 },
    ...(index === 6999 ? { extra: '마지막 열' } : {}),
  }));
  const source = '\uFEFF' + records.map((record) => JSON.stringify(record)).join('\r\n');
  await uploadFile(io, '변환할 레코드 파일 선택', {
    name: 'large.jsonl', mimeType: 'application/x-ndjson', buffer: Buffer.from(source),
  });
  await setOption(io, '출력 포맷', 'csv');
  const result = await grabDownload(page, () => clickAction(io, '파일 변환 및 다운로드'));
  expect(result.name).toBe('large.csv');
  const csv = result.bytes.toString('utf8');
  const lines = csv.split('\n');
  expect(lines).toHaveLength(7001);
  expect(lines[0]).toBe('id,name,nested,extra');
  expect(lines[1]).toContain('1,행-1-');
  expect(lines[1]).toContain('"{""even"":true}"');
  expect(lines.at(-1)).toContain('7000,행-7000-');
  expect(lines.at(-1).endsWith(',마지막 열')).toBe(true);
  await expect.poll(() => kvValue(io, '처리한 레코드')).toBe('7,000개');
});

test('json-lines: 파일의 잘못된 JSON을 실제 줄 번호와 함께 중단한다', async ({ page }) => {
  await openTool(page, 'json-lines');
  const io = ioSection(page, 1);
  await uploadFile(io, '변환할 레코드 파일 선택', {
    name: 'broken.ndjson', mimeType: 'application/x-ndjson', buffer: Buffer.from('{"id":1}\n\n{"id":}\n'),
  });
  await clickAction(io, '파일 변환 및 다운로드');
  await expect(io.locator('.error').first()).toContainText('NDJSON 구문 오류: 3행의 JSON 문법이 올바르지 않습니다.');
  await expect(io.locator('.io-status')).toContainText('처리 실패');
});

test('json-lines: 대용량 파일 변환을 취소할 수 있다', async ({ page }) => {
  await openTool(page, 'json-lines');
  const io = ioSection(page, 1);
  const source = Array.from({ length: 300_000 }, (_, index) => `{"id":${index}}`).join('\n');
  await uploadFile(io, '변환할 레코드 파일 선택', {
    name: 'cancel.ndjson', mimeType: 'application/x-ndjson', buffer: Buffer.from(source),
  });
  await clickAction(io, '파일 변환 및 다운로드');
  const cancel = io.getByRole('button', { name: '취소', exact: true });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(io.locator('.io-status')).toHaveText('작업이 취소되었습니다.');
});

test('json-lines: JSON 배열 파일을 청크 파싱해 NDJSON으로 디스크에 직접 저장한다', async ({ page }) => {
  await page.addInitScript(() => {
    window.__directFile = { chunks: [], closed: false, aborted: false };
    window.showSaveFilePicker = async (options) => ({
      name: options.suggestedName,
      async createWritable() {
        return {
          async write(chunk) { window.__directFile.chunks.push(String(chunk)); },
          async close() { window.__directFile.closed = true; },
          async abort() { window.__directFile.aborted = true; },
        };
      },
    });
  });
  await openTool(page, 'json-lines');
  const io = ioSection(page, 1);
  const records = Array.from({ length: 9000 }, (_, index) => ({
    id: index + 1,
    text: `${'가'.repeat(35)}-${index + 1}`,
    nested: [index, { active: index % 2 === 0 }],
  }));
  await uploadFile(io, '변환할 레코드 파일 선택', {
    name: 'records.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(records)),
  });
  await setOption(io, '입력 포맷', 'json');
  await setOption(io, '출력 포맷', 'ndjson');
  await setOption(io, '저장 방식', 'direct');
  await clickAction(io, '파일 변환 및 다운로드');
  await expect(io).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
  await expect.poll(() => kvValue(io, '처리한 레코드')).toBe('9,000개');
  expect(await kvValue(io, '저장 방식')).toBe('디스크 직접 저장');
  const saved = await page.evaluate(() => ({ ...window.__directFile, text: window.__directFile.chunks.join('') }));
  expect(saved.closed).toBe(true);
  expect(saved.aborted).toBe(false);
  const lines = saved.text.trim().split('\n').map(JSON.parse);
  expect(lines).toHaveLength(records.length);
  expect(lines[0]).toEqual(records[0]);
  expect(lines.at(-1)).toEqual(records.at(-1));
});

test('json-lines: 디스크 직접 저장 미지원 브라우저는 호환 방식을 안내한다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  await openTool(page, 'json-lines');
  const io = ioSection(page, 1);
  await uploadFile(io, '변환할 레코드 파일 선택', {
    name: 'records.ndjson', mimeType: 'application/x-ndjson', buffer: Buffer.from('{"id":1}\n'),
  });
  await setOption(io, '저장 방식', 'direct');
  await clickAction(io, '파일 변환 및 다운로드');
  await expect(io.locator('.error').first()).toContainText('이 브라우저는 디스크 직접 저장을 지원하지 않습니다. 호환 다운로드 방식을 선택하세요.');
});

test('json-lines: 디스크 직접 저장 쓰기 실패 시 부분 파일을 중단한다', async ({ page }) => {
  await page.addInitScript(() => {
    window.__directFileAborted = false;
    window.showSaveFilePicker = async () => ({
      name: 'records.ndjson',
      async createWritable() {
        return {
          async write() { throw new Error('디스크 쓰기 실패'); },
          async close() {},
          async abort() { window.__directFileAborted = true; },
        };
      },
    });
  });
  await openTool(page, 'json-lines');
  const io = ioSection(page, 1);
  await uploadFile(io, '변환할 레코드 파일 선택', {
    name: 'records.ndjson', mimeType: 'application/x-ndjson', buffer: Buffer.from('{"id":1}\n'),
  });
  await setOption(io, '출력 포맷', 'ndjson');
  await setOption(io, '저장 방식', 'direct');
  await clickAction(io, '파일 변환 및 다운로드');
  await expect(io.locator('.error').first()).toContainText('디스크 쓰기 실패');
  await expect.poll(() => page.evaluate(() => window.__directFileAborted)).toBe(true);
});

test('json-lines: 따옴표·줄바꿈이 있는 CSV 파일을 JSON 배열로 변환한다', async ({ page }) => {
  await openTool(page, 'json-lines');
  const io = ioSection(page, 1);
  const source = 'id,name,note\r\n1,홍길동,"첫 줄\r\n둘째 줄"\r\n2,"이""서연",완료\r\n';
  await uploadFile(io, '변환할 레코드 파일 선택', {
    name: 'records.csv', mimeType: 'text/csv', buffer: Buffer.from(source),
  });
  await setOption(io, '입력 포맷', 'csv');
  await setOption(io, '출력 포맷', 'json');
  const result = await grabDownload(page, () => clickAction(io, '파일 변환 및 다운로드'));
  expect(result.name).toBe('records.json');
  expect(JSON.parse(result.bytes.toString('utf8'))).toEqual([
    { id: '1', name: '홍길동', note: '첫 줄\r\n둘째 줄' },
    { id: '2', name: '이"서연', note: '완료' },
  ]);
});

test('json-lines: YAML 목록 파일을 NDJSON으로 변환한다', async ({ page }) => {
  await openTool(page, 'json-lines');
  const io = ioSection(page, 1);
  await uploadFile(io, '변환할 레코드 파일 선택', {
    name: 'records.yaml', mimeType: 'application/yaml',
    buffer: Buffer.from('- id: 1\n  tags: [a, b]\n- id: 2\n  active: true\n'),
  });
  await setOption(io, '입력 포맷', 'yaml');
  await setOption(io, '출력 포맷', 'ndjson');
  const result = await grabDownload(page, () => clickAction(io, '파일 변환 및 다운로드'));
  expect(result.name).toBe('records.ndjson');
  expect(result.bytes.toString('utf8').trim().split('\n').map(JSON.parse)).toEqual([
    { id: 1, tags: ['a', 'b'] }, { id: 2, active: true },
  ]);
});

test('json-lines: JSON 파일의 후행 쉼표를 명확히 거부한다', async ({ page }) => {
  await openTool(page, 'json-lines');
  const io = ioSection(page, 1);
  await uploadFile(io, '변환할 레코드 파일 선택', {
    name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('[{"id":1},]'),
  });
  await setOption(io, '입력 포맷', 'json');
  await clickAction(io, '파일 변환 및 다운로드');
  await expect(io.locator('.error').first()).toContainText('마지막 쉼표를 제거하세요.');
});

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

test('YAML/TOML 파서: 악성 복잡도와 연속 주석 입력을 제한된 시간에 처리한다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const mergeCount = 4_000;
    const mergeChain = Array.from({ length: mergeCount }, (_, index) => index
      ? `a${index}: &a${index} { <<: *a${index - 1}, k${index}: ${index} }`
      : 'a0: &a0 { k0: 0 }').join('\n') + `\nb: *a${mergeCount - 1}`;
    const omap = '!!omap\n' + Array.from(
      { length: mergeCount }, (_, index) => `- k${index}: ${index}`,
    ).join('\n');
    const timed = (parse, input) => {
      const started = performance.now();
      try {
        const value = parse(input);
        return { elapsed: performance.now() - started, value };
      } catch (error) {
        return { elapsed: performance.now() - started, error: error.message };
      }
    };
    const merge = timed(jsyaml.load, mergeChain);
    const orderedMap = timed(jsyaml.load, omap);
    const { parse } = await import('/assets/vendor/smol-toml-1.6.1.mjs');
    const comments = timed(parse, '# 공격자 제어 주석\n'.repeat(50_000) + 'safe = true\n');
    return {
      merge: { elapsed: merge.elapsed, error: merge.error },
      orderedMap: { elapsed: orderedMap.elapsed, length: orderedMap.value?.length },
      comments: { elapsed: comments.elapsed, safe: comments.value?.safe, error: comments.error },
    };
  });

  expect(result.merge.error).toContain('maxTotalMergeKeys');
  expect(result.orderedMap.length).toBe(4_000);
  expect(result.comments).toMatchObject({ safe: true, error: undefined });
  expect(result.merge.elapsed).toBeLessThan(2_000);
  expect(result.orderedMap.elapsed).toBeLessThan(2_000);
  expect(result.comments.elapsed).toBeLessThan(2_000);
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

test('data-convert: CRLF 파싱·셀 내부 줄바꿈·따옴표 escape·빈 마지막 셀 보존', async ({ page }) => {
  await openTool(page, 'data-convert');
  const io = ioSection(page);
  const csv = 'id,note,last\r\n1,"첫 줄\r\n둘째 ""줄""",\r\n';
  const parsed = await page.evaluate(async (source) => {
    const { parseCSV } = await import('/js/tools/dataformat.js');
    return parseCSV(source);
  }, csv);
  expect(parsed).toEqual([
    ['id', 'note', 'last'],
    ['1', '첫 줄\r\n둘째 "줄"', ''],
  ]);

  // HTML textarea의 value는 사양에 따라 CRLF를 LF로 정규화한다.
  const output = await runIO(io, { options: { '입력 포맷': 'csv', '출력 포맷': 'json' }, inputs: csv });
  expect(JSON.parse(output)).toEqual([{ id: '1', note: '첫 줄\n둘째 "줄"', last: '' }]);
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
