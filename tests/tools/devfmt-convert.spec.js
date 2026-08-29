// 개발 유틸리티 변환기(cURL/fetch, SQL INSERT, docker) 정밀 테스트.
import { test, expect, toolCases, openTool, ioSection, runIO } from '../helpers.js';

const CURL = "curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' --data-raw '{\"name\":\"kim\"}'";
// fetch → cURL은 URL을 마지막 인자로 붙인다.
const CURL_OUT = "curl -X POST -H 'Content-Type: application/json' --data-raw '{\"name\":\"kim\"}' 'https://api.example.com/users'";
const FETCH = 'const response = await fetch("https://api.example.com/users", {\n'
  + '  "method": "POST",\n  "headers": {\n    "Content-Type": "application/json"\n  },\n'
  + '  "body": "{\\"name\\":\\"kim\\"}"\n});\n'
  + 'if (!response.ok) throw new Error(`HTTP ${response.status}`);\nconst data = await response.json();';

const SQL_INSERT = "INSERT INTO users (id, name, active) VALUES\n  (1, '홍길동', TRUE),\n  (2, '김서연', FALSE);";
const SQL_JSON = '[\n  {\n    "id": 1,\n    "name": "홍길동",\n    "active": true\n  },\n  {\n    "id": 2,\n    "name": "김서연",\n    "active": false\n  }\n]';

const DOCKER_RUN = 'docker run -d --name web -p 8080:80 -e TZ=Asia/Seoul --restart unless-stopped nginx:alpine';
const DOCKER_COMPOSE = 'services:\n  web:\n    image: nginx:alpine\n    container_name: web\n    ports:\n      - \'8080:80\'\n'
  + '    environment:\n      - TZ=Asia/Seoul\n    restart: unless-stopped\n';

const cases = [
  /* ---------- curl-fetch ---------- */
  { name: 'curl-fetch: cURL → fetch', tool: 'curl-fetch', inputs: CURL, action: 'cURL → fetch', output: FETCH },
  { name: 'curl-fetch: fetch → cURL (표준 JSON 옵션)', tool: 'curl-fetch', inputs: FETCH, action: 'fetch → cURL', output: CURL_OUT },
  {
    name: 'curl-fetch: 작은따옴표 옵션 안의 JSON 본문 보존', tool: 'curl-fetch',
    inputs: "fetch('https://a.test/x', { method: 'POST', body: '{\"name\":\"kim\"}' })", action: 'fetch → cURL',
    output: 'curl -X POST --data-raw \'{"name":"kim"}\' \'https://a.test/x\'',
  },
  {
    name: 'curl-fetch: fetch 호출 뒤 코드가 있어도 옵션만 읽음', tool: 'curl-fetch',
    inputs: "fetch('https://a.test/x', { headers: { 'X-Token': 'abc' } });\nconsole.log({ a: 1 });", action: 'fetch → cURL',
    output: "curl -H 'X-Token: abc' 'https://a.test/x'",
  },
  {
    name: 'curl-fetch: 문자열 안 아포스트로피는 셸 이스케이프', tool: 'curl-fetch',
    inputs: 'fetch(\'https://a.test/x\', { method: \'POST\', body: "it\'s ok" })', action: 'fetch → cURL',
    output: "curl -X POST --data-raw 'it'\\''s ok' 'https://a.test/x'",
  },
  {
    name: 'curl-fetch: 객체 본문과 백틱 URL, 후행 쉼표', tool: 'curl-fetch',
    inputs: "await fetch(`https://a.test/x`, { method: 'PUT', headers: { Accept: 'application/json' }, body: { a: 1 }, });",
    action: 'fetch → cURL',
    output: 'curl -X PUT -H \'Accept: application/json\' --data-raw \'{"a":1}\' \'https://a.test/x\'',
  },
  { name: 'curl-fetch: GET은 -X 생략', tool: 'curl-fetch', inputs: "fetch('https://a.test/x', { method: 'GET' })", action: 'fetch → cURL', output: "curl 'https://a.test/x'" },
  {
    name: 'curl-fetch: Basic 인증은 Authorization 헤더로', tool: 'curl-fetch',
    inputs: "curl -u 'user:pw' 'https://api.example.com/me'", action: 'cURL → fetch',
    output: /"Authorization": "Basic dXNlcjpwdw=="/,
  },
  { name: 'curl-fetch: curl로 시작하지 않으면 에러', tool: 'curl-fetch', inputs: 'wget https://example.com', action: 'cURL → fetch', error: 'curl 명령으로 시작해야 합니다.' },
  {
    name: 'curl-fetch: 변수 URL은 에러', tool: 'curl-fetch', inputs: "fetch(url, { method: 'GET' })", action: 'fetch → cURL',
    error: 'fetch의 첫 번째 인자는 문자열 URL이어야 합니다. 변수 대신 실제 URL을 넣어주세요.',
  },
  {
    name: 'curl-fetch: 리터럴이 아닌 옵션 값은 에러', tool: 'curl-fetch', inputs: "fetch('https://a.test/x', { headers: myHeaders })", action: 'fetch → cURL',
    error: 'fetch 옵션에는 문자열, 숫자 같은 리터럴 값만 사용할 수 있습니다.',
  },
  { name: 'curl-fetch: fetch 호출이 없으면 에러', tool: 'curl-fetch', inputs: 'const r = axios.get("x")', action: 'fetch → cURL', error: 'fetch(URL, 옵션) 호출을 찾을 수 없습니다. 문자열 URL과 객체 리터럴 옵션을 사용하세요.' },

  /* ---------- sql-insert-convert ---------- */
  { name: 'sql-insert-convert: SQL → JSON (타입 보존)', tool: 'sql-insert-convert', inputs: SQL_INSERT, action: 'SQL → JSON', output: SQL_JSON },
  {
    name: 'sql-insert-convert: 이스케이프된 따옴표와 NULL', tool: 'sql-insert-convert',
    inputs: "INSERT INTO users (id, name, note) VALUES (1, 'O''Brien', NULL);", action: 'SQL → JSON',
    output: '[\n  {\n    "id": 1,\n    "name": "O\'Brien",\n    "note": null\n  }\n]',
  },
  { name: 'sql-insert-convert: SQL → CSV', tool: 'sql-insert-convert', inputs: SQL_INSERT, action: 'SQL → CSV', output: 'id,name,active\n1,홍길동,true\n2,김서연,false' },
  {
    name: 'sql-insert-convert: JSON → SQL (PostgreSQL 따옴표)', tool: 'sql-insert-convert',
    inputs: '[{"id":1,"name":"홍길동","active":true},{"id":2,"name":"김서연","active":false}]', action: 'JSON → SQL',
    output: 'INSERT INTO "users" ("id", "name", "active") VALUES\n  (1, \'홍길동\', TRUE),\n  (2, \'김서연\', FALSE);',
  },
  {
    name: 'sql-insert-convert: MySQL은 백틱, 값의 따옴표는 두 번', tool: 'sql-insert-convert',
    options: { '대상 DB': 'mysql' }, inputs: '[{"id":1,"name":"O\'Brien"}]', action: 'JSON → SQL',
    output: "INSERT INTO `users` (`id`, `name`) VALUES\n  (1, 'O''Brien');",
  },
  {
    name: 'sql-insert-convert: CSV → SQL (값은 문자열)', tool: 'sql-insert-convert',
    inputs: 'id,name\n1,홍길동', action: 'CSV → SQL',
    output: 'INSERT INTO "users" ("id", "name") VALUES\n  (\'1\', \'홍길동\');',
  },
  {
    name: 'sql-insert-convert: 출력 테이블명 반영', tool: 'sql-insert-convert',
    options: { '출력 테이블명': 'public.members' }, inputs: '[{"id":1}]', action: 'JSON → SQL',
    output: 'INSERT INTO "public"."members" ("id") VALUES\n  (1);',
  },
  { name: 'sql-insert-convert: INSERT가 아니면 에러', tool: 'sql-insert-convert', inputs: 'UPDATE users SET a=1;', action: 'SQL → JSON', error: 'INSERT INTO 테이블 (컬럼...) VALUES (...) 형식만 지원합니다.' },
  {
    name: 'sql-insert-convert: 값 개수가 컬럼과 다르면 에러', tool: 'sql-insert-convert',
    inputs: 'INSERT INTO t (a, b) VALUES (1);', action: 'SQL → JSON', error: '1번째 행의 값 개수(1)가 컬럼 개수(2)와 다릅니다.',
  },
  {
    name: 'sql-insert-convert: 중복 컬럼은 에러', tool: 'sql-insert-convert',
    inputs: 'INSERT INTO t (a, a) VALUES (1, 2);', action: 'SQL → JSON', error: '중복된 컬럼명이 있습니다.',
  },
  {
    name: 'sql-insert-convert: 지원하지 않는 절은 에러', tool: 'sql-insert-convert',
    inputs: "INSERT INTO t (a) VALUES (1) ON CONFLICT DO NOTHING;", action: 'SQL → JSON',
    error: 'VALUES 뒤의 ON CONFLICT, RETURNING, 서브쿼리 등은 지원하지 않습니다.',
  },
  {
    name: 'sql-insert-convert: JSON이 객체 배열이 아니면 에러', tool: 'sql-insert-convert',
    inputs: '[1, 2]', action: 'JSON → SQL', error: 'JSON은 객체 또는 객체 배열이어야 합니다.',
  },

  /* ---------- docker-convert ---------- */
  { name: 'docker-convert: run → compose', tool: 'docker-convert', inputs: DOCKER_RUN, action: 'run → compose', output: DOCKER_COMPOSE },
  { name: 'docker-convert: compose → run', tool: 'docker-convert', inputs: DOCKER_COMPOSE, action: 'compose → run', output: 'docker run -d \\\n  --name web \\\n  -p 8080:80 \\\n  -e TZ=Asia/Seoul \\\n  --restart unless-stopped \\\n  nginx:alpine' },
  {
    name: 'docker-convert: 이름이 없으면 이미지명에서 서비스명 유추', tool: 'docker-convert',
    inputs: 'docker run -d redis:7-alpine', action: 'run → compose', output: 'services:\n  redis:\n    image: redis:7-alpine\n',
  },
  {
    name: 'docker-convert: 커맨드와 볼륨 유지', tool: 'docker-convert',
    inputs: 'docker run --name db -v ./data:/var/lib/postgresql/data postgres:16 postgres -c max_connections=200',
    action: 'run → compose',
    output: 'services:\n  db:\n    image: postgres:16\n    container_name: db\n    command: postgres -c max_connections=200\n    volumes:\n      - ./data:/var/lib/postgresql/data\n',
  },
  {
    name: 'docker-convert: Compose 값은 셸 명령 주입 없이 인용', tool: 'docker-convert',
    inputs: "services:\n  web:\n    image: 'alpine; echo IMAGE_INJECTION'\n    container_name: 'safe; echo NAME_INJECTION'\n    environment:\n      NOTE: \"a'b\"\n    command: [sh, -c, 'echo $HOME; touch /tmp/injected']\n",
    action: 'compose → run',
    output: "docker run -d \\\n  --name 'safe; echo NAME_INJECTION' \\\n  -e 'NOTE=a'\\''b' \\\n  'alpine; echo IMAGE_INJECTION' \\\n  sh \\\n  -c \\\n  'echo $HOME; touch /tmp/injected'",
  },
  {
    name: 'docker-convert: 구조화된 환경값은 거부', tool: 'docker-convert',
    inputs: 'services:\n  web:\n    image: alpine\n    environment:\n      BAD: {nested: value}\n',
    action: 'compose → run', error: 'environment 값은 문자열, 숫자, 불리언 또는 null이어야 합니다.',
  },
  {
    name: 'docker-convert: 비어 있는 services는 거부', tool: 'docker-convert',
    inputs: 'services: {}\n', action: 'compose → run',
    error: 'Compose services에 서비스가 하나 이상 필요합니다.',
  },
  { name: 'docker-convert: 이미지가 없으면 에러', tool: 'docker-convert', inputs: 'docker run -d --name web', action: 'run → compose', error: '이미지 이름을 찾지 못했습니다.' },
];

toolCases('devfmt-convert', cases);

/* ---------- 왕복(round-trip) 변환 ---------- */

test('curl-fetch: cURL → fetch → cURL 왕복 보존 (URL 위치만 이동)', async ({ page }) => {
  await openTool(page, 'curl-fetch');
  const io = ioSection(page);
  const fetchCode = await runIO(io, { inputs: CURL, action: 'cURL → fetch' });
  const back = await runIO(io, { inputs: fetchCode, action: 'fetch → cURL' });
  expect(back).toBe(CURL_OUT);
});

test('sql-insert-convert: SQL → JSON → SQL 왕복 보존', async ({ page }) => {
  await openTool(page, 'sql-insert-convert');
  const io = ioSection(page);
  const json = await runIO(io, { inputs: SQL_INSERT, action: 'SQL → JSON' });
  const back = await runIO(io, { inputs: json, action: 'JSON → SQL' });
  // 식별자에 따옴표가 붙는 것 외에는 원본과 같아야 한다.
  expect(back).toBe('INSERT INTO "users" ("id", "name", "active") VALUES\n  (1, \'홍길동\', TRUE),\n  (2, \'김서연\', FALSE);');
});

test('sql-insert-convert: SQL → CSV → SQL 왕복 (값은 문자열이 됨)', async ({ page }) => {
  await openTool(page, 'sql-insert-convert');
  const io = ioSection(page);
  const csv = await runIO(io, { inputs: SQL_INSERT, action: 'SQL → CSV' });
  const back = await runIO(io, { inputs: csv, action: 'CSV → SQL' });
  expect(back).toBe('INSERT INTO "users" ("id", "name", "active") VALUES\n  (\'1\', \'홍길동\', \'true\'),\n  (\'2\', \'김서연\', \'false\');');
});

test('docker-convert: run → compose → run 왕복 보존', async ({ page }) => {
  await openTool(page, 'docker-convert');
  const io = ioSection(page);
  const compose = await runIO(io, { inputs: DOCKER_RUN, action: 'run → compose' });
  const back = await runIO(io, { inputs: compose, action: 'compose → run' });
  expect(back.replace(/ \\\n +/g, ' ')).toBe(DOCKER_RUN);
});
