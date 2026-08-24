// stringtools.js — 문자열 / 텍스트 도구 정밀 테스트.
// 시간/난수 의존 도구(lorem 랜덤 부분, dummy-data)는 정확값 대신 형식을 검증한다.
import { readFileSync } from 'node:fs';
import { test, expect, toolCases, openTool, ioSection, setOption, clickAction } from '../helpers.js';

const emojiLock = JSON.parse(readFileSync(new URL('../../scripts/emoji-data-lock.json', import.meta.url), 'utf8'));
const emojiCount = Object.values(emojiLock.groupCounts).reduce((sum, count) => sum + count, 0);

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

test('emoji-picker: 로컬 전체 데이터에서 한국어·영어로 검색하고 복사한다', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const externalRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/emojibase-data@')) externalRequests.push(request.url());
  });
  await openTool(page, 'emoji-picker');

  const body = page.locator('#content .tool-body');
  const info = body.locator('.note[role="status"]');
  await expect(info).toContainText(`${emojiCount.toLocaleString('ko-KR')}개`);

  await body.getByPlaceholder('검색 (예: 하트, fire, 웃음)').fill('로켓');
  const rocket = body.locator('button[title="로켓"]');
  await expect(rocket).toBeVisible();
  await rocket.click();
  await expect(info).toContainText('🚀 복사됨!');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('🚀');

  await body.getByPlaceholder('검색 (예: 하트, fire, 웃음)').fill('distorted');
  await expect(body.locator('button[title="왜곡된 얼굴"]')).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('emoji-picker: 로컬 전체 데이터가 손상되면 기본 목록으로 대체한다', async ({ page }) => {
  await page.route('**/assets/data/emoji.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'invalid json' }));
  await openTool(page, 'emoji-picker');

  const body = page.locator('#content .tool-body');
  const info = body.locator('.note[role="status"]');
  await expect(info).toContainText('로컬 전체 목록을 불러오지 못해');
  await body.getByPlaceholder('검색 (예: 하트, fire, 웃음)').fill('로켓');
  await expect(body.locator('button[title="로켓 발사 rocket launch"]')).toBeVisible();
});

test('emoji-picker: lock에 고정한 Unicode 그룹과 검색 벡터를 보존한다', async ({ page }) => {
  await page.goto('/');
  const summary = await page.evaluate(async () => {
    const response = await fetch('/assets/data/emoji.json');
    const data = await response.json();
    const counts = {};
    for (const row of data.emoji) counts[row[1]] = (counts[row[1]] || 0) + 1;
    const byEmoji = Object.fromEntries(data.emoji.map((row) => [row[0], row]));
    return {
      version: data.version,
      source: data.source,
      unicode: data.unicode,
      cldr: data.cldr,
      count: data.emoji.length,
      unique: new Set(data.emoji.map((row) => row[0])).size,
      counts,
      rocket: byEmoji['🚀'],
      koreanFlag: byEmoji['🇰🇷'],
      distortedFace: byEmoji['🫪'],
    };
  });

  expect(summary).toMatchObject({
    version: 1,
    source: 'Unicode Emoji/CLDR',
    unicode: emojiLock.emojiVersion,
    cldr: emojiLock.cldrVersion,
    count: emojiCount,
    unique: emojiCount,
    counts: emojiLock.groupCounts,
  });
  expect(summary.rocket).toEqual(['🚀', 5, '로켓', expect.stringContaining('rocket')]);
  expect(summary.koreanFlag).toEqual(['🇰🇷', 9, '깃발: 대한민국', expect.stringContaining('south korea')]);
  expect(summary.distortedFace).toEqual(['🫪', 0, '왜곡된 얼굴', expect.stringContaining('distorted face')]);
});

test('ascii-art: 자체 FIGfont 엔진으로 실제 배너를 생성한다', async ({ page }) => {
  await openTool(page, 'ascii-art');

  const io = page.locator('#content .io');
  await io.locator('textarea.mono:not(.out)').fill('HI');
  await expect(io.locator('textarea.out')).toHaveValue(
    '  _   _ ___ \n | | | |_ _|\n | |_| || | \n |  _  || | \n |_| |_|___|\n            ',
  );
});

test('ascii-art: 10개 로컬 글꼴이 고정 FIGlet 출력 벡터와 일치한다', async ({ page }) => {
  const expected = {
    Standard: ' __        ______  \n \\ \\      / /___ \\ \n  \\ \\ /\\ / /  __) |\n   \\ V  V /  / __/ \n    \\_/\\_/  |_____|\n                   ',
    Big: ' __          _____  \n \\ \\        / /__ \\ \n  \\ \\  /\\  / /   ) |\n   \\ \\/  \\/ /   / / \n    \\  /\\  /   / /_ \n     \\/  \\/   |____|\n                    \n                    ',
    Small: ' __      _____ \n \\ \\    / /_  )\n  \\ \\/\\/ / / / \n   \\_/\\_/ /___|\n               ',
    Slant: ' _       _____ \n| |     / /__ \\\n| | /| / /__/ /\n| |/ |/ // __/ \n|__/|__//____/ \n               ',
    Banner: ' #     #  #####  \n #  #  # #     # \n #  #  #       # \n #  #  #  #####  \n #  #  # #       \n #  #  # #       \n  ## ##  ####### \n                 ',
    Block: '                           \n _|          _|    _|_|    \n _|          _|  _|    _|  \n _|    _|    _|      _|    \n   _|  _|  _|      _|      \n     _|  _|      _|_|_|_|  \n                           \n                           ',
    Doom: ' _    _  _____ \n| |  | |/ __  \\\n| |  | |`\' / /\'\n| |/\\| |  / /  \n\\  /\\  /./ /___\n \\/  \\/ \\_____/\n               \n               ',
    Ghost: '  (`\\ .-\') /`         \n   `.( OO ),\'         \n,--./  .--.  .-----.  \n|      |  | / ,-.   \\ \n|  |   |  |,\'-\'  |  | \n|  |.\'.|  |_)  .\'  /  \n|         |  .\'  /__  \n|   ,\'.   | |       | \n\'--\'   \'--\' `-------\' ',
    Shadow: ' \\ \\        / ___ \\  \n  \\ \\  \\   /     ) | \n   \\ \\  \\ /     __/  \n    \\_/\\_/    _____| \n                     ',
    Speed: '___       _______ \n__ |     / /_|__ \\\n__ | /| / /____/ /\n__ |/ |/ / _  __/ \n____/|__/  /____/ \n                  ',
  };
  await openTool(page, 'ascii-art');
  const io = ioSection(page);
  const input = io.locator('textarea.mono:not(.out)');
  const output = io.locator('textarea.out');
  for (const [font, vector] of Object.entries(expected)) {
    await setOption(io, '폰트', font);
    await input.fill('W2');
    await expect(output, `${font} 출력`).toHaveValue(vector);
  }
});

test('ascii-art: 파서 오류·여러 줄·큰 입력 경계를 처리한다', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { parseFigFont, renderFiglet } = await import('/js/lib/text/figlet.js');
    const source = await (await fetch('/assets/data/figlet/Standard.flf')).text();
    const font = parseFigFont(source);
    const errors = [];
    for (const invalid of ['not-a-font', source.split('\n').slice(0, 10).join('\n')]) {
      try {
        parseFigFont(invalid);
      } catch (error) {
        errors.push(error.message);
      }
    }
    try {
      renderFiglet('한글', font);
    } catch (error) {
      errors.push(error.message);
    }
    return {
      glyphs: font.glyphs.size,
      multiline: renderFiglet('A\nB', font),
      largeLength: renderFiglet('A'.repeat(1024), font).length,
      errors,
    };
  });

  expect(result.glyphs).toBe(95);
  expect(result.multiline).toBe(
    '     _    \n    / \\   \n   / _ \\  \n  / ___ \\ \n /_/__ \\_\\\n | __ )   \n |  _ \\   \n | |_) |  \n |____/   \n          ',
  );
  expect(result.largeLength).toBeGreaterThan(6_000);
  expect(result.errors).toEqual([
    'Invalid FIGfont header.',
    'FIGfont is missing ASCII glyph data.',
    'Unsupported FIGfont character: U+D55C',
  ]);
});

test('ascii-art: 빈 입력과 비 ASCII 입력을 한국어로 처리한다', async ({ page }) => {
  await openTool(page, 'ascii-art');
  const io = ioSection(page);
  const input = io.locator('textarea.mono:not(.out)');
  const output = io.locator('textarea.out');
  await input.fill('   ');
  await expect(output).toHaveValue('');
  await input.fill('안녕');
  await expect(output).toHaveValue(/영문, 숫자 및 ASCII 기호만 입력/);
});

test('ascii-art: 손상된 내장 글꼴을 받은 뒤 다시 시도할 수 있다', async ({ page }) => {
  const pattern = '**/assets/data/figlet/Standard.flf';
  await page.route(pattern, (route) => route.fulfill({ status: 200, body: 'invalid font' }));
  await openTool(page, 'ascii-art');
  const io = ioSection(page);
  const input = io.locator('textarea.mono:not(.out)');
  const output = io.locator('textarea.out');
  await input.fill('HI');
  await expect(output).toHaveValue(/내장 폰트 데이터가 올바르지 않습니다/);

  await page.unroute(pattern);
  await input.fill('OK');
  await expect(output).toHaveValue(/_/);
});

test('ascii-art: 외부 figlet 스크립트와 글꼴을 요청하지 않는다', async ({ page }) => {
  let requests = 0;
  await page.route('https://cdn.jsdelivr.net/npm/figlet@1.7.0/**', async (route) => {
    requests++;
    await route.abort();
  });
  await openTool(page, 'ascii-art');
  const io = ioSection(page);
  await io.locator('textarea.mono:not(.out)').fill('OFFLINE');
  await expect(io.locator('textarea.out')).toHaveValue(/_/);
  expect(requests).toBe(0);
});
