// 네트워크 도구 정밀 테스트.
// 대부분 순수 계산이라 정확값을 검증하고, 난수(ULA·랜덤 MAC)와 브라우저 환경 의존
// 도구(keycode·device-info)는 형식만 확인한다. DNS 조회는 DoH 응답을 가로채 고정한다.
import { test, expect, toolCases, openTool, ioSection, setOption, fillInputs, clickAction, kvValue } from '../helpers.js';

const EXTRACT_TEXT = [
  '문의: kim@example.com, lee@test.co.kr, kim@example.com',
  '사이트 https://wtools.dev/docs?a=1 와 http://sub.example.org/',
  'DNS 8.8.8.8, 내부 192.168.0.1',
  'IPv6 2001:db8::1 와 fe80:0000:0000:0000:0204:61ff:fe9d:f156',
].join('\n');

const cases = [
  /* ---------- subnet: IPv4 서브넷 계산 ---------- */
  {
    name: 'subnet: /26 대표 계산', tool: 'subnet', inputs: '192.168.1.130/26',
    kv: {
      'IP 주소': '192.168.1.130', 'CIDR 표기': '192.168.1.128/26',
      '넷마스크': '255.255.255.192', '와일드카드 마스크': '0.0.0.63',
      '네트워크 주소': '192.168.1.128', '브로드캐스트': '192.168.1.191',
      '첫 호스트': '192.168.1.129', '마지막 호스트': '192.168.1.190',
      '사용 가능 호스트 수': '62', '전체 주소 수': '64',
      '넷마스크 (2진)': '11111111.11111111.11111111.11000000', 'IP 종류': '사설(Private)',
    },
  },
  {
    name: 'subnet: /8 사설 대역', tool: 'subnet', inputs: '10.10.5.20/8',
    kv: {
      '네트워크 주소': '10.0.0.0', '브로드캐스트': '10.255.255.255', '넷마스크': '255.0.0.0',
      '사용 가능 호스트 수': '16,777,214', '전체 주소 수': '16,777,216', 'IP 종류': '사설(Private)',
    },
  },
  {
    name: 'subnet: /32는 호스트 1개', tool: 'subnet', inputs: '8.8.8.8/32',
    kv: {
      'CIDR 표기': '8.8.8.8/32', '넷마스크': '255.255.255.255',
      '첫 호스트': '8.8.8.8', '마지막 호스트': '8.8.8.8',
      '사용 가능 호스트 수': '1', '전체 주소 수': '1', 'IP 종류': '공인(Public 추정)',
    },
  },
  {
    name: 'subnet: /31은 호스트 2개 (RFC 3021)', tool: 'subnet', inputs: '192.168.1.0/31',
    kv: { '첫 호스트': '192.168.1.0', '마지막 호스트': '192.168.1.1', '사용 가능 호스트 수': '2', '전체 주소 수': '2' },
  },
  {
    name: 'subnet: /0은 전체 주소 공간', tool: 'subnet', inputs: '0.0.0.0/0',
    kv: { '넷마스크': '0.0.0.0', '브로드캐스트': '255.255.255.255', '전체 주소 수': '4,294,967,296' },
  },
  {
    name: 'subnet: 프리픽스를 생략하면 /24', tool: 'subnet', inputs: '172.16.5.5',
    kv: { 'CIDR 표기': '172.16.5.0/24', '넷마스크': '255.255.255.0', 'IP 종류': '사설(Private)' },
  },
  { name: 'subnet: 형식이 아니면 에러', tool: 'subnet', inputs: '192.168.1', htmlError: '형식: 192.168.1.0/24' },
  { name: 'subnet: 프리픽스 범위 초과는 에러', tool: 'subnet', inputs: '192.168.1.1/33', htmlError: '프리픽스는 0~32 범위여야 합니다.' },
  { name: 'subnet: 옥텟 범위 초과는 에러', tool: 'subnet', inputs: '999.1.1.1/24', htmlError: '올바른 IPv4 주소가 아닙니다: 999.1.1.1' },

  /* ---------- ipv4-convert ---------- */
  {
    name: 'ipv4-convert: 점 표기 → 각 진법', tool: 'ipv4-convert', inputs: '192.168.0.1',
    kv: {
      '점 표기': '192.168.0.1', '정수 (10진)': '3232235521', '16진수': '0xC0A80001',
      '2진수': '11000000.10101000.00000000.00000001', '옥텟': '192, 168, 0, 1',
    },
  },
  {
    name: 'ipv4-convert: 정수 → 점 표기', tool: 'ipv4-convert', inputs: '3232235521',
    kv: { '점 표기': '192.168.0.1', '16진수': '0xC0A80001' },
  },
  { name: 'ipv4-convert: 0.0.0.0', tool: 'ipv4-convert', inputs: '0.0.0.0', kv: { '정수 (10진)': '0', '16진수': '0x00000000' } },
  { name: 'ipv4-convert: 브로드캐스트 주소', tool: 'ipv4-convert', inputs: '255.255.255.255', kv: { '정수 (10진)': '4294967295', '16진수': '0xFFFFFFFF' } },
  { name: 'ipv4-convert: 잘못된 주소는 에러', tool: 'ipv4-convert', inputs: '1.2.3', htmlError: '올바른 IPv4 주소가 아닙니다: 1.2.3' },

  /* ---------- ip-range ---------- */
  {
    name: 'ip-range: 범위 → 최소 CIDR 블록', tool: 'ip-range', inputs: '192.168.1.10 - 192.168.1.40', action: '범위 → CIDR',
    output: '192.168.1.10/31\n192.168.1.12/30\n192.168.1.16/28\n192.168.1.32/29\n192.168.1.40/32\n\n// 5개 블록',
  },
  {
    name: 'ip-range: 정렬된 범위는 블록 하나', tool: 'ip-range', inputs: '10.0.0.0 - 10.0.0.255', action: '범위 → CIDR',
    output: '10.0.0.0/24\n\n// 1개 블록',
  },
  {
    name: 'ip-range: 단일 주소', tool: 'ip-range', inputs: '203.0.113.7 - 203.0.113.7', action: '범위 → CIDR',
    output: '203.0.113.7/32\n\n// 1개 블록',
  },
  {
    name: 'ip-range: CIDR → 주소 목록', tool: 'ip-range', inputs: '192.168.1.0/30', action: 'CIDR/범위 → 목록',
    output: '192.168.1.0\n192.168.1.1\n192.168.1.2\n192.168.1.3\n\n// 4개 주소',
  },
  {
    name: 'ip-range: 범위 → 주소 목록', tool: 'ip-range', inputs: '10.1.1.254 - 10.1.2.1', action: 'CIDR/범위 → 목록',
    output: '10.1.1.254\n10.1.1.255\n10.1.2.0\n10.1.2.1\n\n// 4개 주소',
  },
  { name: 'ip-range: 시작이 끝보다 크면 에러', tool: 'ip-range', inputs: '10.0.0.5 - 10.0.0.1', action: '범위 → CIDR', error: '시작 IP가 끝 IP보다 큽니다.' },
  { name: 'ip-range: 형식이 아니면 에러', tool: 'ip-range', inputs: '10.0.0.1 ~ 10.0.0.5', action: '범위 → CIDR', error: '형식: "IP1 - IP2" 또는 "IP/prefix"' },
  { name: 'ip-range: 목록이 너무 길면 에러', tool: 'ip-range', inputs: '10.0.0.0/8', action: 'CIDR/범위 → 목록', error: '주소가 16,777,216개로 너무 많습니다 (최대 65536).' },

  /* ---------- mac-format ---------- */
  {
    name: 'mac-format: 모든 표기 형식', tool: 'mac-format', inputs: '00:1A:2B:3C:4D:5E',
    kv: {
      '선택 형식': '00:1A:2B:3C:4D:5E',
      colon: '00:1A:2B:3C:4D:5E', hyphen: '00-1A-2B-3C-4D-5E', dot: '001a.2b3c.4d5e',
      none: '001A2B3C4D5E', upper: '00:1A:2B:3C:4D:5E', lower: '00:1a:2b:3c:4d:5e',
      'OUI (제조사 식별)': '00:1A:2B', 'I/G 비트': '유니캐스트', 'U/L 비트': '전역 고유(Universally administered)',
    },
  },
  {
    name: 'mac-format: 구분자 없는 입력도 인식', tool: 'mac-format', options: { '출력 형식': 'dot' }, inputs: '001a2b3c4d5e',
    kv: { '선택 형식': '001a.2b3c.4d5e' },
  },
  {
    name: 'mac-format: 멀티캐스트 주소', tool: 'mac-format', inputs: '01-00-5E-00-00-01',
    kv: { 'I/G 비트': '멀티캐스트', 'U/L 비트': '전역 고유(Universally administered)' },
  },
  {
    name: 'mac-format: 로컬 관리 주소', tool: 'mac-format', inputs: '02:00:00:00:00:01',
    kv: { 'I/G 비트': '유니캐스트', 'U/L 비트': '로컬 관리(Locally administered)' },
  },
  { name: 'mac-format: 자릿수가 맞지 않으면 에러', tool: 'mac-format', inputs: '00:1A:2B', htmlError: 'MAC 주소는 12자리 16진수여야 합니다.' },

  /* ---------- user-agent (ua-parser-js CDN) ---------- */
  {
    name: 'user-agent: 데스크톱 Chrome', tool: 'user-agent',
    inputs: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    kv: { '브라우저': 'Chrome 120.0.0.0', '엔진': 'Blink 120.0.0.0', '운영체제': 'Windows 10', '디바이스': '데스크톱(추정)', 'CPU 아키텍처': 'amd64' },
  },
  {
    name: 'user-agent: iPhone Safari', tool: 'user-agent',
    inputs: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    kv: { '브라우저': 'Mobile Safari 17.0', '운영체제': 'iOS 17.0', '디바이스': 'Apple iPhone mobile' },
  },

  /* ---------- extract ---------- */
  { name: 'extract: 이메일 (중복 제거)', tool: 'extract', inputs: EXTRACT_TEXT, output: 'kim@example.com\nlee@test.co.kr\n\n// 2개' },
  { name: 'extract: 이메일 (중복 유지)', tool: 'extract', options: { '중복 제거': false }, inputs: EXTRACT_TEXT, output: 'kim@example.com\nlee@test.co.kr\nkim@example.com\n\n// 3개' },
  { name: 'extract: URL', tool: 'extract', options: { '추출 대상': 'url' }, inputs: EXTRACT_TEXT, output: 'https://wtools.dev/docs?a=1\nhttp://sub.example.org/\n\n// 2개' },
  { name: 'extract: IPv4', tool: 'extract', options: { '추출 대상': 'ipv4' }, inputs: EXTRACT_TEXT, output: '8.8.8.8\n192.168.0.1\n\n// 2개' },
  {
    name: 'extract: IPv6 (축약 표기 포함)', tool: 'extract', options: { '추출 대상': 'ipv6' }, inputs: EXTRACT_TEXT,
    output: '2001:db8::1\nfe80:0000:0000:0000:0204:61ff:fe9d:f156\n\n// 2개',
  },
  {
    name: 'extract: IPv6는 시각·C++ 스코프를 잡지 않는다', tool: 'extract', options: { '추출 대상': 'ipv6' },
    inputs: '12:30:45에 std::vector 로그, ::1 에서 접속',
    output: '::1\n\n// 1개',
  },
  {
    name: 'extract: 도메인 (정렬)', tool: 'extract', options: { '추출 대상': 'domain', '정렬': true },
    inputs: 'zeta.example.com alpha.test.co.kr example.com',
    output: 'alpha.test.co.kr\nexample.com\nzeta.example.com\n\n// 3개',
  },
  { name: 'extract: 결과가 없으면 안내', tool: 'extract', inputs: '이메일이 없는 텍스트', output: '결과 없음' },

  /* ---------- http-status / mime-types 는 검색 UI라 별도 테스트 ---------- */
];

toolCases('network', cases);

/* ---------- ipv6-ula: 난수라 형식만 검증 ---------- */

test('ipv6-ula: RFC 4193 형식의 프리픽스를 만든다', async ({ page }) => {
  await openTool(page, 'ipv6-ula');
  const io = ioSection(page);
  await expect.poll(() => kvValue(io, 'Global ID (40bit)')).toMatch(/^[0-9a-f]{10}$/);

  const prefix48 = await kvValue(io, '/48 프리픽스');
  expect(prefix48).toMatch(/^fd[0-9a-f]{2}:[0-9a-f]{4}:[0-9a-f]{4}::\/48$/);
  expect(await kvValue(io, '서브넷 ID')).toBe('0001');
  expect(await kvValue(io, '/64 프리픽스')).toBe(prefix48.replace('::/48', ':0001::/64'));
  expect(await kvValue(io, '예시 주소')).toBe(prefix48.replace('::/48', ':0001::1'));

  // 서브넷 ID는 4자리로 채워지고, 새로 생성하면 Global ID가 바뀐다
  await setOption(io, '서브넷 ID', 'ab');
  await expect.poll(() => kvValue(io, '서브넷 ID')).toBe('00ab');
  await clickAction(io, '새로 생성');
  await expect.poll(() => kvValue(io, '/48 프리픽스')).not.toBe(prefix48);
});

/* ---------- mac-format: 랜덤 생성 ---------- */

test('mac-format: 랜덤 MAC은 로컬 관리 유니캐스트', async ({ page }) => {
  await openTool(page, 'mac-format');
  const io = ioSection(page);
  await clickAction(io, '랜덤 생성');
  await expect.poll(() => kvValue(io, '선택 형식')).toMatch(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/);
  expect(await kvValue(io, 'I/G 비트')).toBe('유니캐스트');
  expect(await kvValue(io, 'U/L 비트')).toBe('로컬 관리(Locally administered)');
});

/* ---------- dns-lookup: DoH 응답을 가로채 고정한다 ---------- */

async function stubDoh(page, handler) {
  const requests = [];
  await page.route('https://cloudflare-dns.com/dns-query*', (route) => {
    requests.push(new URL(route.request().url()));
    return handler(route);
  });
  return requests;
}

test('dns-lookup: A 레코드 응답 표시', async ({ page }) => {
  const requests = await stubDoh(page, (route) => route.fulfill({
    status: 200,
    contentType: 'application/dns-json',
    body: JSON.stringify({ Status: 0, Answer: [
      { name: 'example.com.', type: 1, TTL: 300, data: '93.184.216.34' },
      { name: 'example.com.', type: 1, TTL: 300, data: '93.184.216.35' },
    ] }),
  }));
  await openTool(page, 'dns-lookup');
  const io = ioSection(page);
  await fillInputs(io, 'example.com');
  await clickAction(io, '조회');

  const out = io.locator('.out-html');
  await expect(out).toContainText('상태: NOERROR');
  await expect(out.locator('table.grid tr')).toHaveCount(3); // 헤더 + 2행
  await expect(out).toContainText('93.184.216.34');
  await expect(out).toContainText('300');
  expect(requests).toHaveLength(1);
  expect(requests[0].searchParams.get('name')).toBe('example.com');
  expect(requests[0].searchParams.get('type')).toBe('A');
});

test('dns-lookup: 레코드 타입 선택이 요청에 반영된다', async ({ page }) => {
  const requests = await stubDoh(page, (route) => route.fulfill({
    status: 200, contentType: 'application/dns-json',
    body: JSON.stringify({ Status: 0, Answer: [{ name: 'example.com.', type: 15, TTL: 60, data: '10 mail.example.com.' }] }),
  }));
  await openTool(page, 'dns-lookup');
  const io = ioSection(page);
  await setOption(io, '레코드 타입', 'MX');
  await fillInputs(io, 'example.com');
  await clickAction(io, '조회');
  await expect(io.locator('.out-html')).toContainText('10 mail.example.com.');
  expect(requests[0].searchParams.get('type')).toBe('MX');
});

test('dns-lookup: NXDOMAIN과 빈 응답', async ({ page }) => {
  await stubDoh(page, (route) => route.fulfill({
    status: 200, contentType: 'application/dns-json', body: JSON.stringify({ Status: 3 }),
  }));
  await openTool(page, 'dns-lookup');
  const io = ioSection(page);
  await fillInputs(io, 'no-such-domain.example');
  await clickAction(io, '조회');
  await expect(io.locator('.out-html')).toContainText('상태: NXDOMAIN (도메인 없음)');
  await expect(io.locator('.out-html')).toContainText('응답 레코드가 없습니다.');
});

test.describe('dns-lookup 오류 응답', () => {
  // 502 응답 자체는 브라우저가 콘솔에 남기므로 오류 감시에서 제외한다.
  test.use({ allowConsoleErrors: ['502 (Bad Gateway)'] });

  test('dns-lookup: HTTP 오류는 에러 메시지', async ({ page }) => {
    await stubDoh(page, (route) => route.fulfill({ status: 502, body: 'bad gateway' }));
    await openTool(page, 'dns-lookup');
    const io = ioSection(page);
    await fillInputs(io, 'example.com');
    await clickAction(io, '조회');
    await expect(io.locator('.out-html .error')).toHaveText('DNS 조회 실패: HTTP 502');
  });
});

/* ---------- csp-header: makeIO를 쓰지 않는 전용 UI ---------- */

const SECURE_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
  + "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; "
  + "frame-ancestors 'none'; upgrade-insecure-requests";

test('csp-header: 권장 기본값은 경고 없는 정책', async ({ page }) => {
  await openTool(page, 'csp-header');
  const content = page.locator('#content');
  await expect(content.locator('textarea.out')).toHaveValue('Content-Security-Policy: ' + SECURE_POLICY);
  await expect(content).toContainText('✓ 알려진 고위험 설정이 발견되지 않았습니다.');

  await content.locator('select').selectOption('Content-Security-Policy-Report-Only');
  await expect(content.locator('textarea.out')).toHaveValue('Content-Security-Policy-Report-Only: ' + SECURE_POLICY);
});

test('csp-header: 호환성 프리셋은 unsafe-inline 경고', async ({ page }) => {
  await openTool(page, 'csp-header');
  const content = page.locator('#content');
  await content.getByRole('button', { name: '호환성 우선' }).click();
  await expect(content.locator('textarea.out')).toHaveValue(
    "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
    + "img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https: wss:; object-src 'none'; "
    + "base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests");
  await expect(content).toContainText('보안 경고 2개');
  await expect(content).toContainText("[높음] script-src의 'unsafe-inline'은 인라인 코드 실행을 허용합니다.");
  await expect(content).toContainText("[높음] style-src의 'unsafe-inline'은 인라인 코드 실행을 허용합니다.");
});

test('csp-header: 모두 해제하면 누락 경고', async ({ page }) => {
  await openTool(page, 'csp-header');
  const content = page.locator('#content');
  await content.getByRole('button', { name: '모두 해제' }).click();
  await expect(content.locator('textarea.out')).toHaveValue('Content-Security-Policy: ');
  await expect(content).toContainText('보안 경고 4개');
  await expect(content).toContainText('[높음] default-src가 없어');
  await expect(content).toContainText('[중간] frame-ancestors를 지정해 클릭재킹을 방지하세요.');
});

test('csp-header: 위험한 소스와 잘못된 값 처리', async ({ page }) => {
  await openTool(page, 'csp-header');
  const content = page.locator('#content');
  const policy = content.locator('textarea.out');

  await content.getByLabel('script-src 허용 소스').fill("'self' 'unsafe-eval' * http://cdn.example.com data:");
  await expect(policy).toHaveValue(/script-src 'self' 'unsafe-eval' \* http:\/\/cdn\.example\.com data:;/);
  await expect(content).toContainText("[높음] script-src의 'unsafe-eval'");
  await expect(content).toContainText('[높음] script-src의 와일드카드(*)');
  await expect(content).toContainText('[중간] script-src이 암호화되지 않은 HTTP 출처를 허용합니다.');
  await expect(content).toContainText('[높음] script-src의 data: 허용은 코드 실행 경로가 될 수 있습니다.');

  // 세미콜론은 헤더를 조작할 수 있으므로 거부한다
  await content.getByLabel('script-src 허용 소스').fill("'self'; object-src *");
  await expect(policy).toHaveValue('⚠ script-src 값에는 세미콜론이나 줄바꿈을 사용할 수 없습니다.');
  await expect(content.locator('.error')).toHaveText('잘못된 값을 수정해야 헤더를 생성할 수 있습니다.');
});

test('csp-header: 지시어 체크박스로 추가·제거', async ({ page }) => {
  await openTool(page, 'csp-header');
  const content = page.locator('#content');
  const policy = content.locator('textarea.out');

  await content.getByLabel('frame-src 사용').check();
  await expect(policy).toHaveValue(/frame-src 'none'/);
  await content.getByLabel('img-src 사용').uncheck();
  await expect(policy).not.toHaveValue(/img-src/);
  // 사용하지 않는 지시어의 입력은 비활성화된다
  await expect(content.getByLabel('img-src 허용 소스')).toBeDisabled();
});

/* ---------- 참조표 검색 ---------- */

test('http-status: 코드와 문구로 검색', async ({ page }) => {
  await openTool(page, 'http-status');
  const content = page.locator('#content');
  await expect(content.locator('table.kv tr')).toHaveCount(29);

  const search = content.getByLabel('HTTP 상태 코드 검색');
  await search.fill('404');
  await expect(content.locator('table.kv tr')).toHaveCount(1);
  await expect(content.locator('table.kv')).toContainText('Not Found');
  await expect(content.locator('h4')).toHaveText('4xx 클라이언트 오류');

  await search.fill('teapot');
  await expect(content.locator('table.kv')).toContainText('418');

  await search.fill('3xx');
  await expect(content.locator('table.kv tr')).toHaveCount(6);

  await search.fill('없는코드');
  await expect(content.locator('table.kv')).toHaveCount(0);
});

test('mime-types: 확장자와 타입으로 검색', async ({ page }) => {
  await openTool(page, 'mime-types');
  const content = page.locator('#content');
  const search = content.getByLabel('MIME 타입 검색');

  await search.fill('json');
  await expect(content.locator('table.kv tr')).toHaveCount(1);
  await expect(content.locator('table.kv tr')).toContainText('.json');
  await expect(content.locator('table.kv tr')).toContainText('application/json');

  await search.fill('video');
  await expect(content.locator('table.kv tr')).toHaveCount(2);

  await search.fill('없는타입');
  await expect(content.locator('table.kv tr')).toHaveCount(0);
});

/* ---------- 브라우저 환경 의존 도구 ---------- */

test('keycode: 키 이벤트 값을 표시', async ({ page }) => {
  await openTool(page, 'keycode');
  const content = page.locator('#content');
  const field = content.getByLabel('키 입력 영역');
  await field.press('a');
  await expect(content.locator('table.kv')).toContainText('KeyA');
  expect(await kvValue(content, 'event.key')).toBe('a');
  expect(await kvValue(content, 'event.code')).toBe('KeyA');
  expect(await kvValue(content, 'event.keyCode')).toBe('65 (deprecated)');
  expect(await kvValue(content, 'location')).toBe('일반');
  expect(await kvValue(content, '수정키')).toBe('없음');
  // 입력창에는 글자가 들어가지 않는다 (preventDefault)
  await expect(field).toHaveValue('');

  await field.press('Shift+Enter');
  expect(await kvValue(content, 'event.key')).toBe('Enter');
  expect(await kvValue(content, 'event.keyCode')).toBe('13 (deprecated)');
  expect(await kvValue(content, '수정키')).toBe('Shift');
});

test('device-info: 브라우저 정보를 채운다', async ({ page }) => {
  await openTool(page, 'device-info');
  const content = page.locator('#content');
  await expect(content.locator('table.kv tr')).toHaveCount(15);
  expect(await kvValue(content, 'User-Agent')).toContain('Chrome');
  expect(await kvValue(content, '뷰포트')).toMatch(/^\d+ × \d+$/);
  expect(await kvValue(content, '화면 해상도')).toMatch(/^\d+ × \d+$/);
  expect(await kvValue(content, '색 심도')).toMatch(/^\d+ bit$/);
  expect(await kvValue(content, '쿠키 사용')).toBe('가능');
  expect(await kvValue(content, '시간대')).toBeTruthy();
});
