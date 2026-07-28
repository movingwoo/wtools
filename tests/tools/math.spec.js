// 수학 / 논리 / 랜덤 도구 정밀 테스트.
// 랜덤 도구는 정확값 대신 형식(자릿수·행 수)을 검증한다.
import { test, expect, toolCase, openTool, ioSection, setOption, fillInputs, clickAction } from '../helpers.js';

const cases = [
  // 산술 / 통계
  {
    name: 'statistics: 기본 통계량', tool: 'statistics', inputs: '2 4 4 4 5 5 7 9',
    kv: {
      '개수 (count)': '8', '합계 (sum)': '40', '평균 (mean)': '5', '중앙값 (median)': '4.5',
      '최빈값 (mode)': '4', '최소 (min)': '2', '최대 (max)': '9', '범위 (range)': '7',
      '분산 (모집단)': '4', '표준편차 (모집단)': '2', '곱 (product)': '201600',
    },
  },

  // 비트 연산
  { name: 'bitwise: AND', tool: 'bitwise', inputs: ['0b1100', '0b1010'], kv: { '결과 (10진)': '8', '결과 (16진)': '0x00000008' } },
  { name: 'bitwise: XOR', tool: 'bitwise', options: { '연산': 'xor' }, inputs: ['0b1100', '0b1010'], kv: { '결과 (10진)': '6' } },
  { name: 'bitwise: NOT (8비트)', tool: 'bitwise', options: { '연산': 'not', '비트 폭': '8' }, inputs: ['0b1100', ''], kv: { '결과 (10진)': '243', '결과 (16진)': '0xF3' } },
  { name: 'bitwise: 왼쪽 시프트', tool: 'bitwise', options: { '연산': 'shl' }, inputs: ['1', '4'], kv: { '결과 (10진)': '16' } },
  { name: 'bitwise: 오른쪽 회전 (8비트)', tool: 'bitwise', options: { '연산': 'ror', '비트 폭': '8' }, inputs: ['0b00000001', '1'], kv: { '결과 (10진)': '128' } },

  // 수식 계산기 — 줄별 수식이 kvTable의 키가 된다
  {
    name: 'math-eval: 연산자 우선순위·함수', tool: 'math-eval',
    inputs: '2+3*4\nsqrt(16)\n2^10\nfactorial(5)\n-2^2',
    kv: { '2+3*4': '14', 'sqrt(16)': '4', '2^10': '1024', 'factorial(5)': '120', '-2^2': '-4' },
  },

  // 퍼센트 계산기
  { name: 'percentage: X%의 값', tool: 'percentage', options: { '값 1': 25, '값 2': 200 }, kv: { '25% of 200': '50' } },
  { name: 'percentage: 증감률', tool: 'percentage', options: { '계산': 'change', '값 1': 100, '값 2': 150 }, kv: { '100 → 150 증감률': '+50 %' } },
  { name: 'percentage: A는 B의 몇 %', tool: 'percentage', options: { '계산': 'isWhat', '값 1': 30, '값 2': 120 }, kv: { '30는 120의': '25 %' } },

  // 랜덤 숫자 — 형식 검증
  {
    name: 'random-number: 정수 3개 형식', tool: 'random-number',
    options: { '최소': 1, '최대': 100, '개수': 3 }, action: '생성',
    output: /^\d{1,3}\n\d{1,3}\n\d{1,3}$/,
  },
  {
    name: 'random-number: 좁은 범위에서 중복 없이 초과 요청은 에러', tool: 'random-number',
    options: { '최소': 1, '최대': 3, '개수': 5, '중복 없이': true }, action: '생성',
    error: '중복 없이 5개를 뽑기엔 범위가 좁습니다 (3개).',
  },

  // UUID / ULID 분석 — 결정적 메타데이터 검증
  {
    name: 'uuid: v4 분석', tool: 'uuid-generate',
    inputs: '936DA01F-9ABD-4D9D-80C7-02AF85C822A8', action: '분석',
    kv: { '형식': '유효', '정규화': '936da01f-9abd-4d9d-80c7-02af85c822a8', '버전': 'v4', 'Variant': 'RFC 4122/9562 (10xx)' },
  },
  {
    name: 'uuid: v7 timestamp 추출 (RFC 9562 예제)', tool: 'uuid-generate',
    inputs: '017F22E2-79B0-7CC3-98C4-DC0C0C07398F', action: '분석',
    kv: { '버전': 'v7', '생성 시각 (UTC)': '2022-02-22T19:22:22.000Z' },
  },
  {
    name: 'uuid: ULID 분석', tool: 'uuid-generate',
    inputs: '01ARZ3NDEKTSV4RRFFQ69G5FAV', action: '분석',
    kv: { '형식': '유효', '시간 부분': '01ARZ3NDEK', '랜덤 부분': 'TSV4RRFFQ69G5FAV' },
  },
  {
    name: 'uuid: 잘못된 UUID는 에러', tool: 'uuid-generate',
    options: { '분석 형식': 'uuid' }, inputs: 'not-a-uuid', action: '분석',
    htmlError: '올바른 UUID 형식이 아닙니다. 32자리 16진수 또는 하이픈이 포함된 표준 형식을 입력하세요.',
  },
  {
    name: 'uuid: NIL UUID 생성', tool: 'uuid-generate',
    options: { '종류': 'nil', '개수': 1 }, action: '생성',
    htmlContains: ['00000000-0000-0000-0000-000000000000'],
  },
];

for (const c of cases) toolCase(c);

// UUID v4 생성 — 무작위이므로 형식만 검증
test('uuid: v4 생성 형식', async ({ page }) => {
  await openTool(page, 'uuid-generate');
  const io = ioSection(page);
  await setOption(io, '종류', 'v4');
  await setOption(io, '개수', 2);
  await clickAction(io, '생성');
  const outBox = io.locator('.out-html').first();
  await expect(outBox).toContainText('-');
  const lines = (await outBox.innerText()).trim().split('\n');
  expect(lines).toHaveLength(2);
  for (const line of lines) {
    expect(line).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

// 랜덤 포트 — 범위 검증
test('random-port: 동적 포트 범위', async ({ page }) => {
  await openTool(page, 'random-port');
  const io = ioSection(page);
  await setOption(io, '범위', 'dynamic');
  await setOption(io, '개수', 5);
  await clickAction(io, '생성');
  const out = io.locator('textarea.out');
  await expect(out).toHaveValue(/^\d{5}(\n\d{5}){4}$/);
  for (const port of (await out.inputValue()).split('\n').map(Number)) {
    expect(port).toBeGreaterThanOrEqual(49152);
    expect(port).toBeLessThanOrEqual(65535);
  }
});
