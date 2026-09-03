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
    name: 'data-convert: YAML 앵커·merge·블록 문자열', tool: 'data-convert',
    options: { '입력 포맷': 'yaml', '출력 포맷': 'json' },
    inputs: 'base: &base\n  enabled: true\nitem:\n  <<: *base\n  note: |-\n    첫 줄\n    둘째 줄\n',
    output: '{\n  "base": {\n    "enabled": true\n  },\n  "item": {\n    "enabled": true,\n    "note": "첫 줄\\n둘째 줄"\n  }\n}',
  },
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
  { name: 'data-convert: YAML 중복 키는 행 번호로 에러', tool: 'data-convert', options: { '입력 포맷': 'yaml', '출력 포맷': 'json' }, inputs: 'a: 1\na: 2\n', error: 'YAML 구문 오류: 키 "a"가 중복되었습니다. (2행)' },
  { name: 'data-convert: YAML 사용자 태그는 안전하게 거부', tool: 'data-convert', options: { '입력 포맷': 'yaml', '출력 포맷': 'json' }, inputs: 'value: !javascript alert(1)', error: 'YAML 구문 오류: 안전한 데이터 태그만 지원합니다: !javascript (1행)' },
  { name: 'data-convert: YAML 다중 문서는 전용 API 안내와 함께 거부', tool: 'data-convert', options: { '입력 포맷': 'yaml', '출력 포맷': 'json' }, inputs: '---\na: 1\n---\nb: 2\n', error: 'YAML 구문 오류: load()에는 문서 하나만 입력할 수 있습니다. 다중 문서는 loadAll()을 사용하세요.' },

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
    name: 'json-query: RFC 9535 재귀 이름 선택', tool: 'json-query',
    inputs: ['{"store":{"book":[{"title":"A"},{"title":"B"}],"bicycle":{"title":"C"}}}', '$..title'],
    output: '[\n  "A",\n  "B",\n  "C"\n]',
  },
  {
    name: 'json-query: RFC 9535 합집합·음수 인덱스·슬라이스 순서 보존', tool: 'json-query',
    inputs: ['{"items":[0,1,2,3,4]}', '$.items[4,0,-1,1:4:2]'],
    output: '[\n  4,\n  0,\n  4,\n  1,\n  3\n]',
  },
  {
    name: 'json-query: RFC 9535 필터 존재·논리·null 동등 경계', tool: 'json-query',
    inputs: ['[{"id":1,"active":true,"value":null},{"id":2,"active":false,"value":null},{"id":3}]',
      '$[?@.active == true && @.value <= null].id'],
    output: '[\n  1\n]',
  },
  {
    name: 'json-query: RFC 9535 length·count·value 함수', tool: 'json-query',
    inputs: ['{"groups":[{"name":"가나","items":[1,2],"score":2},{"name":"다","items":[1],"score":1}]}',
      '$.groups[?length(@.name)==2 && count(@.items[*])==2 && value(@.score)==2].name'],
    output: '[\n  "가나"\n]',
  },
  {
    name: 'json-query: 임의 JavaScript 필터는 실행하지 않고 거부', tool: 'json-query',
    inputs: ['{"users":[{"age":31}]}', '$.users[?(@.age > globalThis.alert(1))]'],
    output: /^⚠ JSONPath 오류: 알 수 없는 필터 식별자 globalThis입니다\./,
  },
  {
    name: 'json-query: 미지원 정규식 함수는 명확히 안내', tool: 'json-query',
    inputs: ['[{"name":"Kim"}]', '$[?match(@.name, "K.*")]'],
    output: /^⚠ JSONPath 오류: match\(\) 함수는 지원하지 않습니다\./,
  },
  {
    name: 'json-query: 빈 JSON 입력은 빈 결과', tool: 'json-query',
    inputs: ['', '$.a'], output: '',
  },
  {
    name: 'json-query: 닫히지 않은 선택자는 위치와 함께 에러', tool: 'json-query',
    inputs: ['{"a":1}', '$['], output: /^⚠ JSONPath 오류: 대괄호 선택자가 닫히지 않았습니다\. \(2번째 문자\)$/,
  },
  {
    name: 'json-query: 질의 앞 공백은 RFC 문법 오류', tool: 'json-query',
    inputs: ['{"a":1}', ' $.a'], output: /^⚠ JSONPath 오류: 질의는 루트 식별자 \$로 시작해야 합니다\./,
  },
  {
    name: 'json-query: 비유한 JSON 숫자는 null로 바꾸지 않고 거부', tool: 'json-query',
    inputs: ['1e400', '$'], output: /^⚠ JSON 데이터 오류: 값이 유한한 숫자 범위를 벗어났습니다\./,
  },
  {
    name: 'json-query: JMESPath 필터', tool: 'json-query', options: { '문법': 'jmespath' },
    inputs: ['{"users":[{"name":"김민수","age":31},{"name":"이서연","age":27}]}', 'users[?age > `30`].name'],
    output: '[\n  "김민수"\n]',
  },
  {
    name: 'json-query: JMESPath 투영·정렬·다중 선택', tool: 'json-query',
    options: { '문법': 'jmespath' },
    inputs: [
      '{"users":[{"name":"김민수","age":31},{"name":"이서연","age":27}]}',
      'sort_by(users, &age)[].{name: name, age: age}',
    ],
    output: '[\n  {\n    "name": "이서연",\n    "age": 27\n  },\n  {\n    "name": "김민수",\n    "age": 31\n  }\n]',
  },
  {
    name: 'json-query: JMESPath 잘못된 함수 타입은 한국어 오류', tool: 'json-query',
    options: { '문법': 'jmespath' }, inputs: ['{}', 'abs(`false`)'],
    error: 'JMESPath 함수 "abs"의 인수 타입이 올바르지 않습니다.',
  },
  {
    name: 'json-query: JMESPath 잘못된 문법은 위치와 함께 오류', tool: 'json-query',
    options: { '문법': 'jmespath' }, inputs: ['{}', 'foo['],
    error: 'JMESPath 표현식의 문법이 올바르지 않습니다 (4번째 문자).',
  },
  {
    name: 'json-query: JMESPath 비유한 JSON 숫자는 거부', tool: 'json-query',
    options: { '문법': 'jmespath' }, inputs: ['1e400', '@'],
    error: 'JMESPath에서 처리할 수 없는 JSON 숫자 또는 값입니다.',
  },
  {
    name: 'json-query: JMESPath 빈 입력은 빈 결과', tool: 'json-query',
    options: { '문법': 'jmespath' }, inputs: ['', 'users[*].name'], output: '',
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
    name: 'json-schema: 큰 몫의 multipleOf를 오차로 허용하지 않음', tool: 'json-schema',
    inputs: ['100000000000000.05', '{"type":"number","multipleOf":0.1}'],
    action: '검증', output: '1. /: 값 100000000000000.05은(는) 0.1의 배수가 아닙니다.',
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
    name: 'json-schema 공식 벡터: Draft 4 exclusiveMinimum 불리언 의미', tool: 'json-schema',
    inputs: ['1', '{"$schema":"http://json-schema.org/draft-04/schema#","minimum":1,"exclusiveMinimum":true}'],
    action: '검증', output: '1. /: 값 1은(는) 1보다 커야 합니다.',
  },
  {
    name: 'json-schema 공식 벡터: Draft 2020-12 minContains/maxContains', tool: 'json-schema',
    inputs: ['[1,"둘",3]', '{"contains":{"type":"number"},"minContains":2,"maxContains":2}'],
    action: '검증', output: '✔ JSON 데이터가 스키마에 맞습니다.',
  },
  {
    name: 'json-schema: Draft 7 $ref 형제 키워드는 무시', tool: 'json-schema',
    inputs: ['1', '{"$schema":"http://json-schema.org/draft-07/schema#","$ref":"#/definitions/value","type":"string","definitions":{"value":{"type":"integer"}}}'],
    action: '검증', output: '✔ JSON 데이터가 스키마에 맞습니다.',
  },
  {
    name: 'json-schema: Draft 2020-12 $ref 형제 키워드는 함께 검증', tool: 'json-schema',
    inputs: ['1', '{"$ref":"#/$defs/value","type":"string","$defs":{"value":{"type":"integer"}}}'],
    action: '검증', output: '1. /: 예상 타입은 string이지만 실제 타입은 integer입니다.',
  },
  {
    name: 'json-schema: 로컬 $anchor 참조', tool: 'json-schema',
    inputs: ['"고정"', '{"$defs":{"value":{"$anchor":"fixed","const":"고정"}},"$ref":"#fixed"}'],
    action: '검증', output: '✔ JSON 데이터가 스키마에 맞습니다.',
  },
  {
    name: 'json-schema: Draft 2020-12 밑줄 $anchor 참조', tool: 'json-schema',
    inputs: ['"고정"', '{"$defs":{"value":{"$anchor":"_fixed","const":"고정"}},"$ref":"#_fixed"}'],
    action: '검증', output: '✔ JSON 데이터가 스키마에 맞습니다.',
  },
  {
    name: 'json-schema: Draft 2020-12 콜론 $anchor는 거부', tool: 'json-schema',
    inputs: ['null', '{"$anchor":"a:b"}'], action: '검증',
    error: 'JSON Schema 오류: 올바르지 않은 로컬 앵커입니다: a:b',
  },
  {
    name: 'json-schema: patternProperties와 additionalProperties', tool: 'json-schema',
    inputs: ['{"S_name":"ok","extra":1}', '{"type":"object","patternProperties":{"^S_":{"type":"string"}},"additionalProperties":false}'],
    action: '검증', output: '1. /: 허용되지 않은 속성 "extra"이(가) 있습니다.',
  },
  {
    name: 'json-schema: dependentSchemas', tool: 'json-schema',
    inputs: ['{"creditCard":"1234"}', '{"dependentSchemas":{"creditCard":{"required":["billingAddress"]}}}'],
    action: '검증', output: '1. /: 필수 속성 "billingAddress"이(가) 없습니다.',
  },
  {
    name: 'json-schema: format은 주석으로 처리', tool: 'json-schema',
    inputs: ['"not-an-email"', '{"type":"string","format":"email"}'],
    action: '검증', output: '✔ JSON 데이터가 스키마에 맞습니다.',
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
    name: 'json-schema: 검증에서도 외부 $ref를 거부', tool: 'json-schema',
    inputs: ['{}', '{"$ref":"other.json"}'], action: '검증',
    error: '외부 $ref는 네트워크로 가져오지 않습니다: other.json',
  },
  {
    name: 'json-schema: 중첩 $id 리소스는 잘못 해석하지 않고 거부', tool: 'json-schema',
    inputs: ['1', '{"$defs":{"nested":{"$id":"nested.json","type":"integer"}},"$ref":"#/$defs/nested"}'],
    action: '검증', error: 'JSON Schema 오류: 중첩 스키마 리소스는 지원하지 않습니다: nested.json',
  },
  {
    name: 'json-schema: 미지원 최신 키워드는 묵살하지 않고 거부', tool: 'json-schema',
    inputs: ['{}', '{"$schema":"https://json-schema.org/draft/2020-12/schema","unevaluatedProperties":false}'],
    action: '검증', error: '현재 검증기가 지원하지 않는 키워드입니다: unevaluatedProperties',
  },
  {
    name: 'json-schema: 필수 vocabulary 선언은 묵살하지 않고 거부', tool: 'json-schema',
    inputs: ['{}', '{"$vocabulary":{"https://example.test/custom":true}}'],
    action: '검증', error: '현재 검증기가 지원하지 않는 키워드입니다: $vocabulary',
  },
  {
    name: 'json-schema: Draft 4 boolean 하위 스키마는 거부', tool: 'json-schema',
    inputs: ['{}', '{"$schema":"http://json-schema.org/draft-04/schema#","properties":{"value":true}}'],
    action: '검증', error: 'JSON Schema 오류: 이 위치에는 JSON Schema 객체가 필요합니다.',
  },
  {
    name: 'json-schema: Draft 4 enum 값은 고유해야 함', tool: 'json-schema',
    inputs: ['1', '{"$schema":"http://json-schema.org/draft-04/schema#","enum":[1,1]}'],
    action: '검증',
    error: 'JSON Schema 오류: 키워드 "enum"에 올바른 형식의 값이 필요합니다: non-empty array of unique JSON values',
  },
  {
    name: 'json-schema: contentEncoding은 문자열이어야 함', tool: 'json-schema',
    inputs: ['"value"', '{"contentEncoding":7}'], action: '검증',
    error: 'JSON Schema 오류: 키워드 "contentEncoding"에 올바른 형식의 값이 필요합니다: string',
  },
  {
    name: 'json-schema: 잘못된 $id URI는 거부', tool: 'json-schema',
    inputs: ['null', '{"$id":"%%%"}'], action: '검증',
    error: 'JSON Schema 오류: 올바르지 않은 스키마 식별자입니다: %%%',
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
  {
    name: 'json-schema: 잘못된 pattern은 스키마 오류', tool: 'json-schema',
    inputs: ['"x"', '{"pattern":"["}'], action: '검증',
    error: 'JSON Schema 오류: 올바르지 않은 pattern 정규식입니다: [',
  },
  {
    name: 'json-schema: 지원하지 않는 버전은 에러', tool: 'json-schema',
    inputs: ['{}', '{"$schema":"https://json-schema.org/draft/next/schema"}'], action: '검증',
    error: '지원하지 않는 JSON Schema 버전입니다. Draft 4, 6, 7, 2019-09 또는 2020-12를 사용하세요.',
  },
  {
    name: 'json-schema: 이름에 draft가 들어간 임의 dialect는 거부', tool: 'json-schema',
    inputs: ['{}', '{"$schema":"https://example.test/custom-draft-07-dialect"}'], action: '검증',
    error: '지원하지 않는 JSON Schema 버전입니다. Draft 4, 6, 7, 2019-09 또는 2020-12를 사용하세요.',
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

test('json-schema: 256 KiB 이상 입력은 로컬 모듈 Worker에서 검증한다', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__jsonSchemaWorkers = [];
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        window.__jsonSchemaWorkers.push(new URL(url, location.href).pathname);
        super(url, options);
      }
    };
  });
  const externalRequests = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(new URL(page.url() || 'http://localhost').origin))
      externalRequests.push(request.url());
  });
  await openTool(page, 'json-schema');
  const io = ioSection(page);
  const value = JSON.stringify({ payload: '가'.repeat(140_000) });
  await fillInputs(io, [value, '{"type":"object","required":["payload"],"properties":{"payload":{"type":"string","minLength":140000}}}']);
  await clickAction(io, '검증');
  await expect(io.locator('textarea.out')).toHaveValue('✔ JSON 데이터가 스키마에 맞습니다.');
  await expect.poll(() => page.evaluate(() => window.__jsonSchemaWorkers)).toContain('/js/workers/json-schema.js');
  expect(externalRequests.filter((url) => url.includes('z-schema'))).toEqual([]);
});

test('json-schema: Worker 검증을 취소하면 상태와 Worker를 정리한다', async ({ page }) => {
  await page.route('**/js/workers/json-schema.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'self.addEventListener("message", () => {});',
  }));
  await openTool(page, 'json-schema');
  const io = ioSection(page);
  await fillInputs(io, ['{"value":1}', '{"type":"object"}']);
  await clickAction(io, '검증');
  const cancel = io.getByRole('button', { name: '취소', exact: true });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(io.locator('.io-status')).toHaveText('작업이 취소되었습니다.');
  await expect(io).toHaveAttribute('aria-busy', 'false');
});

test('json-schema: 안전 제한 시간을 넘긴 Worker를 자동 종료한다', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (handler, delay, ...args) =>
      nativeSetTimeout(handler, delay === 10_000 ? 20 : delay, ...args);
  });
  await page.route('**/js/workers/json-schema.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'self.addEventListener("message", () => {});',
  }));
  await openTool(page, 'json-schema');
  const io = ioSection(page);
  await fillInputs(io, ['{"value":1}', '{"type":"object"}']);
  await clickAction(io, '검증');
  await expect(io.locator('textarea.out')).toHaveValue(
    '⚠ JSON Schema 작업이 안전 제한 시간 10초를 넘었습니다.',
  );
  await expect(io).toHaveAttribute('aria-busy', 'false');
});

test('json-schema: 스키마 입력 크기와 검증 복잡도 상한을 적용한다', async ({ page }) => {
  await openTool(page, 'json-schema');
  const io = ioSection(page);
  const oversizedSchema = JSON.stringify({ description: '가'.repeat(350_000) });
  await fillInputs(io, ['{}', oversizedSchema]);
  await clickAction(io, '검증');
  await expect(io.locator('textarea.out')).toHaveValue('⚠ JSON Schema는 UTF-8 1 MiB까지 입력할 수 있습니다.');

  const limits = await page.evaluate(async () => {
    const engine = await import('/js/lib/data/json-schema.js');
    const evaluation = engine.validateJsonSchema(
      Array(2_000).fill(0),
      { items: { allOf: Array(501).fill(true) } },
    );
    const cyclic = {};
    cyclic.self = cyclic;
    const cycle = engine.validateJsonSchema(cyclic, true);
    const sampleErrors = [];
    for (const schema of [
      { type: 'string', minLength: 2_000_000 },
      { type: 'string', pattern: '^a{2000000}$' },
      { type: 'array', minItems: 200_000 },
    ]) {
      try { engine.generateSchemaSample(schema); }
      catch (error) { sampleErrors.push(error.code); }
    }
    const prototypeSample = engine.generateSchemaSample({
      type: 'object', required: ['__proto__'], properties: { ['__proto__']: { const: '안전' } },
    });
    return [
      evaluation.errors[0]?.code,
      cycle.errors[0]?.code,
      sampleErrors,
      Object.prototype.hasOwnProperty.call(prototypeSample, '__proto__'),
      prototypeSample.__proto__,
      Object.prototype.safe,
    ];
  });
  expect(limits).toEqual([
    'EVALUATION_LIMIT', 'INSTANCE_CYCLE', ['SAMPLE_LIMIT', 'SAMPLE_LIMIT', 'SAMPLE_LIMIT'],
    true, '안전', undefined,
  ]);
});

test('JSONPath: RFC 9535 핵심 벡터와 복잡도·프로토타입 안전 경계를 지킨다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const {
      parseJsonPathJson, queryJsonPath, stringifyJsonPathResult,
    } = await import('/js/lib/data/jsonpath.js');
    const source = JSON.parse('{"__proto__":{"safe":true},"constructor":"data","items":[0,1,2,3]}');
    const sharedValue = { x: 1 };
    const vectors = {
      root: queryJsonPath(['first', 'second'], '$'),
      unicode: queryJsonPath({ '☺': 'ok' }, '$.☺'),
      reverse: queryJsonPath(source, '$.items[::-1]'),
      duplicate: queryJsonPath(source, '$.items[0,0]'),
      specialKeys: queryJsonPath(source, '$["__proto__","constructor"]'),
      sharedReferences: queryJsonPath({ a: sharedValue, b: sharedValue }, '$..x'),
      unicodeOrder: queryJsonPath(['\u{10000}', '\uE000'], '$[?@ < "\uE000"]'),
      formatted: stringifyJsonPathResult(queryJsonPath({ a: [1, true, null] }, '$')),
    };
    const errors = {};
    for (const [name, value, path, options] of [
      ['queryLength', {}, '$.abcd', { limits: { queryLength: 3 } }],
      ['selectors', {}, '$["a","b"]', { limits: { selectors: 1 } }],
      ['visits', { a: { b: 1 } }, '$..*', { limits: { visits: 2 } }],
      ['results', [1, 2], '$[*]', { limits: { results: 1 } }],
      ['surrogate', {}, '$["\\uD800"]', {}],
      ['dotSurrogate', { '\uD800': 1 }, '$.\uD800', {}],
      ['nonRfcWhitespace', { a: 1 }, "$[\f'a']", {}],
      ['filterDepth', [{ a: 1 }], `$[?${'!'.repeat(20)}@.a]`, { limits: { depth: 10 } }],
      ['expandedResults', Array(100_001).fill(0), '$[*]', {}],
    ]) {
      try { queryJsonPath(value, path, options); }
      catch (error) { errors[name] = error.code; }
    }
    const cyclic = {};
    cyclic.self = cyclic;
    try { queryJsonPath(cyclic, '$..*'); }
    catch (error) { errors.cycle = error.code; }
    try {
      stringifyJsonPathResult(queryJsonPath(['0123456789'], '$[*]'), { bytes: 10 });
    } catch (error) { errors.outputBytes = error.code; }
    try { parseJsonPathJson('9007199254740993'); }
    catch (error) { errors.unsafeInteger = error.code; }
    try { parseJsonPathJson('"\\uD800"'); }
    catch (error) { errors.jsonSurrogate = error.code; }
    const originalFunction = globalThis.Function;
    const originalEval = globalThis.eval;
    let noDynamicCode = false;
    try {
      globalThis.Function = () => { throw new Error('Function called'); };
      globalThis.eval = () => { throw new Error('eval called'); };
      noDynamicCode = queryJsonPath([{ n: 1 }, { n: 2 }], '$[?@.n>=2].n')[0] === 2;
    } finally {
      globalThis.Function = originalFunction;
      globalThis.eval = originalEval;
    }
    return { vectors, errors, noDynamicCode, prototypeSafe: ({}).safe === undefined };
  });
  expect(result).toEqual({
    vectors: {
      root: [['first', 'second']], unicode: ['ok'], reverse: [3, 2, 1, 0], duplicate: [0, 0],
      specialKeys: [{ safe: true }, 'data'],
      sharedReferences: [1, 1],
      unicodeOrder: [],
      formatted: '[\n  {\n    "a": [\n      1,\n      true,\n      null\n    ]\n  }\n]',
    },
    errors: {
      queryLength: 'JSONPATH_QUERY_LENGTH', selectors: 'JSONPATH_SELECTORS',
      visits: 'JSONPATH_VISITS', results: 'JSONPATH_RESULTS',
      surrogate: 'JSONPATH_UNICODE', dotSurrogate: 'JSONPATH_UNICODE',
      nonRfcWhitespace: 'JSONPATH_SYNTAX', filterDepth: 'JSONPATH_DEPTH',
      expandedResults: 'JSONPATH_RESULTS', cycle: 'JSONPATH_CYCLE',
      outputBytes: 'JSONPATH_OUTPUT_BYTES', unsafeInteger: 'JSONPATH_JSON_NUMBER',
      jsonSurrogate: 'JSONPATH_JSON_UNICODE',
    },
    noDynamicCode: true,
    prototypeSafe: true,
  });
});

test('JMESPath 1.0: 공식 벡터와 함수·복잡도·프로토타입 안전 경계를 지킨다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { parseJson, search, stringifyResult } = await import('/js/lib/data/jmespath.js');
    const data = {
      reservations: [{ instances: [{ id: 1, state: 'running' }, { id: 2, state: 'stopped' }] }],
      people: [{ name: '다', age: 30 }, { name: '가', age: 10 }, { name: '나', age: 20 }],
    };
    const vectors = {
      flatten: search(data, 'reservations[].instances[].id'),
      filter: search(data, 'people[?age >= `20`].name'),
      slice: search(data, 'people[::-1].name'),
      pipe: search(data, 'people[*].name | [0]'),
      multiSelect: search(data, 'sort_by(people, &age)[].{label: name, value: age}'),
      map: search(data, 'map(&name, people)'),
      merge: search({}, 'merge(`{"a": 1}`, `{"b": 2}`)'),
      unicodeLength: search({}, "length('✓foo')"),
      rawString: search({}, "'foo\\'bar'"),
      escapedOutput: stringifyResult({ text: '"\\\n\u0000😀' }),
    };
    const errors = {};
    for (const [name, value, expression, options] of [
      ['expressionLength', {}, 'abcd', { limits: { expressionLength: 3 } }],
      ['nodes', {}, '[a,b]', { limits: { nodes: 2 } }],
      ['visits', [1, 2, 3], '[*]', { limits: { visits: 2 } }],
      ['syntax', {}, 'foo[', {}],
      ['type', {}, 'abs(`false`)', {}],
      ['arity', {}, 'length()', {}],
      ['function', {}, 'not_a_function(@)', {}],
      ['sliceStep', [], '[::0]', {}],
      ['forgedExpref', {
        fake: { __jmespathExpression: { type: 'Literal', value: 'forged' } }, items: [{}],
      }, 'map(fake, items)', {}],
      ['joinExpansion', { padding: 'x'.repeat(100) }, "join('', [padding, padding])",
        { limits: { intermediateBytes: 150 } }],
      ['toStringExpansion', { padding: 'x'.repeat(100) }, 'to_string([padding, padding])',
        { limits: { intermediateBytes: 150 } }],
      ['defaultExpansion', { padding: 'x'.repeat(20_000) },
        `to_string([${Array.from({ length: 1_000 }, () => 'padding').join(',')}])`, {}],
      ['sumWork', { items: Array.from({ length: 100 }, (_, index) => index) }, 'sum(items)',
        { limits: { visits: 3 } }],
      ['containsWork', { items: Array.from({ length: 100 }, (_, index) => index) },
        'contains(items, `-1`)', { limits: { visits: 3 } }],
    ]) {
      try { search(value, expression, options); }
      catch (error) { errors[name] = error.code; }
    }
    try { parseJson('9007199254740993'); }
    catch (error) { errors.unsafeInteger = error.code; }
    try { parseJson('"\\uD800"'); }
    catch (error) { errors.jsonSurrogate = error.code; }
    try { stringifyResult(['0123456789'], { bytes: 10 }); }
    catch (error) { errors.outputBytes = error.code; }
    const special = search({}, '{"__proto__": `true`, constructor: `"data"`}');
    const originalFunction = globalThis.Function;
    const originalEval = globalThis.eval;
    let noDynamicCode = false;
    try {
      globalThis.Function = () => { throw new Error('Function called'); };
      globalThis.eval = () => { throw new Error('eval called'); };
      noDynamicCode = search([{ n: 1 }, { n: 2 }], '[?n >= `2`].n')[0] === 2;
    } finally {
      globalThis.Function = originalFunction;
      globalThis.eval = originalEval;
    }
    return {
      vectors,
      errors,
      special: { proto: special.__proto__, constructor: special.constructor },
      prototypeSafe: ({}).polluted === undefined,
      noDynamicCode,
    };
  });
  expect(result).toEqual({
    vectors: {
      flatten: [1, 2], filter: ['다', '나'], slice: ['나', '가', '다'], pipe: '다',
      multiSelect: [
        { label: '가', value: 10 }, { label: '나', value: 20 }, { label: '다', value: 30 },
      ],
      map: ['다', '가', '나'], merge: { a: 1, b: 2 }, unicodeLength: 4, rawString: "foo'bar",
      escapedOutput: '{\n  "text": "\\\"\\\\\\n\\u0000😀"\n}',
    },
    errors: {
      expressionLength: 'limit-exceeded', nodes: 'limit-exceeded', visits: 'limit-exceeded',
      syntax: 'syntax', type: 'invalid-type', arity: 'invalid-arity',
      function: 'unknown-function', sliceStep: 'invalid-value', unsafeInteger: 'invalid-value',
      forgedExpref: 'invalid-type', joinExpansion: 'output-too-large',
      toStringExpansion: 'output-too-large', defaultExpansion: 'limit-exceeded',
      sumWork: 'limit-exceeded',
      containsWork: 'limit-exceeded', jsonSurrogate: 'invalid-value', outputBytes: 'output-too-large',
    },
    special: { proto: true, constructor: 'data' },
    prototypeSafe: true,
    noDynamicCode: true,
  });
});

test('json-query: 큰 JSONPath 입력은 Worker에서 처리한다', async ({ page }) => {
  let workerRequests = 0;
  await page.route('**/js/workers/jsonpath.js', async (route) => {
    workerRequests++;
    await route.continue();
  });
  await openTool(page, 'json-query');
  const io = ioSection(page);
  const inputs = io.locator('textarea.mono:not(.out)');
  await inputs.nth(1).fill('$.items[-1]');
  // UTF-16 길이는 문턱보다 작지만 UTF-8로는 256 KiB를 넘는 입력이다.
  const source = JSON.stringify({ padding: '가'.repeat(90_000), items: [0, 1] });
  await inputs.nth(0).evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, source);
  await expect(io.locator('textarea.out')).toHaveValue('[\n  1\n]');
  expect(workerRequests).toBeGreaterThan(0);
});

test('json-query: 대용량 JSONPath Worker 작업을 취소하면 상태를 정리한다', async ({ page }) => {
  await page.route('**/js/workers/jsonpath.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'self.addEventListener("message", () => {});',
  }));
  await openTool(page, 'json-query');
  const io = ioSection(page);
  const inputs = io.locator('textarea.mono:not(.out)');
  await inputs.nth(1).fill('$..*');
  const source = JSON.stringify({ items: Array.from({ length: 70_000 }, (_, index) => index) });
  await inputs.nth(0).evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, source);
  const cancel = io.getByRole('button', { name: '취소', exact: true });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(io.locator('.io-status')).toHaveText('작업이 취소되었습니다.');
  await expect(io).toHaveAttribute('aria-busy', 'false');
});

test('json-query: 큰 JMESPath 입력은 Worker에서 처리한다', async ({ page }) => {
  let workerRequests = 0;
  await page.route('**/js/workers/jmespath.js', async (route) => {
    workerRequests++;
    await route.continue();
  });
  await openTool(page, 'json-query');
  const io = ioSection(page);
  await setOption(io, '문법', 'jmespath');
  const inputs = io.locator('textarea.mono:not(.out)');
  await inputs.nth(1).fill('items[-1]');
  const source = JSON.stringify({ padding: '가'.repeat(90_000), items: [0, 1] });
  await inputs.nth(0).evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, source);
  await expect(io.locator('textarea.out')).toHaveValue('1');
  expect(workerRequests).toBeGreaterThan(0);
});

test('json-query: 대용량 JMESPath Worker 작업을 취소하면 상태를 정리한다', async ({ page }) => {
  await page.route('**/js/workers/jmespath.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'self.addEventListener("message", () => {});',
  }));
  await openTool(page, 'json-query');
  const io = ioSection(page);
  await setOption(io, '문법', 'jmespath');
  const inputs = io.locator('textarea.mono:not(.out)');
  await inputs.nth(1).fill('items[*]');
  const source = JSON.stringify({ items: Array.from({ length: 70_000 }, (_, index) => index) });
  await inputs.nth(0).evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, source);
  const cancel = io.getByRole('button', { name: '취소', exact: true });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(io.locator('.io-status')).toHaveText('작업이 취소되었습니다.');
  await expect(io).toHaveAttribute('aria-busy', 'false');
});

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

test('YAML 1.2: 공식 YAML Test Suite 공개 벡터를 파싱한다', async ({ page }) => {
  await page.goto('/');
  // yaml/yaml-test-suite data-2022-01-17에서 W-Tools의 안전한 데이터 태그 범위를
  // 대표하는 공개 벡터를 ID와 함께 고정했다.
  const vectors = [
    { id: '229Q', yaml: '-\n  name: Mark McGwire\n  hr:   65\n  avg:  0.278\n-\n  name: Sammy Sosa\n  hr:   63\n  avg:  0.288\n', expected: [{ name: 'Mark McGwire', hr: 65, avg: 0.278 }, { name: 'Sammy Sosa', hr: 63, avg: 0.288 }] },
    { id: 'FQ7F', yaml: '- Mark McGwire\n- Sammy Sosa\n- Ken Griffey\n', expected: ['Mark McGwire', 'Sammy Sosa', 'Ken Griffey'] },
    { id: 'SYW4', yaml: 'hr:  65    # Home runs\navg: 0.278 # Batting average\nrbi: 147   # Runs Batted In\n', expected: { hr: 65, avg: 0.278, rbi: 147 } },
    { id: '54T7', yaml: '{foo: you, bar: far}\n', expected: { foo: 'you', bar: 'far' } },
    { id: '5KJE', yaml: '- [ one, two, ]\n- [three ,four]\n', expected: [['one', 'two'], ['three', 'four']] },
    { id: '3GZX', yaml: 'First occurrence: &anchor Foo\nSecond occurrence: *anchor\nOverride anchor: &anchor Bar\nReuse anchor: *anchor\n', expected: { 'First occurrence': 'Foo', 'Second occurrence': 'Foo', 'Override anchor': 'Bar', 'Reuse anchor': 'Bar' } },
    { id: '7BUB', yaml: '---\nhr:\n  - Mark McGwire\n  # Following node labeled SS\n  - &SS Sammy Sosa\nrbi:\n  - *SS # Subsequent occurrence\n  - Ken Griffey\n', expected: { hr: ['Mark McGwire', 'Sammy Sosa'], rbi: ['Sammy Sosa', 'Ken Griffey'] } },
    { id: '4WA9', yaml: '- aaa: |2\n    xxx\n  bbb: |\n    xxx\n', expected: [{ aaa: 'xxx\n', bbb: 'xxx\n' }] },
    { id: 'G992', yaml: '>\n folded\n text\n\n\n', expected: 'folded text\n' },
    { id: 'F8F9', yaml: 'strip: |-\n  # text\n  \nclip: |\n  # text\n \nkeep: |+\n  # text\n\n', expected: { strip: '# text', clip: '# text\n', keep: '# text\n\n' } },
    { id: 'P2AD', yaml: '- | # Empty header\n literal\n- >1 # Indentation indicator\n  folded\n- |+ # Chomping indicator\n keep\n\n- >1- # Both indicators\n  strip\n', expected: ['literal\n', ' folded\n', 'keep\n\n', ' strip'] },
    { id: 'U3C3', yaml: '%TAG !yaml! tag:yaml.org,2002:\n---\n!yaml!str "foo"\n', expected: 'foo' },
    { id: '2AUY', yaml: ' - !!str a\n - b\n - !!int 42\n - d\n', expected: ['a', 'b', 42, 'd'] },
    { id: 'F2C7', yaml: ' - &a !!str a\n - !!int 2\n - !!int &c 4\n - &d d\n', expected: ['a', 2, 4, 'd'] },
    { id: 'RTP8', yaml: '%YAML 1.2\n---\nDocument\n... # Suffix\n', expected: 'Document' },
    { id: '4GC6', yaml: '\'here\'\'s to "quotes"\'\n', expected: 'here\'s to "quotes"' },
    { id: 'G4RS', yaml: 'unicode: "Sosa did fine.\\u263A"\ncontrol: "\\b1998\\t1999\\t2000\\n"\nhex esc: "\\x0d\\x0a is \\r\\n"\nsingle: \'"Howdy!" he cried.\'\nquoted: \' # Not a \'\'comment\'\'.\'\ntie-fighter: \'|\\-*-/|\'\n', expected: { unicode: 'Sosa did fine.☺', control: '\b1998\t1999\t2000\n', 'hex esc': '\r\n is \r\n', single: '"Howdy!" he cried.', quoted: ' # Not a \'comment\'.', 'tie-fighter': '|\\-*-/|' } },
    { id: 'K858', yaml: 'strip: >-\n\nclip: >\n\nkeep: |+\n\n', expected: { strip: '', clip: '', keep: '\n' } },
    { id: 'GH63', yaml: '? a\n: 1.3\nfifteen: d\n', expected: { a: 1.3, fifteen: 'd' } },
    { id: '735Y', yaml: '-\n  "flow in block"\n- >\n Block scalar\n- !!map # Block collection\n  foo : bar\n', expected: ['flow in block', 'Block scalar\n', { foo: 'bar' }] },
    { id: '9U5K', yaml: '---\n- item    : Super Hoop\n  quantity: 1\n- item    : Basketball\n  quantity: 4\n', expected: [{ item: 'Super Hoop', quantity: 1 }, { item: 'Basketball', quantity: 4 }] },
    { id: 'F3CP', yaml: '---\n{ a: [b, c, { d: [e, f] } ] }\n', expected: { a: ['b', 'c', { d: ['e', 'f'] }] } },
    { id: 'UDM2', yaml: '- { url: http://example.org }\n', expected: [{ url: 'http://example.org' }] },
  ];
  const results = await page.evaluate(async (items) => {
    const { load } = await import('/js/lib/data/yaml.js');
    return items.map(({ id, yaml }) => ({ id, value: load(yaml) }));
  }, vectors);
  expect(results).toEqual(vectors.map(({ id, expected }) => ({ id, value: expected })));
});

test('YAML 1.2: 다중 문서·안전 태그·앵커 그래프와 직렬화를 보존한다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { load, loadAll, dump } = await import('/js/lib/data/yaml.js');
    const docs = loadAll('---\nname: one\n...\n---\nname: two\n---\n');
    const tagged = load('text: !!str 12\nbinary: !!binary SGVsbG8=\ndate: !!timestamp 2026-08-29T12:34:56Z\n');
    const recursive = load('&root {self: *root}');
    const shared = { enabled: true };
    const dumped = dump({ first: shared, second: shared, multiline: '첫 줄\n둘째 줄' });
    const restored = load(dumped);
    let unsafeTag = '';
    try { load('value: !javascript alert(1)'); } catch (error) { unsafeTag = error.code; }
    let multiLoad = '';
    try { load('---\na: 1\n---\nb: 2\n'); } catch (error) { multiLoad = error.message; }
    return {
      docs,
      tagged: { text: tagged.text, binary: [...tagged.binary], date: tagged.date.toISOString() },
      recursive: recursive.self === recursive,
      aliases: restored.first === restored.second,
      restored: { first: restored.first, second: restored.second, multiline: restored.multiline },
      dumpHasAnchor: /&ref_0/.test(dumped) && /\*ref_0/.test(dumped),
      unsafeTag,
      multiLoad,
    };
  });
  expect(result).toEqual({
    docs: [{ name: 'one' }, { name: 'two' }, null],
    tagged: { text: '12', binary: [72, 101, 108, 108, 111], date: '2026-08-29T12:34:56.000Z' },
    recursive: true,
    aliases: true,
    restored: { first: { enabled: true }, second: { enabled: true }, multiline: '첫 줄\n둘째 줄' },
    dumpHasAnchor: true,
    unsafeTag: 'YAML_UNSAFE_TAG',
    multiLoad: expect.stringContaining('loadAll()'),
  });
});

test('YAML 1.2 Core: 숫자·날짜·merge 키를 손실 없이 처리하고 잘못된 문법을 거부한다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { load, dump } = await import('/js/lib/data/yaml.js');
    const core = load('decimal: 01\nunderscores: [1_, _1, 1__0]\ndate: 2026-08-29\nmixedBool: TrUe\n');
    const mergeKeyYaml = dump({ '<<': 1, date: '2026-08-29' });
    const mergeKeyRoundTrip = load(mergeKeyYaml);
    const date = new Date('2026-08-29T12:34:56Z');
    const dateRoundTrip = load(dump({ date })).date;
    const specialKeys = load('__proto__: {polluted: true}\nconstructor: safe\nemoji: 😀\n');
    let surrogateError = '';
    try { dump({ value: String.fromCharCode(0xd800) }); } catch (error) { surrogateError = error.message; }
    const errors = {};
    for (const [name, source] of Object.entries({
      integerRange: 'value: 999999999999999999999\n',
      invalidDate: 'value: !!timestamp 2023-02-29\n',
      character: 'value: a\u0001b\n',
    })) {
      try { load(source); } catch (error) { errors[name] = { code: error.code, message: error.message }; }
    }
    const malformed = [
      '[a,,b]\n', '%YAML 1.2\n', 'key: "value"#comment\n', 'key: - a\n',
      'key: [one\n# comment\n  two]\n', 'block: |\n     \n  invalid\n',
    ].map((source) => {
      try { load(source); return false; } catch { return true; }
    });
    return {
      core,
      mergeKeyYaml,
      mergeKeyRoundTrip,
      dateRoundTrip: dateRoundTrip.toISOString(),
      specialKeys: {
        prototypeUnchanged: Object.getPrototypeOf(specialKeys) === Object.prototype
          && Object.getPrototypeOf({}).polluted === undefined,
        protoIsOwnData: Object.prototype.hasOwnProperty.call(specialKeys, '__proto__')
          && specialKeys.__proto__.polluted === true,
        constructor: specialKeys.constructor,
        emoji: specialKeys.emoji,
      },
      surrogateError,
      errors,
      malformed,
    };
  });
  expect(result).toEqual({
    core: { decimal: 1, underscores: ['1_', '_1', '1__0'], date: '2026-08-29', mixedBool: 'TrUe' },
    mergeKeyYaml: "'<<': 1\ndate: 2026-08-29\n",
    mergeKeyRoundTrip: { '<<': 1, date: '2026-08-29' },
    dateRoundTrip: '2026-08-29T12:34:56.000Z',
    specialKeys: {
      prototypeUnchanged: true,
      protoIsOwnData: true,
      constructor: 'safe',
      emoji: '😀',
    },
    surrogateError: expect.stringContaining('단독 UTF-16 surrogate'),
    errors: {
      integerRange: { code: 'YAML_INTEGER_RANGE', message: expect.stringContaining('안전하게 표현할 수 없는 정수') },
      invalidDate: { code: 'YAML_SYNTAX', message: expect.stringContaining('!!timestamp') },
      character: { code: 'YAML_CHARACTER', message: expect.stringContaining('U+0001') },
    },
    malformed: [true, true, true, true, true, true],
  });
});

test('data-convert: 16 KiB 이상 YAML은 경고 없이 취소 가능한 Worker에서 처리한다', async ({ page }) => {
  let workerRequests = 0;
  await page.route('**/js/workers/yaml.js', async (route) => {
    workerRequests++;
    await route.continue();
  });
  await openTool(page, 'data-convert');
  const io = ioSection(page);
  const source = 'items:\n' + Array.from({ length: 2_000 }, (_, index) => `  - item_${index}`).join('\n');
  const output = await runIO(io, {
    options: { '입력 포맷': 'yaml', '출력 포맷': 'json' }, inputs: source,
  });
  expect(JSON.parse(output).items).toHaveLength(2_000);
  await expect(io.locator('.large-input-warning')).toBeHidden();
  expect(workerRequests).toBeGreaterThan(0);
});

test('data-convert: 64 KiB 이상 TOML 파싱·직렬화는 Worker에서 날짜 의미를 보존한다', async ({ page }) => {
  let workerRequests = 0;
  await page.route('**/js/workers/toml.js', async (route) => {
    workerRequests++;
    await route.continue();
  });
  await openTool(page, 'data-convert');
  const io = ioSection(page);
  const input = io.locator('textarea.mono:not(.out)');
  const output = io.locator('textarea.out');
  const tomlSource = '# 큰 입력 주석\n'.repeat(8_000) + 'created = 2026-08-30T12:34:56+09:00\nsafe = true\n';
  await setOption(io, '입력 포맷', 'toml');
  await setOption(io, '출력 포맷', 'json');
  await input.evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, tomlSource);
  await expect(output).toHaveValue('{\n  "created": "2026-08-30T12:34:56.000+09:00",\n  "safe": true\n}');

  const jsonSource = JSON.stringify({ items: Array.from({ length: 8_000 }, (_, index) => `item_${index}`) });
  await setOption(io, '입력 포맷', 'json');
  await setOption(io, '출력 포맷', 'toml');
  await input.evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, jsonSource);
  await expect(output).toHaveValue(/^items = \[ "item_0", "item_1".*"item_7999" \]$/s);
  await expect(io.locator('.large-input-warning')).toBeHidden();
  expect(workerRequests).toBeGreaterThanOrEqual(2);
});

test('data-convert: 대용량 TOML Worker 작업을 취소하면 상태를 정리한다', async ({ page }) => {
  await page.route('**/js/workers/toml.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'self.addEventListener("message", () => {});',
  }));
  await openTool(page, 'data-convert');
  const io = ioSection(page);
  await setOption(io, '입력 포맷', 'toml');
  await setOption(io, '출력 포맷', 'json');
  await io.locator('textarea.mono:not(.out)').evaluate((element) => {
    element.value = '# 취소 대기\n'.repeat(10_000) + 'safe = true\n';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const cancel = io.getByRole('button', { name: '취소', exact: true });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(io.locator('.io-status')).toHaveText('작업이 취소되었습니다.');
  await expect(io).toHaveAttribute('aria-busy', 'false');
});

test('data-convert: JSON → TOML → JSON 왕복 보존', async ({ page }) => {
  await openTool(page, 'data-convert');
  const io = ioSection(page);
  const toml = await runIO(io, { options: { '입력 포맷': 'json', '출력 포맷': 'toml' }, inputs: JSON_SRC });
  const back = await runIO(io, { options: { '입력 포맷': 'toml', '출력 포맷': 'json' }, inputs: toml });
  expect(JSON.parse(back)).toEqual(JSON.parse(JSON_SRC));
});

test('TOML 1.0: 표준 문자열·dotted key·테이블 배열·날짜 벡터를 파싱한다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { parse } = await import('/js/lib/data/toml.js');
    const source = `title = "TOML Example"
literal = 'C:\\Users\\nodejs\\templates'
multiline = """
The quick brown \\
  fox jumps over the lazy dog."""
owner.name = "Tom"
owner.dob = 1979-05-27T07:32:00Z
[database]
ports = [ 8000, 8001, 8002 ]
temp_targets = { cpu = 79.5, case = 72.0 }
[[products]]
name = "Hammer"
[[products]]
name = "Nail"
[products.details]
color = "gray"
`;
    const value = parse(source);
    return {
      json: JSON.parse(JSON.stringify(value)),
      dateType: value.owner.dob.tomlType,
      dateIso: value.owner.dob.toISOString(),
    };
  });
  expect(result).toEqual({
    json: {
      title: 'TOML Example',
      literal: 'C:\\Users\\nodejs\\templates',
      multiline: 'The quick brown fox jumps over the lazy dog.',
      owner: { name: 'Tom', dob: '1979-05-27T07:32:00.000Z' },
      database: { ports: [8000, 8001, 8002], temp_targets: { cpu: 79.5, case: 72 } },
      products: [
        { name: 'Hammer' },
        { name: 'Nail', details: { color: 'gray' } },
      ],
    },
    dateType: 'offset-date-time',
    dateIso: '1979-05-27T07:32:00.000Z',
  });
});

test('TOML 1.0: 직렬화 호환성과 안전한 키·숫자·복잡도 경계를 지킨다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { parse, stringify } = await import('/js/lib/data/toml.js');
    const safe = parse('__proto__.polluted = true\nconstructor = "safe"\nprototype = "data"');
    const serialized = stringify({
      name: 'WTools', version: 1, tags: ['web', 'tools'], unsafe: 9007199254740992,
      empty: {}, rows: [{ id: 1 }, { id: 2 }],
    });
    const failures = {};
    const invalid = {
      duplicate: 'a = 1\na = 2',
      date: 'day = 2026-02-30',
      float: 'value = 01.2',
      inline: 'value = { a = 1,\n b = 2 }',
      integer: 'value = 9007199254740992',
    };
    for (const [name, source] of Object.entries(invalid)) {
      try { parse(source); } catch (error) { failures[name] = error.code; }
    }
    for (const [name, source, limits] of [
      ['inputLimit', 'abcd', { inputLength: 3 }],
      ['scalarLimit', 'a = "abcd"', { scalarLength: 3 }],
      ['depthLimit', 'a = [[[1]]]', { depth: 2 }],
      ['nodeLimit', 'a = [1, 2, 3]', { nodes: 3 }],
    ]) {
      try { parse(source, { limits }); } catch (error) { failures[name] = error.code; }
    }
    return {
      prototypeSafe: ({}).polluted === undefined,
      protoIsOwnData: Object.prototype.hasOwnProperty.call(safe, '__proto__')
        && safe.__proto__.polluted === true,
      safe: { constructor: safe.constructor, prototype: safe.prototype },
      serialized,
      restored: JSON.parse(JSON.stringify(parse(serialized))),
      failures,
      empty: parse(''),
    };
  });
  expect(result).toEqual({
    prototypeSafe: true,
    protoIsOwnData: true,
    safe: { constructor: 'safe', prototype: 'data' },
    serialized: 'name = "WTools"\nversion = 1\ntags = [ "web", "tools" ]\nunsafe = 9007199254740992.0\n\n[empty]\n\n[[rows]]\nid = 1\n\n[[rows]]\nid = 2\n',
    restored: {
      name: 'WTools', version: 1, tags: ['web', 'tools'], unsafe: 9007199254740992,
      empty: {}, rows: [{ id: 1 }, { id: 2 }],
    },
    failures: {
      duplicate: 'TOML_DUPLICATE', date: 'TOML_DATE', float: 'TOML_VALUE',
      inline: 'TOML_SYNTAX', integer: 'TOML_INTEGER_PRECISION',
      inputLimit: 'TOML_INPUT_LIMIT', scalarLimit: 'TOML_SCALAR_LIMIT',
      depthLimit: 'TOML_DEPTH', nodeLimit: 'TOML_NODE_LIMIT',
    },
    empty: {},
  });
});

test('TOML 1.0: 경로·출력 제한과 공개 날짜·배열 API를 안전하게 처리한다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { parse, stringify, TomlDate } = await import('/js/lib/data/toml.js');
    const { dumpToml, TOML_WORKER_THRESHOLD } = await import('/js/tools/dataformat.js');
    const failures = {};
    const dotted = Array.from({ length: 20 }, (_, index) => `k${index}`).join('.') + ' = 1';
    const table = `[${Array.from({ length: 20 }, (_, index) => `k${index}`).join('.')}]`;
    for (const [name, callback] of [
      ['dottedDepth', () => parse(dotted, { limits: { depth: 10 } })],
      ['tableDepth', () => parse(table, { maxDepth: 10 })],
      ['outputNodes', () => stringify({ a: {}, b: {} }, { maxNodes: 2 })],
      ['sparseArray', () => stringify({ values: [1, , 2] })],
      ['dateInjection', () => new TomlDate(
        Date.UTC(2026, 7, 30), '2026-08-30T00:00:00Z\ninjected = true', 'offset-date-time',
      )],
    ]) {
      try { callback(); } catch (error) { failures[name] = error.code || error.message; }
    }
    const deepOutput = {};
    let cursor = deepOutput;
    for (let depth = 0; depth < 300; depth++) cursor = cursor.child = {};
    try { await dumpToml(deepOutput, undefined, TOML_WORKER_THRESHOLD); }
    catch (error) { failures.outputDepth = error.message; }
    const constructed = new TomlDate('2026-08-30T00:00:00Z');
    const offset = TomlDate.wrapAsOffsetDateTime(new Date('2026-08-30T00:00:00Z'), '+09:00');
    return {
      failures,
      constructed: stringify({ value: constructed }).trim(),
      constructedType: [constructed.isValid(), constructed.isDateTime(), constructed.isLocal()],
      offset: offset.toISOString(),
    };
  });
  expect(result).toEqual({
    failures: {
      dottedDepth: 'TOML_DEPTH',
      tableDepth: 'TOML_DEPTH',
      outputNodes: 'TOML 출력 노드가 2개를 넘었습니다.',
      sparseArray: 'TOML 배열에 null 또는 undefined를 넣을 수 없습니다.',
      dateInjection: 'TOML 날짜·시간 메타데이터가 유효하지 않습니다.',
      outputDepth: 'TOML 출력 중첩이 256단계를 넘었습니다.',
    },
    constructed: 'value = 2026-08-30T00:00:00.000Z',
    constructedType: [true, true, false],
    offset: '2026-08-30T09:00:00.000+09:00',
  });
});

test('YAML/TOML 파서: 악성 복잡도와 연속 주석 입력을 제한된 시간에 처리한다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { dump, load } = await import('/js/lib/data/yaml.js');
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
        return { elapsed: performance.now() - started, error: error.message, code: error.code };
      }
    };
    const merge = timed(load, mergeChain);
    const orderedMap = timed(load, omap);
    const depth = timed((input) => load(input, { limits: { depth: 20 } }),
      Array.from({ length: 25 }, (_, index) => `${'  '.repeat(index)}k${index}:`).join('\n')
        + `\n${'  '.repeat(25)}end`);
    const aliases = timed((input) => load(input, { limits: { aliases: 10 } }),
      'anchor: &a value\nitems: [' + Array.from({ length: 11 }, () => '*a').join(', ') + ']');
    const nodes = timed((input) => load(input, { limits: { nodes: 10 } }),
      Array.from({ length: 20 }, (_, index) => `- ${index}`).join('\n'));
    const inputLimit = timed((input) => load(input, { limits: { inputLength: 3 } }), 'abcd');
    const quotedScalar = timed((input) => load(input, { limits: { scalarLength: 3 } }), '"abcd"');
    const blockScalar = timed((input) => load(input, { limits: { scalarLength: 3 } }), '|\n  abcd\n');
    const shared = {};
    const dumpAliases = timed((input) => dump(input, { limits: { aliases: 2 } }), [shared, shared, shared, shared]);
    const unfinishedFlow = timed(load, 'key: [\n' + '  a\n'.repeat(32_000));
    const { parse } = await import('/js/lib/data/toml.js');
    const comments = timed(parse, '# 공격자 제어 주석\n'.repeat(50_000) + 'safe = true\n');
    return {
      merge: { elapsed: merge.elapsed, error: merge.error },
      orderedMap: { elapsed: orderedMap.elapsed, length: orderedMap.value?.length },
      limits: [depth, aliases, nodes, inputLimit, quotedScalar, blockScalar]
        .map(({ code, elapsed }) => ({ code, elapsed })),
      dumpAliases: { elapsed: dumpAliases.elapsed, error: dumpAliases.error },
      unfinishedFlow: { elapsed: unfinishedFlow.elapsed, error: unfinishedFlow.error },
      comments: { elapsed: comments.elapsed, safe: comments.value?.safe, error: comments.error },
    };
  });

  expect(result.merge.error).toContain('maxTotalMergeKeys');
  expect(result.orderedMap.length).toBe(4_000);
  expect(result.limits.map(({ code }) => code)).toEqual([
    'YAML_DEPTH', 'YAML_ALIASES', 'YAML_NODES', 'YAML_INPUT_LIMIT',
    'YAML_SCALAR_LIMIT', 'YAML_SCALAR_LIMIT',
  ]);
  expect(result.dumpAliases.error).toContain('출력 별칭');
  expect(result.unfinishedFlow.error).toContain('닫히지 않았습니다');
  expect(result.comments).toMatchObject({ safe: true, error: undefined });
  expect(result.merge.elapsed).toBeLessThan(2_000);
  expect(result.orderedMap.elapsed).toBeLessThan(2_000);
  for (const limit of result.limits) expect(limit.elapsed).toBeLessThan(1_000);
  expect(result.dumpAliases.elapsed).toBeLessThan(1_000);
  expect(result.unfinishedFlow.elapsed).toBeLessThan(1_000);
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
