// 날짜 / 시간
import { tool, makeIO, h, formLabel, kvTable, copyBtn } from '../core.js';

const CAT = '날짜 / 시간';

function pad(n, l = 2) { return String(n).padStart(l, '0'); }

tool({
  id: 'unix-time', cat: CAT, name: 'Unix 타임스탬프 변환',
  desc: 'Unix 타임스탬프와 사람이 읽는 날짜를 상호 변환합니다.',
  keywords: 'unix timestamp epoch time convert posix milliseconds seconds',
  render(root) {
    const io = makeIO(root, {
      inputs: [{ id: 'input', label: '타임스탬프(초/밀리초) 또는 날짜 문자열', rows: 1, value: String(Math.floor(Date.now() / 1000)) }],
      outputHTML: true, runOnLoad: true,
      process(text) {
        text = text.trim();
        if (!text) return '';
        let date;
        if (/^\d{1,14}$/.test(text)) {
          const n = Number(text);
          date = new Date(text.length >= 13 ? n : n * 1000);
        } else {
          date = new Date(text);
        }
        if (isNaN(date)) throw new Error('인식할 수 없는 날짜/타임스탬프입니다.');
        const rows = [
          ['Unix (초)', Math.floor(date.getTime() / 1000)],
          ['Unix (밀리초)', date.getTime()],
          ['ISO 8601 (UTC)', date.toISOString()],
          ['로컬 시간', date.toLocaleString('ko-KR', { dateStyle: 'full', timeStyle: 'long' })],
          ['UTC 문자열', date.toUTCString()],
          ['상대 시간', relTime(date)],
          ['요일', ['일', '월', '화', '수', '목', '금', '토'][date.getDay()] + '요일'],
          ['연중 일수', dayOfYear(date) + '일째'],
        ];
        return kvTable(rows);
      },
    });
    const btn = h('button', { class: 'btn small', type: 'button', onclick: () => { io.inputEls.input.value = String(Math.floor(Date.now() / 1000)); io.run(); } }, '지금(현재 시각)');
    root.querySelector('.io').insertBefore(h('div', { class: 'btn-row', style: { marginTop: '4px' } }, btn), root.querySelector('.opt-row') || root.querySelector('.out-wrap'));
  },
});

function relTime(date) {
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units = [['년', 31536e6], ['개월', 2592e6], ['일', 864e5], ['시간', 36e5], ['분', 6e4], ['초', 1e3]];
  for (const [name, ms] of units) {
    if (abs >= ms) {
      const v = Math.round(abs / ms);
      return diff > 0 ? `${v}${name} 후` : `${v}${name} 전`;
    }
  }
  return '방금';
}
function dayOfYear(date) {
  return Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
}

tool({
  id: 'datetime-format', cat: CAT, name: '날짜-시간 형식 변환기',
  desc: '날짜를 ISO, RFC, 커스텀 등 다양한 포맷으로 변환합니다.',
  keywords: 'date time format iso rfc strftime',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '날짜 입력 (비우면 현재)', rows: 1, placeholder: '2024-01-15 14:30 또는 비워두기' }],
      options: [{ id: 'custom', label: '커스텀 패턴', type: 'text', size: 200, value: 'YYYY-MM-DD HH:mm:ss' }],
      outputHTML: true, runOnLoad: true,
      process(text, o) {
        const date = text.trim() ? new Date(text.trim()) : new Date();
        if (isNaN(date)) throw new Error('인식할 수 없는 날짜입니다.');
        const map = {
          YYYY: date.getFullYear(), YY: pad(date.getFullYear() % 100), MM: pad(date.getMonth() + 1),
          M: date.getMonth() + 1, DD: pad(date.getDate()), D: date.getDate(),
          HH: pad(date.getHours()), H: date.getHours(), hh: pad((date.getHours() % 12) || 12),
          mm: pad(date.getMinutes()), m: date.getMinutes(), ss: pad(date.getSeconds()), s: date.getSeconds(),
          SSS: pad(date.getMilliseconds(), 3), A: date.getHours() < 12 ? 'AM' : 'PM',
          a: date.getHours() < 12 ? '오전' : '오후', dddd: ['일', '월', '화', '수', '목', '금', '토'][date.getDay()] + '요일',
        };
        const custom = o.custom.replace(/YYYY|YY|MM|M|DD|D|HH|H|hh|mm|m|ss|s|SSS|A|a|dddd/g, (t) => map[t]);
        return kvTable([
          ['커스텀', custom],
          ['ISO 8601', date.toISOString()],
          ['RFC 2822', date.toUTCString()],
          ['로컬 (한국)', date.toLocaleString('ko-KR')],
          ['날짜만', date.toLocaleDateString('ko-KR')],
          ['시간만', date.toLocaleTimeString('ko-KR')],
          ['Unix (초)', Math.floor(date.getTime() / 1000)],
          ['YYYYMMDD', `${map.YYYY}${map.MM}${map.DD}`],
        ]);
      },
    });
  },
});

tool({
  id: 'filetime', cat: CAT, name: 'Windows Filetime 변환',
  desc: 'Windows FILETIME(1601년 기준 100ns 단위)을 변환합니다.',
  keywords: 'filetime windows ldap ntfs timestamp',
  render(root) {
    const EPOCH_DIFF = 11644473600000n; // 1601~1970 밀리초
    makeIO(root, {
      inputs: [{ id: 'input', label: 'FILETIME (10진/16진) 또는 날짜', rows: 1, value: '133516656000000000' }],
      outputHTML: true, runOnLoad: true,
      process(text) {
        text = text.trim();
        if (!text) return '';
        let date, ft;
        if (/^(0x)?[0-9a-f]+$/i.test(text) && (text.startsWith('0x') || /[a-f]/i.test(text) || text.length > 11)) {
          ft = BigInt(text.startsWith('0x') ? text : (text.match(/[a-f]/i) ? '0x' + text : text));
          const ms = ft / 10000n - EPOCH_DIFF;
          date = new Date(Number(ms));
        } else {
          date = new Date(text);
          if (isNaN(date)) throw new Error('인식할 수 없는 입력입니다.');
          ft = (BigInt(date.getTime()) + EPOCH_DIFF) * 10000n;
        }
        return kvTable([
          ['FILETIME (10진)', ft.toString()],
          ['FILETIME (16진)', '0x' + ft.toString(16).toUpperCase()],
          ['ISO 8601', isNaN(date) ? '범위 초과' : date.toISOString()],
          ['로컬 시간', isNaN(date) ? '범위 초과' : date.toLocaleString('ko-KR')],
          ['Unix (초)', isNaN(date) ? '-' : Math.floor(date.getTime() / 1000)],
        ]);
      },
    });
  },
});

tool({
  id: 'utc-local', cat: CAT, name: 'UTC ↔ 로컬 / 시간대 변환',
  desc: '한 시각을 여러 시간대(UTC, 서울, 뉴욕 등)로 표시합니다.',
  keywords: 'utc local timezone convert offset',
  render(root) {
    const ZONES = [['UTC', 'UTC'], ['Asia/Seoul', '서울'], ['Asia/Tokyo', '도쿄'], ['Asia/Shanghai', '상하이'], ['Asia/Kolkata', '뉴델리'], ['Europe/London', '런던'], ['Europe/Paris', '파리'], ['America/New_York', '뉴욕'], ['America/Los_Angeles', 'LA'], ['America/Chicago', '시카고'], ['Australia/Sydney', '시드니']];
    makeIO(root, {
      inputs: [{ id: 'input', label: '기준 시각 (비우면 현재)', rows: 1, placeholder: '2024-01-15 14:30 또는 비우기' }],
      options: [{ id: 'assume', label: '입력 해석', type: 'select', values: [['local', '로컬 시간으로'], ['utc', 'UTC로']] }],
      outputHTML: true, runOnLoad: true,
      process(text, o) {
        let date;
        if (!text.trim()) date = new Date();
        else if (o.assume === 'utc' && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text.trim())) date = new Date(text.trim() + 'Z');
        else date = new Date(text.trim());
        if (isNaN(date)) throw new Error('인식할 수 없는 날짜입니다.');
        return kvTable(ZONES.map(([tz, label]) => [label + ` (${tz})`,
          date.toLocaleString('ko-KR', { timeZone: tz, dateStyle: 'medium', timeStyle: 'medium' })]));
      },
    });
  },
});

tool({
  id: 'stopwatch', cat: CAT, name: '스톱워치 / 타이머',
  desc: '스톱워치와 카운트다운 타이머를 제공합니다.',
  keywords: 'stopwatch timer countdown chronometer',
  render(root) {
    // 스톱워치
    root.append(h('h3', null, '스톱워치'));
    const swDisplay = h('div', { class: 'big-time' }, '00:00:00.00');
    let swStart = 0, swElapsed = 0, swTimer = null;
    const laps = h('div');
    function swRender() {
      const t = swElapsed + (swTimer ? Date.now() - swStart : 0);
      const ms = Math.floor((t % 1000) / 10), s = Math.floor(t / 1000) % 60, m = Math.floor(t / 60000) % 60, hr = Math.floor(t / 3600000);
      swDisplay.textContent = `${pad(hr)}:${pad(m)}:${pad(s)}.${pad(ms)}`;
    }
    const swStartBtn = h('button', { class: 'btn primary', type: 'button' }, '시작');
    swStartBtn.addEventListener('click', () => {
      if (swTimer) { swElapsed += Date.now() - swStart; clearInterval(swTimer); swTimer = null; swStartBtn.textContent = '시작'; }
      else { swStart = Date.now(); swTimer = setInterval(swRender, 30); swStartBtn.textContent = '정지'; }
    });
    const swLapBtn = h('button', { class: 'btn', type: 'button', onclick: () => { if (swTimer || swElapsed) laps.prepend(h('div', { class: 'mono' }, `랩 ${laps.children.length + 1}: ${swDisplay.textContent}`)); } }, '랩');
    const swResetBtn = h('button', { class: 'btn', type: 'button', onclick: () => { clearInterval(swTimer); swTimer = null; swElapsed = 0; swStartBtn.textContent = '시작'; swRender(); laps.innerHTML = ''; } }, '리셋');
    root.append(swDisplay, h('div', { class: 'btn-row' }, swStartBtn, swLapBtn, swResetBtn), laps);

    // 타이머
    root.append(h('h3', { style: { marginTop: '30px' } }, '카운트다운 타이머'));
    const tmDisplay = h('div', { class: 'big-time' }, '05:00');
    let tmRemain = 300000, tmEnd = 0, tmTimer = null;
    const minInput = h('input', { type: 'number', value: 5, style: { width: '70px' } });
    const secInput = h('input', { type: 'number', value: 0, style: { width: '70px' } });
    function tmRender() {
      const t = Math.max(0, tmTimer ? tmEnd - Date.now() : tmRemain);
      tmDisplay.textContent = `${pad(Math.floor(t / 60000))}:${pad(Math.floor(t / 1000) % 60)}`;
      if (tmTimer && t <= 0) { clearInterval(tmTimer); tmTimer = null; tmDisplay.style.color = 'var(--danger)'; tmStartBtn.textContent = '시작'; try { new AudioContext(); } catch { } alert('⏰ 타이머 종료!'); }
    }
    const tmStartBtn = h('button', { class: 'btn primary', type: 'button' }, '시작');
    tmStartBtn.addEventListener('click', () => {
      if (tmTimer) { tmRemain = tmEnd - Date.now(); clearInterval(tmTimer); tmTimer = null; tmStartBtn.textContent = '재개'; }
      else {
        if (tmRemain <= 0 || tmStartBtn.textContent === '시작') tmRemain = (+minInput.value * 60 + +secInput.value) * 1000;
        tmEnd = Date.now() + tmRemain; tmDisplay.style.color = ''; tmTimer = setInterval(tmRender, 200); tmStartBtn.textContent = '일시정지';
      }
    });
    const tmResetBtn = h('button', { class: 'btn', type: 'button', onclick: () => { clearInterval(tmTimer); tmTimer = null; tmRemain = (+minInput.value * 60 + +secInput.value) * 1000; tmDisplay.style.color = ''; tmStartBtn.textContent = '시작'; tmRender(); } }, '리셋');
    root.append(
      h('div', { class: 'opt-row' }, h('span', { class: 'opt-item' }, formLabel(minInput, '분'), minInput), h('span', { class: 'opt-item' }, formLabel(secInput, '초'), secInput)),
      tmDisplay, h('div', { class: 'btn-row' }, tmStartBtn, tmResetBtn));

    return () => {
      clearInterval(swTimer);
      clearInterval(tmTimer);
      swTimer = null;
      tmTimer = null;
    };
  },
});

/* ---------- 날짜 계산기 ---------- */
// 로컬 자정 기준 Date로 정규화 (시간대 차이로 인한 ±1일 오차 방지)
function parseDay(s) {
  s = s.trim();
  const m = s.match(/^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  if (isNaN(d)) throw new Error(`인식할 수 없는 날짜입니다: ${s} (예: 2026-12-25)`);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const fmtDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} (${DOW[d.getDay()]})`;
// a에 n개월을 더하되 말일을 넘지 않게 클램프 (1/31 + 1개월 = 2/28·29)
function addMonthsClamp(a, n) {
  const t = new Date(a.getFullYear(), a.getMonth() + n, 1);
  const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(a.getDate(), dim));
  return t;
}
// 달력 기준 정확한 년/월/일 차이 (a <= b)
function ymdDiff(a, b) {
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (addMonthsClamp(a, months) > b) months--;
  const d = Math.round((b - addMonthsClamp(a, months)) / 864e5);
  return [Math.floor(months / 12), months % 12, d];
}
// a 다음 날부터 b까지 주말(토/일)을 뺀 일수
function weekdaysBetween(a, days) {
  let cnt = Math.floor(days / 7) * 5;
  const startDow = a.getDay();
  for (let i = days - (days % 7) + 1; i <= days; i++) {
    const dow = (startDow + i) % 7;
    if (dow !== 0 && dow !== 6) cnt++;
  }
  return cnt;
}

tool({
  id: 'date-calc', cat: CAT, name: '날짜 계산기 (D-day / 더하기)',
  desc: '두 날짜의 차이(D-day, 영업일)를 구하거나 날짜에 일/주/개월/년을 더하고 뺍니다.',
  keywords: 'date calculator dday diff add subtract days between 디데이',
  render(root) {
    const today = new Date();
    const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    makeIO(root, {
      inputs: null,
      options: [
        { id: 'mode', label: '계산', type: 'select', values: [['diff', '두 날짜 차이 / D-day'], ['add', '날짜 더하기/빼기']] },
        { id: 'a', label: '기준일', type: 'text', size: 130, value: ymd(today) },
        { id: 'b', label: '목표일 (차이 모드)', type: 'text', size: 130, value: `${today.getFullYear() + 1}-01-01` },
        { id: 'n', label: '더할 값 (± 가능)', type: 'number', value: 30, size: 90 },
        { id: 'unit', label: '단위', type: 'select', values: [['d', '일'], ['w', '주'], ['m', '개월'], ['y', '년']] },
      ],
      outputHTML: true, runOnLoad: true,
      process(_, o) {
        const a = parseDay(o.a);
        if (o.mode === 'add') {
          const n = Math.trunc(+o.n) || 0;
          let r;
          if (o.unit === 'd') r = new Date(a.getFullYear(), a.getMonth(), a.getDate() + n);
          else if (o.unit === 'w') r = new Date(a.getFullYear(), a.getMonth(), a.getDate() + n * 7);
          else if (o.unit === 'm') r = new Date(a.getFullYear(), a.getMonth() + n, a.getDate());
          else r = new Date(a.getFullYear() + n, a.getMonth(), a.getDate());
          const unitLabel = { d: '일', w: '주', m: '개월', y: '년' }[o.unit];
          return kvTable([
            ['계산', `${fmtDay(a)} ${n >= 0 ? '+' : ''}${n}${unitLabel}`],
            ['결과', fmtDay(r)],
            ['오늘 기준', relTime(r)],
            ['ISO 8601', ymd(r)],
            ['Unix (초)', Math.floor(r.getTime() / 1000)],
          ]);
        }
        const b = parseDay(o.b);
        const days = Math.round((b - a) / 864e5);
        const abs = Math.abs(days);
        const [from, to] = days >= 0 ? [a, b] : [b, a];
        const [dy, dm, dd] = ymdDiff(from, to);
        return kvTable([
          ['기준일', fmtDay(a)],
          ['목표일', fmtDay(b)],
          ['D-day', days > 0 ? `D-${days}` : days < 0 ? `D+${abs}` : 'D-Day (같은 날)'],
          ['일수 차이', `${abs.toLocaleString()}일`],
          ['주 단위', `${Math.floor(abs / 7)}주 ${abs % 7}일`],
          ['달력 기준', `${dy}년 ${dm}개월 ${dd}일`],
          ['영업일 (주말 제외)', `${weekdaysBetween(from, abs).toLocaleString()}일`],
          ['시간 / 분', `${(abs * 24).toLocaleString()}시간 / ${(abs * 1440).toLocaleString()}분`],
        ]);
      },
    });
  },
});
