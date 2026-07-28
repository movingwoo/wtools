// 도구 정밀 기능 테스트 공통 헬퍼.
// makeIO가 만드는 공통 UI(입력 textarea, 옵션, 액션 버튼, 출력)를 조작하고,
// 테이블로 선언한 케이스(toolCase)를 실행한다.
import { test as base, expect } from '@playwright/test';

// 모든 테스트에서 콘솔 에러와 처리되지 않은 예외를 자동 수집하고 0건임을 확인한다.
export const test = base.extend({
  _errorGuard: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    await use();
    expect(errors, '페이지 콘솔 에러').toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function openTool(page, id) {
  await page.goto('/#/tool/' + id);
  await page.locator('.tool-header h1').waitFor({ state: 'visible' });
}

// 한 도구 화면의 makeIO 블록. index는 도구가 makeIO를 여러 번 쓸 때(JWT 등) 순번.
export function ioSection(page, index = 0) {
  return page.locator('#content .io').nth(index);
}

// 옵션 컨트롤을 라벨 텍스트로 찾아 값을 설정한다. select는 option의 value 기준.
export async function setOption(io, label, value) {
  const control = io.getByLabel(label, { exact: true });
  const kind = await control.evaluate((el) => (el.tagName === 'SELECT' ? 'select' : el.type));
  if (kind === 'select') await control.selectOption(String(value));
  else if (kind === 'checkbox') await control.setChecked(!!value);
  else await control.fill(String(value));
}

// 입력 textarea를 DOM 순서(= makeIO inputs 선언 순서)대로 채운다.
export async function fillInputs(io, inputs) {
  const values = Array.isArray(inputs) ? inputs : [inputs];
  const areas = io.locator('textarea.mono:not(.out)');
  for (let i = 0; i < values.length; i++) {
    if (values[i] != null) await areas.nth(i).fill(values[i]);
  }
}

export function clickAction(io, label) {
  return io.getByRole('button', { name: label, exact: true }).click();
}

// kvTable 출력에서 키에 해당하는 값을 읽는다 (복사 버튼 텍스트 제외). 없으면 null.
export function kvValue(io, key) {
  return io.locator('.out-html').first().evaluate((root, k) => {
    for (const tr of root.querySelectorAll('table.kv tr')) {
      if (tr.querySelector('th')?.textContent.trim() === k) {
        const td = tr.querySelector('td').cloneNode(true);
        td.querySelector('button')?.remove();
        return td.textContent.trim();
      }
    }
    return null;
  }, key);
}

/* 테이블 주도 케이스 실행기. 케이스 하나가 테스트 하나가 된다.
c = {
  name: 테스트 이름, tool: 도구 id, io: makeIO 블록 순번 (기본 0),
  options: { 옵션 라벨: 값 },          // select는 option value, checkbox는 불리언
  inputs: 문자열 | [문자열, ...],      // 입력 textarea 순서대로
  action: 액션 버튼 라벨,              // 생략 시 자동 실행 결과를 검증
  output: 문자열|정규식,               // textarea 출력 전체 값
  error: 문자열,                       // textarea 에러 (⚠ 접두어는 자동)
  kv: { 키: 문자열|정규식 },           // kvTable 행 값
  htmlContains: [문자열, ...],         // outputHTML 텍스트 포함 여부
  htmlError: 문자열|정규식,            // outputHTML 에러 메시지
}
*/
export function toolCase(c) {
  test(c.name, async ({ page }) => {
    await openTool(page, c.tool);
    const io = ioSection(page, c.io ?? 0);
    for (const [label, value] of Object.entries(c.options ?? {})) await setOption(io, label, value);
    if (c.inputs != null) await fillInputs(io, c.inputs);
    if (c.action) await clickAction(io, c.action);
    if (c.output !== undefined) await expect(io.locator('textarea.out')).toHaveValue(c.output);
    if (c.error) await expect(io.locator('textarea.out')).toHaveValue('⚠ ' + c.error);
    for (const text of c.htmlContains ?? []) await expect(io.locator('.out-html').first()).toContainText(text);
    if (c.htmlError) await expect(io.locator('.out-html .error').first()).toHaveText(c.htmlError);
    for (const [key, expected] of Object.entries(c.kv ?? {})) {
      const poll = expect.poll(() => kvValue(io, key), { message: `kvTable["${key}"]` });
      if (expected instanceof RegExp) await poll.toMatch(expected);
      else await poll.toBe(String(expected));
    }
  });
}
