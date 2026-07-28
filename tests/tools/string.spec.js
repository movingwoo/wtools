// 문자열 / 텍스트 도구 정밀 테스트.
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
