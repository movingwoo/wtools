// 개발 참조표 / 계산기 도구 정밀 테스트 (crontab, chmod, git 치트시트).
import { test, expect, toolCase, openTool, ioSection } from '../helpers.js';

const cases = [
  /* ---------- crontab ---------- */
  {
    name: 'crontab: 평일 업무시간 15분 간격', tool: 'crontab', inputs: '*/15 9-18 * * 1-5',
    htmlContains: ['15분 간격마다 (분) / 9~18 (시) / 월요일~금요일 (요일) 에 실행'],
    kv: {
      '분': '*/15 → 15분 간격마다 (분)', '시': '9-18 → 9~18 (시)',
      '일': '* → 매 일', '월': '* → 매 월', '요일': '1-5 → 월요일~금요일 (요일)',
    },
  },
  {
    name: 'crontab: 매분 실행', tool: 'crontab', inputs: '* * * * *',
    htmlContains: ['매분 실행'], kv: { '분': '* → 매 분' },
  },
  {
    name: 'crontab: 매년 1월 1일 자정', tool: 'crontab', inputs: '0 0 1 1 *',
    htmlContains: ['0 (분) / 0 (시) / 1 (일) / 1월 (월) 에 실행'],
    kv: { '월': '1 → 1월 (월)', '요일': '* → 매 요일' },
  },
  {
    name: 'crontab: 토요일 새벽 4:30', tool: 'crontab', inputs: '30 4 * * 6',
    htmlContains: ['30 (분) / 4 (시) / 토요일 (요일) 에 실행'],
  },
  {
    name: 'crontab: 목록과 시간 간격', tool: 'crontab', inputs: '0 */6 1,15 * *',
    htmlContains: ['0 (분) / 6시간 간격마다 (시) / 1, 15 (일) 에 실행'],
    kv: { '시': '*/6 → 6시간 간격마다 (시)', '일': '1,15 → 1, 15 (일)' },
  },
  {
    name: 'crontab: 범위 안의 간격과 요일 이름', tool: 'crontab', inputs: '0 9-17/2 * * MON-FRI',
    kv: { '시': '9-17/2 → 9~17 사이 2시간 간격 (시)', '요일': 'MON-FRI → MON-FRI (요일)' },
  },
  {
    name: 'crontab: 일요일은 0과 7 모두 가능', tool: 'crontab', inputs: '0 0 * * 7',
    kv: { '요일': '7 → 일요일 (요일)' },
  },
  { name: 'crontab: 필드 수가 다르면 에러', tool: 'crontab', inputs: '* * *', htmlError: 'cron 표현식은 5개 필드(분 시 일 월 요일)여야 합니다.' },
  { name: 'crontab: 시 범위 초과는 에러', tool: 'crontab', inputs: '0 25 * * *', htmlError: '시 필드의 "25"가 올바르지 않습니다. 0~23 범위여야 합니다.' },
  { name: 'crontab: 월 범위 초과는 에러', tool: 'crontab', inputs: '0 0 * 13 *', htmlError: '월 필드의 "13"가 올바르지 않습니다. 1~12 범위여야 합니다.' },
  { name: 'crontab: 알 수 없는 이름은 에러', tool: 'crontab', inputs: '0 0 * * ABC', htmlError: '요일 필드의 "ABC"가 올바르지 않습니다. 0~7 범위의 숫자를 사용하세요.' },
  { name: 'crontab: 뒤집힌 범위는 에러', tool: 'crontab', inputs: '10-5 * * * *', htmlError: '분 필드의 "10-5"가 올바르지 않습니다. 범위의 시작이 끝보다 큽니다.' },
  { name: 'crontab: 0 간격은 에러', tool: 'crontab', inputs: '*/0 * * * *', htmlError: '분 필드의 "*/0"가 올바르지 않습니다. 간격은 1 이상이어야 합니다.' },
];

for (const c of cases) toolCase(c);

test('crontab: 자주 쓰는 패턴 버튼', async ({ page }) => {
  await openTool(page, 'crontab');
  const io = ioSection(page);
  await page.locator('#content').getByRole('button', { name: '평일 오전 9시 (0 9 * * 1-5)' }).click();
  await expect(io.locator('textarea.mono:not(.out)')).toHaveValue('0 9 * * 1-5');
  await expect(io.locator('.out-html')).toContainText('0 (분) / 9 (시) / 월요일~금요일 (요일) 에 실행');

  await page.locator('#content').getByRole('button', { name: '5분마다 (*/5 * * * *)' }).click();
  await expect(io.locator('.out-html')).toContainText('5분 간격마다 (분) 에 실행');
});

/* ---------- chmod: makeIO를 쓰지 않는 전용 UI ---------- */

test('chmod: 8진수 → 심볼릭', async ({ page }) => {
  await openTool(page, 'chmod');
  const content = page.locator('#content');
  const octal = content.getByLabel('8진수');
  const symbolic = content.locator('.opt-row span.mono');
  const command = content.locator('code.mono');

  await expect(symbolic).toHaveText('rwxr-xr-x');
  await expect(command).toHaveText('chmod 755 파일명');

  await octal.fill('644');
  await expect(symbolic).toHaveText('rw-r--r--');
  await expect(command).toHaveText('chmod 644 파일명');
  await expect(content.getByLabel('소유자(u) 읽기(r)')).toBeChecked();
  await expect(content.getByLabel('소유자(u) 실행(x)')).not.toBeChecked();
  await expect(content.getByLabel('기타(o) 쓰기(w)')).not.toBeChecked();

  await octal.fill('777');
  await expect(symbolic).toHaveText('rwxrwxrwx');
  await octal.fill('000');
  await expect(symbolic).toHaveText('---------');

  // 4자리(setuid 등)는 뒤 세 자리를 권한으로 읽고 명령에는 그대로 쓴다
  await octal.fill('0640');
  await expect(symbolic).toHaveText('rw-r-----');
  await expect(command).toHaveText('chmod 0640 파일명');
});

test('chmod: 체크박스 → 8진수', async ({ page }) => {
  await openTool(page, 'chmod');
  const content = page.locator('#content');
  const octal = content.getByLabel('8진수');
  const symbolic = content.locator('.opt-row span.mono');

  await content.getByLabel('소유자(u) 쓰기(w)').uncheck();
  await expect(octal).toHaveValue('555');
  await expect(symbolic).toHaveText('r-xr-xr-x');

  await content.getByLabel('기타(o) 쓰기(w)').check();
  await expect(octal).toHaveValue('557');
  await expect(symbolic).toHaveText('r-xr-xrwx');

  await content.getByLabel('그룹(g) 읽기(r)').uncheck();
  await content.getByLabel('그룹(g) 실행(x)').uncheck();
  await expect(octal).toHaveValue('507');
  await expect(symbolic).toHaveText('r-x---rwx');
  await expect(content.locator('code.mono')).toHaveText('chmod 507 파일명');
});

/* ---------- git 치트시트: 정적 참조표 ---------- */

test('git-cheatsheet: 분류별 명령 표', async ({ page }) => {
  await openTool(page, 'git-cheatsheet');
  const content = page.locator('#content');
  await expect(content.locator('h3')).toHaveText(['기본', '브랜치', '원격', '되돌리기', '조회']);
  await expect(content.locator('table.kv')).toHaveCount(5);
  await expect(content.locator('table.kv tr')).toHaveCount(32);
  await expect(content.locator('table.kv').first()).toContainText('git commit --amend');
  await expect(content.locator('table.kv').nth(3)).toContainText('git reflog');
  await expect(content.getByText('git push --force-with-lease')).toBeVisible();
});
