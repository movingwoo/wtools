// stringtools.js — 문자열 / 텍스트 도구 정밀 테스트.
// 시간/난수 의존 도구(lorem 랜덤 부분, dummy-data)는 정확값 대신 형식을 검증한다.
import { test, expect, toolCases, openTool, ioSection, setOption, clickAction } from '../helpers.js';

const cases = [
  // 대소문자 변환
  {
    name: 'case-convert: 공백 구분 입력', tool: 'case-convert', inputs: 'user profile data',
    kv: {
      'camelCase': 'userProfileData', 'PascalCase': 'UserProfileData',
      'snake_case': 'user_profile_data', 'SCREAMING_SNAKE': 'USER_PROFILE_DATA',
      'kebab-case': 'user-profile-data', 'Title Case': 'User Profile Data',
    },
  },
  {
    name: 'case-convert: camelCase 입력 분해', tool: 'case-convert', inputs: 'getUserName',
    kv: { 'snake_case': 'get_user_name', 'kebab-case': 'get-user-name' },
  },

  // 난독화 (결정적 모드만)
  { name: 'obfuscator: 역순', tool: 'obfuscator', options: { '방식': 'rev' }, inputs: 'abc', output: 'cba' },
  { name: 'obfuscator: 리트(1337)', tool: 'obfuscator', options: { '방식': 'leet' }, inputs: 'test', output: '7357' },
  { name: 'obfuscator: 전각 문자', tool: 'obfuscator', options: { '방식': 'full' }, inputs: 'A1 b', output: 'Ａ１　ｂ' },
  { name: 'obfuscator: 제로폭 문자 제거', tool: 'obfuscator', options: { '방식': 'zwremove' }, inputs: 'a\u200bb\u200cc', output: 'abc' },

  // Slugify
  { name: 'slugify: 악센트 제거', tool: 'slugify', inputs: 'Café au lait!', output: 'cafe-au-lait' },
  { name: 'slugify: 한글 유지', tool: 'slugify', inputs: 'Hello World — 안녕하세요', output: 'hello-world-안녕하세요' },
  { name: 'slugify: 언더스코어 구분자', tool: 'slugify', options: { '구분자': '_' }, inputs: 'Hello World', output: 'hello_world' },
  { name: 'slugify: 한글 제거 옵션', tool: 'slugify', options: { '한글 유지': false }, inputs: 'Hello 안녕 World', output: 'hello-world' },

  // 텍스트 통계
  {
    name: 'text-stats: 기본 통계', tool: 'text-stats', inputs: 'Hello world\nhello',
    kv: {
      '글자 수 (공백 포함)': '17', '바이트 (UTF-8)': '17', '단어 수': '3',
      '줄 수': '2', '고유 단어 수': '2',
    },
  },

  // 한글 도구
  { name: 'hangul-tools: 영타 → 한글', tool: 'hangul-tools', options: { '변환': 'en2ko' }, inputs: 'dkssud', output: '안녕' },
  { name: 'hangul-tools: 한글 → 영타', tool: 'hangul-tools', options: { '변환': 'ko2en' }, inputs: '안녕하세요', output: 'dkssudgktpdy' },
  { name: 'hangul-tools: 초성 추출', tool: 'hangul-tools', options: { '변환': 'cho' }, inputs: '안녕하세요', output: 'ㅇㄴㅎㅅㅇ' },
  { name: 'hangul-tools: 로마자 표기', tool: 'hangul-tools', options: { '변환': 'rom' }, inputs: '안녕', output: 'annyeong' },
  { name: 'hangul-tools: 자모 분해', tool: 'hangul-tools', options: { '변환': 'jamo' }, inputs: '한', output: 'ㅎㅏㄴ' },

  // Lorem Ipsum — 첫 문장은 항상 고정 문구
  {
    name: 'lorem-ipsum: 영문 첫 문장은 고정', tool: 'lorem-ipsum',
    options: { '언어': 'en', '단위': 'sent', '개수': 1 }, action: '생성',
    output: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  },

  // 유니코드 문자 분석기
  {
    name: 'unicode-inspect: 한글과 라틴 문자', tool: 'unicode-inspect', inputs: '한A',
    kv: { '코드포인트 수': '2', 'UTF-16 길이 (JS length)': '2', 'UTF-8 바이트': '4' },
    htmlContains: ['U+D55C', 'ed 95 9c', '한글', 'U+0041', '라틴'],
  },
  {
    name: 'unicode-inspect: 서로게이트 쌍 이모지', tool: 'unicode-inspect', inputs: '👍',
    kv: { '코드포인트 수': '1', 'UTF-16 길이 (JS length)': '2', 'UTF-8 바이트': '4' },
    htmlContains: ['U+1F44D', '그림문자(이모지)', 'D83D DC4D'],
  },

  // 숨은 문자 탐지 / 정리 — 기본 입력이 키릴 a + 제로폭 공백 + 소프트 하이픈이다
  {
    name: 'invisible-chars: 기본 입력에서 3건 탐지', tool: 'invisible-chars',
    htmlContains: ['3개의 의심 문자', '제로폭 공백 (ZWSP)', '소프트 하이픈 (SHY)', '라틴 문자 "a"와 혼동되는 문자'],
  },
  { name: 'invisible-chars: 깨끗한 텍스트', tool: 'invisible-chars', inputs: 'hello 안녕 123', htmlContains: ['의심스러운 문자가 없습니다'] },
  {
    name: 'invisible-chars: 양방향 서식 문자 탐지', tool: 'invisible-chars', inputs: 'file\u202egnp.exe',
    htmlContains: ['우좌 강제 (RLO)', '양방향 서식 문자'],
  },
  {
    name: 'invisible-chars: 정리하면 원래 문자열', tool: 'invisible-chars', io: 1,
    inputs: '\u0430dmin\u200b@exam\u00adple.com',
    output: 'admin@example.com\n\n// 2자 제거, 정리 완료',
  },
  {
    name: 'invisible-chars: 특수 공백은 일반 공백으로', tool: 'invisible-chars', io: 1,
    inputs: 'a\u00a0b\u3000c',
    output: 'a b c\n\n// 0자 제거, 정리 완료',
  },

];

toolCases('string', cases);

// 더미 데이터 생성기 — 무작위 값이므로 구조와 형식만 검증
test('dummy-data: JSON 형식과 행 수·필드 형식', async ({ page }) => {
  await openTool(page, 'dummy-data');
  const io = ioSection(page);
  await setOption(io, '개수', 3);
  await setOption(io, '형식', 'json');
  await clickAction(io, '생성');
  const out = io.locator('textarea.out');
  await expect(out).toHaveValue(/^\[/);
  const rows = JSON.parse(await out.inputValue());
  expect(rows).toHaveLength(3);
  expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  for (const row of rows) {
    expect(row.phone).toMatch(/^010-\d{4}-\d{4}$/);
    expect(row.email).toMatch(/^[a-z0-9]+@[a-z.]+$/i);
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row.age).toBeGreaterThanOrEqual(20);
  }
});

test('dummy-data: CSV 헤더와 행 수', async ({ page }) => {
  await openTool(page, 'dummy-data');
  const io = ioSection(page);
  await setOption(io, '개수', 2);
  await setOption(io, '형식', 'csv');
  await clickAction(io, '생성');
  const out = io.locator('textarea.out');
  await expect(out).toHaveValue(/^id,name,email,phone,age,city,created_at\n/);
  const lines = (await out.inputValue()).trim().split('\n');
  expect(lines).toHaveLength(3); // 헤더 + 2행
});

test('emoji-picker: 전체 데이터에서 검색하고 복사한다', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openTool(page, 'emoji-picker');

  const body = page.locator('#content .tool-body');
  const info = body.locator('.note[role="status"]');
  await expect(info).toContainText(/[\d,]+개/);

  await body.getByPlaceholder('검색 (예: 하트, fire, 웃음)').fill('로켓');
  const rocket = body.locator('button[title="로켓"]');
  await expect(rocket).toBeVisible();
  await rocket.click();
  await expect(info).toContainText('🚀 복사됨!');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('🚀');
});

test('emoji-picker: 전체 데이터가 손상되면 기본 목록으로 대체한다', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/emojibase-data@16.0.3/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'invalid json' }));
  await openTool(page, 'emoji-picker');

  const body = page.locator('#content .tool-body');
  const info = body.locator('.note[role="status"]');
  await expect(info).toContainText('전체 목록 로드 실패');
  await body.getByPlaceholder('검색 (예: 하트, fire, 웃음)').fill('로켓');
  await expect(body.locator('button[title="로켓 발사 rocket launch"]')).toBeVisible();
});

test('ascii-art: figlet로 실제 배너를 생성한다', async ({ page }) => {
  await openTool(page, 'ascii-art');

  const io = page.locator('#content .io');
  await io.locator('textarea.mono:not(.out)').fill('HI');
  await expect(io.locator('textarea.out')).toHaveValue(
    '  _   _ ___ \n | | | |_ _|\n | |_| || | \n |  _  || | \n |_| |_|___|\n            ',
  );
});
