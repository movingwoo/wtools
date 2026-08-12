// 코드 포맷팅 / 개발 유틸리티 — 참조표 / 계산기
import { tool, makeIO, h, formLabel, kvTable, copyBtn } from '../core.js';

const CAT = '코드 포맷팅 / 개발 유틸리티';

/* ---------- Crontab ---------- */
const CRON_FIELDS = ['분', '시', '일', '월', '요일'];
// 간격(*/n)을 설명할 때 쓰는 단위. 필드 이름과 달라서 따로 둔다 ("2시 간격" → "2시간 간격").
const CRON_STEP_UNITS = ['분', '시간', '일', '개월', '요일'];
const CRON_RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
const MONTH_KO = ['', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const DOW_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function cronValue(value, idx, part) {
  if (/^\d+$/.test(value)) return +value;
  const names = idx === 3 ? MONTH_NAMES : idx === 4 ? DOW_NAMES : [];
  const found = names.indexOf(value.toUpperCase());
  if (found >= 0) return idx === 3 ? found + 1 : found;
  const allowed = idx === 3 ? '1~12 또는 JAN~DEC' : idx === 4 ? '0~7 또는 SUN~SAT' : `${CRON_RANGES[idx][0]}~${CRON_RANGES[idx][1]}`;
  throw new Error(`${CRON_FIELDS[idx]} 필드의 "${part}"가 올바르지 않습니다. ${allowed} 범위의 값을 사용하세요.`);
}

// 필드 하나를 검사한다. 숫자는 범위를, 이름(JAN, MON 등)은 해당 필드의 목록을 확인한다.
function checkField(expr, idx) {
  const [min, max] = CRON_RANGES[idx];
  const bad = (part, why) => new Error(`${CRON_FIELDS[idx]} 필드의 "${part}"가 올바르지 않습니다. ${why}`);
  for (const part of expr.split(',')) {
    if (!part) throw bad(expr, '목록에 빈 항목이 있습니다. 쉼표 앞뒤 값을 확인하세요.');
    const m = part.match(/^(\*|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)(?:\/(\d+))?$/);
    if (!m) throw bad(part, '형식을 확인하세요.');
    if (m[2] !== undefined && +m[2] < 1) throw bad(part, '간격은 1 이상이어야 합니다.');
    if (m[1] === '*') continue;
    const values = m[1].split('-').map((v) => cronValue(v, idx, part));
    if (values.some((v) => v < min || v > max)) throw bad(part, `${min}~${max} 범위여야 합니다.`);
    if (values.length === 2 && values[0] > values[1]) throw bad(part, '범위의 시작이 끝보다 큽니다.');
  }
}

function descField(expr, idx) {
  const unit = CRON_FIELDS[idx];
  const step = CRON_STEP_UNITS[idx];
  const name = (value, part) => {
    const v = cronValue(value, idx, part);
    return idx === 3 ? MONTH_KO[v] : idx === 4 ? DOW_KO[v] : v;
  };
  if (expr === '*') return null;
  return expr.split(',').map((part) => {
    const [base, interval] = part.split('/');
    if (base === '*') return `${interval}${step} 간격마다`;
    const range = base.split('-');
    const baseDesc = range.length === 2
      ? `${name(range[0], part)}~${name(range[1], part)}`
      : `${name(base, part)}`;
    if (!interval) return baseDesc;
    return range.length === 2
      ? `${baseDesc} 사이 ${interval}${step} 간격`
      : `${baseDesc}부터 ${interval}${step} 간격`;
  }).join(', ') + ` (${unit})`;
}

function cronValues(expr, idx) {
  const [min, max] = CRON_RANGES[idx];
  const values = new Set();
  for (const part of expr.split(',')) {
    const [base, rawStep] = part.split('/');
    const step = rawStep == null ? 1 : +rawStep;
    let start, end;
    if (base === '*') [start, end] = [min, max];
    else if (base.includes('-')) [start, end] = base.split('-').map((value) => cronValue(value, idx, part));
    else {
      start = cronValue(base, idx, part);
      end = rawStep == null ? start : max;
    }
    for (let value = start; value <= end; value += step)
      values.add(idx === 4 && value === 7 ? 0 : value);
  }
  return [...values].sort((a, b) => a - b);
}

function parseCron(expression) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('cron 표현식은 5개 필드(분 시 일 월 요일)여야 합니다.');
  parts.forEach(checkField);
  return {
    parts,
    values: parts.map(cronValues),
    dayRestricted: parts[2] !== '*',
    weekdayRestricted: parts[4] !== '*',
  };
}

const cronFormatters = new Map();
function timeZoneFormatter(timeZone) {
  let formatter = cronFormatters.get(timeZone);
  if (formatter) return formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, calendar: 'gregory', numberingSystem: 'latn', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatter.format(new Date(0));
  } catch {
    throw new Error(`지원하지 않는 시간대입니다: ${timeZone || '(비어 있음)'}. IANA 시간대 이름(예: Asia/Seoul)을 입력하세요.`);
  }
  cronFormatters.set(timeZone, formatter);
  return formatter;
}

function zonedParts(timestamp, timeZone) {
  const result = {};
  for (const part of timeZoneFormatter(timeZone).formatToParts(new Date(timestamp)))
    if (part.type !== 'literal') result[part.type] = +part.value;
  return result;
}

function zoneOffsetAt(timestamp, timeZone) {
  const wholeSecond = Math.floor(timestamp / 1000) * 1000;
  const part = zonedParts(wholeSecond, timeZone);
  return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second) - wholeSecond;
}

function offsetsNearDate(year, month, day, timeZone) {
  const base = Date.UTC(year, month - 1, day, 12);
  return [...new Set([-2, -1, 0, 1, 2].map((days) => zoneOffsetAt(base + days * 86400000, timeZone)))];
}

// DST 겹침에는 두 UTC 시각을, DST 건너뜀에는 빈 배열을 반환한다.
function localTimeCandidates(year, month, day, hour, minute, timeZone, offsets) {
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  return [...new Set(offsets.map((offset) => wallTime - offset))]
    .filter((timestamp) => {
      const part = zonedParts(timestamp, timeZone);
      return part.year === year && part.month === month && part.day === day
        && part.hour === hour && part.minute === minute;
    })
    .sort((a, b) => a - b);
}

export function nextCronRuns(expression, timeZone, from = Date.now(), count = 5) {
  if (!Number.isFinite(from)) throw new Error('기준 시각이 올바르지 않습니다.');
  if (!Number.isInteger(count) || count < 1) throw new Error('실행 횟수는 1 이상이어야 합니다.');
  timeZoneFormatter(timeZone);
  const cron = parseCron(expression);
  const [minutes, hours, days, months, weekdays] = cron.values;
  const minuteSet = new Set(minutes), hourSet = new Set(hours), daySet = new Set(days);
  const monthSet = new Set(months), weekdaySet = new Set(weekdays);
  const start = zonedParts(from, timeZone);
  let cursor = Date.UTC(start.year, start.month - 1, start.day);
  const found = [];

  // 2월 29일 5회와 2100년 같은 평년 세기 경계도 포함할 수 있는 범위다.
  for (let scanned = 0; scanned < 366 * 30; scanned++, cursor += 86400000) {
    const date = new Date(cursor);
    const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1, day = date.getUTCDate();
    if (!monthSet.has(month)) continue;
    const weekday = date.getUTCDay();
    const dayMatches = cron.dayRestricted && cron.weekdayRestricted
      ? daySet.has(day) || weekdaySet.has(weekday)
      : (!cron.dayRestricted || daySet.has(day)) && (!cron.weekdayRestricted || weekdaySet.has(weekday));
    if (!dayMatches) continue;

    const offsets = offsetsNearDate(year, month, day, timeZone);
    const candidates = [];
    for (let hour = 0; hour < 24; hour++) {
      if (!hourSet.has(hour)) continue;
      for (let minute = 0; minute < 60; minute++) {
        if (!minuteSet.has(minute)) continue;
        candidates.push(...localTimeCandidates(year, month, day, hour, minute, timeZone, offsets));
      }
    }
    for (const timestamp of [...new Set(candidates)].sort((a, b) => a - b)) {
      if (timestamp <= from) continue;
      found.push(timestamp);
      if (found.length === count) return found;
    }
  }
  throw new Error('앞으로 30년 안에 실행 시각을 찾지 못했습니다. 날짜 조건을 확인하세요.');
}

function formatCronRun(timestamp, timeZone) {
  const local = new Intl.DateTimeFormat('ko-KR', {
    timeZone, calendar: 'gregory', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(timestamp));
  return `${local} · UTC ${new Date(timestamp).toISOString().replace('.000Z', 'Z')}`;
}

tool({
  id: 'crontab', cat: CAT, name: 'Crontab 표현식 생성/설명',
  desc: 'cron 표현식을 설명하고 선택한 시간대의 다음 실행 시각 5회를 계산합니다.',
  keywords: 'cron crontab schedule expression job scheduler timezone next run DST',
  render(root) {
    const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const presets = [
      ['* * * * *', '매분'], ['*/5 * * * *', '5분마다'], ['0 * * * *', '매시 정각'],
      ['0 0 * * *', '매일 자정'], ['0 9 * * 1-5', '평일 오전 9시'], ['0 0 * * 0', '매주 일요일 자정'],
      ['0 0 1 * *', '매월 1일 자정'], ['0 0 1 1 *', '매년 1월 1일'], ['30 4 * * 6', '토요일 새벽 4:30'],
    ];
    const io = makeIO(root, {
      inputs: [{ id: 'input', label: 'cron 표현식 (분 시 일 월 요일)', rows: 1, value: '*/15 9-18 * * 1-5' }],
      options: [{ id: 'timezone', label: '시간대 (IANA)', type: 'text', value: systemTimeZone, size: 180 }],
      outputHTML: true, runOnLoad: true,
      process(text, options) {
        const { parts } = parseCron(text);
        const timeZone = options.timezone.trim();
        const nextRuns = nextCronRuns(text, timeZone);
        const rows = parts.map((p, i) => [CRON_FIELDS[i], p + (descField(p, i) ? ' → ' + descField(p, i) : ' → 매 ' + CRON_FIELDS[i])]);
        const descs = parts.map((p, i) => descField(p, i)).filter(Boolean);
        const dayOr = parts[2] !== '*' && parts[4] !== '*';
        const summary = dayOr
          ? [descField(parts[0], 0), descField(parts[1], 1), `${descField(parts[2], 2)} 또는 ${descField(parts[4], 4)}`, descField(parts[3], 3)].filter(Boolean)
          : descs;
        return h('div', null,
          h('p', { style: { fontWeight: 700 } }, summary.length ? summary.join(' / ') + ' 에 실행' : '매분 실행'),
          dayOr ? h('p', { class: 'note' }, '일과 요일을 모두 제한했습니다. 일반적인 cron은 두 조건을 AND가 아닌 OR로 처리하므로 둘 중 하나만 맞아도 실행합니다.') : null,
          kvTable(rows),
          h('div', { class: 'cron-next' },
            h('h4', null, `다음 실행 시각 5회 (${timeZone})`),
            kvTable(nextRuns.map((timestamp, index) => [`${index + 1}회`, formatCronRun(timestamp, timeZone)]))));
      },
      note: '기본 5필드 cron만 지원합니다. Quartz/AWS의 초·연도 필드와 ?, L, W, # 확장은 별도 범위이며 현재 계산하지 않습니다.',
    });
    root.append(
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => { io.optEls.timezone.value = systemTimeZone; io.run(); } }, `시스템 시간대 (${systemTimeZone})`),
        h('button', { class: 'btn small', type: 'button', onclick: () => { io.optEls.timezone.value = 'UTC'; io.run(); } }, 'UTC로 전환')),
      h('h4', null, '자주 쓰는 패턴'),
      h('div', { class: 'btn-row' }, presets.map(([expr, label]) =>
        h('button', { class: 'btn small', type: 'button', onclick: () => { io.inputEls.input.value = expr; io.run(); } }, `${label} (${expr})`))));
  },
});

tool({
  id: 'chmod', cat: CAT, name: 'chmod 계산기',
  desc: '권한 체크박스, 8진수, 심볼릭(rwxr-xr--) 표기를 상호 변환합니다.',
  keywords: 'chmod permission unix 755',
  render(root) {
    const who = ['소유자(u)', '그룹(g)', '기타(o)'];
    const perms = ['읽기(r)', '쓰기(w)', '실행(x)'];
    const boxes = [];
    const grid = h('table', { class: 'grid' },
      h('tr', null, h('th', null, ''), perms.map((p) => h('th', null, p))),
      who.map((w, wi) => h('tr', null, h('th', null, w),
        perms.map((_, pi) => {
          const cb = h('input', { type: 'checkbox', 'aria-label': `${who[wi]} ${perms[pi]}` });
          boxes[wi * 3 + pi] = cb;
          cb.addEventListener('change', update);
          return h('td', { style: { textAlign: 'center' } }, cb);
        }))));
    const octInput = h('input', { type: 'text', value: '755', style: { width: '90px' }, class: 'mono' });
    const symOut = h('span', { class: 'mono', style: { fontSize: '18px', fontWeight: '700' } });
    const cmdOut = h('code', { class: 'mono' });

    function fromOctal() {
      const v = octInput.value.trim();
      if (!/^[0-7]{3,4}$/.test(v)) return;
      const digits = v.slice(-3).split('').map(Number);
      digits.forEach((d, wi) => {
        boxes[wi * 3].checked = !!(d & 4);
        boxes[wi * 3 + 1].checked = !!(d & 2);
        boxes[wi * 3 + 2].checked = !!(d & 1);
      });
      render();
    }
    function update() {
      const digits = [0, 1, 2].map((wi) =>
        (boxes[wi * 3].checked ? 4 : 0) + (boxes[wi * 3 + 1].checked ? 2 : 0) + (boxes[wi * 3 + 2].checked ? 1 : 0));
      octInput.value = digits.join('');
      render();
    }
    function render() {
      const chars = 'rwx';
      let sym = '';
      boxes.forEach((cb, i) => (sym += cb.checked ? chars[i % 3] : '-'));
      symOut.textContent = sym;
      cmdOut.textContent = `chmod ${octInput.value} 파일명`;
    }
    octInput.addEventListener('input', fromOctal);
    root.append(
      h('div', { class: 'opt-row', style: { marginBottom: '14px' } },
        h('span', { class: 'opt-item' }, formLabel(octInput, '8진수'), octInput),
        h('span', { class: 'opt-item' }, h('span', null, '심볼릭'), symOut)),
      grid,
      h('p', null, cmdOut, ' ', copyLater()));
    function copyLater() {
      return copyBtn(() => cmdOut.textContent);
    }
    fromOctal();
  },
});

tool({
  id: 'git-cheatsheet', cat: CAT, name: 'Git 치트시트',
  desc: '자주 쓰는 Git 명령어 모음입니다.',
  keywords: 'git cheat sheet command',
  render(root) {
    const sections = {
      '기본': [
        ['git init', '저장소 초기화'], ['git clone <url>', '저장소 복제'],
        ['git status', '변경 상태 확인'], ['git add <파일>', '스테이징'], ['git add -p', '변경 덩어리별 선택 스테이징'],
        ['git commit -m "메시지"', '커밋'], ['git commit --amend', '마지막 커밋 수정'],
      ],
      '브랜치': [
        ['git branch', '브랜치 목록'], ['git switch -c <이름>', '브랜치 생성 후 이동'],
        ['git switch <이름>', '브랜치 이동'], ['git merge <브랜치>', '병합'],
        ['git rebase <브랜치>', '리베이스'], ['git branch -d <이름>', '브랜치 삭제'],
        ['git cherry-pick <해시>', '특정 커밋만 가져오기'],
      ],
      '원격': [
        ['git remote -v', '원격 저장소 확인'], ['git fetch', '원격 변경 가져오기(병합 안 함)'],
        ['git pull --rebase', '가져와서 리베이스'], ['git push -u origin <브랜치>', '푸시 + 업스트림 설정'],
        ['git push --force-with-lease', '안전한 강제 푸시'],
      ],
      '되돌리기': [
        ['git restore <파일>', '작업 트리 변경 취소'], ['git restore --staged <파일>', '스테이징 취소'],
        ['git reset --soft HEAD~1', '커밋 취소(변경 유지)'], ['git reset --hard HEAD~1', '커밋+변경 모두 취소 ⚠'],
        ['git revert <해시>', '커밋을 뒤집는 새 커밋'], ['git reflog', '모든 HEAD 이동 이력(복구용)'],
      ],
      '조회': [
        ['git log --oneline --graph', '히스토리 그래프'], ['git diff', '변경 내용'], ['git diff --staged', '스테이징된 변경'],
        ['git blame <파일>', '라인별 마지막 수정자'], ['git show <해시>', '커밋 상세'],
        ['git stash / git stash pop', '변경 임시 저장/복원'], ['git bisect start', '이진 탐색으로 버그 커밋 찾기'],
      ],
    };
    for (const [title, cmds] of Object.entries(sections)) {
      root.append(h('h3', null, title),
        h('table', { class: 'kv' }, cmds.map(([c, d]) => h('tr', null, h('th', { class: 'mono', style: { fontWeight: 400 } }, c), h('td', { style: { fontFamily: 'inherit' } }, d)))));
    }
  },
});
