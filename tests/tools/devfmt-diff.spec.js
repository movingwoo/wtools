// Diff / 정규식 테스터 정밀 테스트.
import { test, expect, toolCases, openTool, ioSection, setOption, fillInputs, grabDownload } from '../helpers.js';

// grid 표를 [[셀, ...], ...]로 읽는다 (헤더 행 포함).
function gridRows(scope) {
  return scope.locator('.out-html table.grid tr').evaluateAll((rows) =>
    rows.map((tr) => [...tr.querySelectorAll('th,td')].map((cell) => cell.textContent.trim())));
}

async function expectRows(scope, rows) {
  await expect.poll(() => gridRows(scope), { message: 'grid 표 내용' }).toEqual(rows);
}

const cases = [
  /* ---------- json-diff ---------- */
  { name: 'json-diff: 같은 JSON', tool: 'json-diff', inputs: ['{"a":1,"b":[1,2]}', '{"b":[1,2],"a":1}'], htmlContains: ['✔ 두 JSON은 구조적으로 동일합니다.'] },
  { name: 'json-diff: 잘못된 JSON은 에러', tool: 'json-diff', inputs: ['{oops}', '{}'], htmlError: /JSON/ },

  /* ---------- regex-tester ---------- */
  {
    name: 'regex-tester: 전역 검색 개수', tool: 'regex-tester',
    options: { '패턴': '[\\w.]+@[\\w.]+', '플래그': 'g' },
    inputs: '연락처: kim@example.com, lee@test.co.kr',
    htmlContains: ['매치 2개'],
  },
  {
    name: 'regex-tester: 플래그가 없으면 첫 매치만', tool: 'regex-tester',
    options: { '패턴': '\\d+', '플래그': '' }, inputs: '1 22 333',
    htmlContains: ['매치 1개'],
  },
  {
    name: 'regex-tester: i 플래그', tool: 'regex-tester',
    options: { '패턴': 'abc', '플래그': 'gi' }, inputs: 'ABC abc Abc',
    htmlContains: ['매치 3개'],
  },
  {
    name: 'regex-tester: 빈 매치에도 멈추지 않는다', tool: 'regex-tester',
    options: { '패턴': 'a*', '플래그': 'g' }, inputs: 'bab',
    htmlContains: ['매치 4개'],
  },
  {
    name: 'regex-tester: 치환 결과', tool: 'regex-tester',
    options: { '패턴': '(\\w+)@(\\w+)', '플래그': 'g', '치환(선택)': '$2:$1' },
    inputs: 'kim@example, lee@test',
    htmlContains: ['치환 결과', 'example:kim, test:lee'],
  },
  {
    name: 'regex-tester: 잘못된 정규식은 에러', tool: 'regex-tester',
    options: { '패턴': '(' }, inputs: 'abc', htmlError: /Invalid regular expression/,
  },
];

toolCases('devfmt-diff', cases);

/* ---------- json-diff: 표 내용 ---------- */

test('json-diff: 추가·삭제·변경 경로', async ({ page }) => {
  await openTool(page, 'json-diff');
  const io = ioSection(page);
  await fillInputs(io, ['{"name":"a","ver":1,"tags":["x"]}', '{"name":"b","tags":["x","y"],"new":true}']);
  await expectRows(io, [
    ['구분', '경로', 'A 값', 'B 값'],
    ['변경', 'name', '"a"', '"b"'],
    ['삭제', 'ver', '1', ''],
    ['추가', 'tags.1', '', '"y"'],
    ['추가', 'new', '', 'true'],
  ]);
});

test('json-diff: 중첩 경로와 타입 변경', async ({ page }) => {
  await openTool(page, 'json-diff');
  const io = ioSection(page);
  await fillInputs(io, ['{"db":{"host":"a","port":5432},"debug":false}', '{"db":{"host":"a","port":"5432"},"debug":false}']);
  await expectRows(io, [
    ['구분', '경로', 'A 값', 'B 값'],
    ['변경', 'db.port', '5432', '"5432"'],
  ]);
});

test('json-diff: 최상위 스칼라와 배열 순서', async ({ page }) => {
  await openTool(page, 'json-diff');
  const io = ioSection(page);
  await fillInputs(io, ['1', '2']);
  await expectRows(io, [['구분', '경로', 'A 값', 'B 값'], ['변경', '(루트)', '1', '2']]);

  await fillInputs(io, ['[1,2]', '[2,1]']);
  await expectRows(io, [
    ['구분', '경로', 'A 값', 'B 값'],
    ['변경', '0', '1', '2'],
    ['변경', '1', '2', '1'],
  ]);
});

/* ---------- text-diff (jsdiff CDN) ---------- */

test('text-diff: 라인 단위', async ({ page }) => {
  await openTool(page, 'text-diff');
  const io = ioSection(page);
  await fillInputs(io, ['사과\n바나나\n체리\n', '사과\n블루베리\n체리\n두리안\n']);
  await expect(io.locator('.diff-line-del')).toHaveText(['바나나']);
  await expect(io.locator('.diff-line-add')).toHaveText(['블루베리', '두리안']);
  await expect(io.locator('.out-html')).toContainText('사과');
});

test('text-diff: 끝 줄바꿈이 없으면 마지막 줄도 다른 줄로 본다 (git과 같은 기준)', async ({ page }) => {
  await openTool(page, 'text-diff');
  const io = ioSection(page);
  await fillInputs(io, ['사과\n체리', '사과\n체리\n두리안']);
  await expect(io.locator('.diff-line-del')).toHaveText(['체리']);
  await expect(io.locator('.diff-line-add')).toHaveText(['체리 두리안']);
});

test('text-diff: 단어·문자 단위', async ({ page }) => {
  await openTool(page, 'text-diff');
  const io = ioSection(page);
  await fillInputs(io, ['hello world', 'hello there']);
  await setOption(io, '단위', 'words');
  await expect(io.locator('.diff-del')).toHaveText(['world']);
  await expect(io.locator('.diff-add')).toHaveText(['there']);

  await setOption(io, '단위', 'chars');
  await fillInputs(io, ['abc', 'abd']);
  await expect(io.locator('.diff-del')).toHaveText(['c']);
  await expect(io.locator('.diff-add')).toHaveText(['d']);
});

test('text-diff: 같은 텍스트에는 표시가 없다', async ({ page }) => {
  await openTool(page, 'text-diff');
  const io = ioSection(page);
  await fillInputs(io, ['같은 내용\n두 번째 줄', '같은 내용\n두 번째 줄']);
  await expect(io.locator('.out-html')).toContainText('두 번째 줄');
  await expect(io.locator('.diff-line-add, .diff-line-del, .diff-add, .diff-del')).toHaveCount(0);
});

test('text-diff: 통합 diff를 생성하고 다운로드', async ({ page }) => {
  await openTool(page, 'text-diff');
  const io = ioSection(page);
  await fillInputs(io, ['alpha\nold\nomega\n', 'alpha\nnew\nomega\n']);
  await io.getByText('통합 diff 보기').click();
  const patch = io.locator('.unified-diff');
  await expect(patch).toContainText('--- 텍스트 A.txt');
  await expect(patch).toContainText('+++ 텍스트 B.txt');
  await expect(patch).toContainText('@@ -1,3 +1,3 @@');
  await expect(patch).toContainText('-old');
  await expect(patch).toContainText('+new');

  const saved = await grabDownload(page, () => io.getByRole('button', { name: '통합 diff 다운로드' }).click());
  expect(saved.name).toBe('text-diff.patch');
  expect(saved.bytes.toString()).toContain('--- 텍스트 A.txt');
  expect(saved.bytes.toString()).toContain('-old\n+new');
});

test('text-diff: 공백 차이 무시 옵션', async ({ page }) => {
  await openTool(page, 'text-diff');
  const io = ioSection(page);
  await setOption(io, '공백 차이 무시', true);
  await fillInputs(io, ['  alpha  \n\tbeta\n', 'alpha\nbeta  \n']);
  await expect(io).toContainText('공백 차이를 제외하면 두 텍스트는 같습니다.');
  await expect(io.locator('.diff-line-add, .diff-line-del')).toHaveCount(0);
  await expect(io.locator('.unified-diff')).not.toContainText('@@');

  await fillInputs(io, [' alpha ', ' beta ']);
  await expect(io.locator('.diff-line-del')).toHaveText(['alpha']);
  await expect(io.locator('.diff-line-add')).toHaveText(['beta']);
});

/* ---------- regex-tester: 매치 표와 치트시트 ---------- */

test('regex-tester: 매치 위치와 캡처 그룹', async ({ page }) => {
  await openTool(page, 'regex-tester');
  const io = ioSection(page);
  await setOption(io, '패턴', '(\\d{4})-(\\d{2})-(\\d{2})');
  await setOption(io, '플래그', 'g');
  await fillInputs(io, '시작 2024-01-31 끝 2025-12-25');
  await expectRows(io, [
    ['#', '위치', '매치', '그룹'],
    ['1', '3', '2024-01-31', '$1=2024, $2=01, $3=31'],
    ['2', '16', '2025-12-25', '$1=2025, $2=12, $3=25'],
  ]);
  // 매치는 하이라이트된다
  await expect(io.locator('mark.rx')).toHaveText(['2024-01-31', '2025-12-25']);
});

test('regex-tester: 그룹이 없으면 - 로 표시', async ({ page }) => {
  await openTool(page, 'regex-tester');
  const io = ioSection(page);
  await setOption(io, '패턴', '\\d+');
  await setOption(io, '플래그', 'g');
  await fillInputs(io, 'a1 b22');
  await expectRows(io, [
    ['#', '위치', '매치', '그룹'],
    ['1', '1', '1', '-'],
    ['2', '4', '22', '-'],
  ]);
});

test('regex-tester: 치트시트 검색과 삽입', async ({ page }) => {
  await openTool(page, 'regex-tester');
  const content = page.locator('#content');
  const io = ioSection(page);
  const rows = content.locator('details table.grid tbody tr');

  await content.locator('details summary').click();
  const total = await rows.count();
  await expect(content.locator('details summary')).toHaveText(`정규식 치트시트 (${total}개)`);

  const search = content.getByLabel('정규식 치트시트 검색');
  await search.fill('후방 탐색');
  await expect(rows).toHaveCount(2);
  await expect(content.locator('details table.grid tbody')).toContainText('(?<=…)');

  await search.fill('없는문법');
  await expect(content.getByText('검색 결과가 없습니다.')).toBeVisible();

  // 문법 버튼은 패턴에, 플래그 버튼은 플래그 입력에 넣는다
  await search.fill('숫자 한 글자');
  await setOption(io, '패턴', '');
  await rows.first().getByRole('button', { name: '\\d' }).click();
  await expect(io.locator('.opt-row').getByLabel('패턴', { exact: true })).toHaveValue('\\d+');

  await setOption(io, '플래그', 'g');
  await search.fill('영문 대소문자 무시');
  await rows.first().getByRole('button', { name: 'i' }).click();
  await expect(io.locator('.opt-row').getByLabel('플래그', { exact: true })).toHaveValue('gi');
  await expect(io.locator('.out-html')).toContainText('매치');
});
