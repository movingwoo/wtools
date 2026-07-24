// 코드 포맷팅 / 개발 유틸리티 — Diff / 정규식 테스트
import { tool, makeIO, h, loadScript, LIB } from '../core.js';

const CAT = '코드 포맷팅 / 개발 유틸리티';

/* ---------- Diff ---------- */
function jsonDiff(a, b, path, out) {
  if (a === b) return;
  const ta = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a;
  const tb = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb || (ta !== 'object' && ta !== 'array')) {
    if (JSON.stringify(a) !== JSON.stringify(b))
      out.push(['변경', path, JSON.stringify(a), JSON.stringify(b)]);
    return;
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) {
    const p = path ? `${path}.${k}` : k;
    if (!(k in a)) out.push(['추가', p, '', JSON.stringify(b[k])]);
    else if (!(k in b)) out.push(['삭제', p, JSON.stringify(a[k]), '']);
    else jsonDiff(a[k], b[k], p, out);
  }
}

tool({
  id: 'json-diff', cat: CAT, name: 'JSON Diff (구조 비교)',
  desc: '두 JSON의 구조적 차이(추가/삭제/변경된 경로)를 비교합니다.',
  keywords: 'json compare diff',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'a', label: 'JSON A (원본)', rows: 8, value: '{"name":"a","ver":1,"tags":["x"]}' },
        { id: 'b', label: 'JSON B (비교 대상)', rows: 8, value: '{"name":"b","tags":["x","y"],"new":true}' },
      ],
      outputHTML: true,
      process(v) {
        if (!v.a.trim() || !v.b.trim()) return '';
        const out = [];
        jsonDiff(JSON.parse(v.a), JSON.parse(v.b), '', out);
        if (!out.length) return h('p', { style: { color: 'var(--ok)', fontWeight: '700' } }, '✔ 두 JSON은 구조적으로 동일합니다.');
        return h('table', { class: 'grid' },
          h('tr', null, ['구분', '경로', 'A 값', 'B 값'].map((x) => h('th', null, x))),
          out.map(([kind, p, av, bv]) => h('tr', null,
            h('td', { style: { color: kind === '추가' ? 'var(--ok)' : kind === '삭제' ? 'var(--danger)' : 'var(--accent)', fontWeight: '600' } }, kind),
            h('td', { class: 'mono' }, p || '(루트)'), h('td', { class: 'mono' }, av), h('td', { class: 'mono' }, bv))));
      },
    });
  },
});

tool({
  id: 'text-diff', cat: CAT, name: '텍스트 Diff (라인 비교)',
  desc: '두 텍스트를 라인 단위로 비교해 차이를 표시합니다.',
  keywords: 'diff compare text patch difference 비교',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'a', label: '텍스트 A', rows: 8, value: '사과\n바나나\n체리' },
        { id: 'b', label: '텍스트 B', rows: 8, value: '사과\n블루베리\n체리\n두리안' },
      ],
      options: [{ id: 'mode', label: '단위', type: 'select', values: [['lines', '라인'], ['words', '단어'], ['chars', '문자']] }],
      outputHTML: true,
      async process(v, o) {
        await loadScript(LIB.jsdiff);
        const fn = o.mode === 'words' ? Diff.diffWords : o.mode === 'chars' ? Diff.diffChars : Diff.diffLines;
        const parts = fn(v.a, v.b);
        const box = h('pre', { style: { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' } });
        for (const p of parts) {
          const cls = p.added ? (o.mode === 'lines' ? 'diff-line-add' : 'diff-add')
            : p.removed ? (o.mode === 'lines' ? 'diff-line-del' : 'diff-del') : null;
          box.append(cls ? h('span', { class: cls }, p.value) : p.value);
        }
        return box;
      },
    });
  },
});

const REGEX_CHEATS = [
  ['문자 클래스', '.', '줄바꿈을 제외한 임의 문자', 'a.c'],
  ['문자 클래스', '\\d', '숫자 한 글자', '\\d+'],
  ['문자 클래스', '\\D', '숫자가 아닌 문자', '\\D+'],
  ['문자 클래스', '\\w', '영문자·숫자·밑줄', '\\w+'],
  ['문자 클래스', '\\W', '단어 문자가 아닌 문자', '\\W+'],
  ['문자 클래스', '\\s', '공백 문자', '\\s+'],
  ['문자 클래스', '\\S', '공백이 아닌 문자', '\\S+'],
  ['문자 클래스', '[abc]', '목록 중 한 문자', '[abc]'],
  ['문자 클래스', '[^abc]', '목록에 없는 한 문자', '[^abc]'],
  ['문자 클래스', '[a-z]', '범위 안의 한 문자', '[A-Za-z]'],
  ['문자 클래스', '\\p{…}', '유니코드 속성에 해당하는 문자 (u 플래그 필요)', '\\p{Letter}+'],
  ['수량자', '*', '0회 이상 반복', 'a*'],
  ['수량자', '+', '1회 이상 반복', 'a+'],
  ['수량자', '?', '0회 또는 1회', 'a?'],
  ['수량자', '{n}', '정확히 n회', '\\d{4}'],
  ['수량자', '{n,}', 'n회 이상', '\\d{2,}'],
  ['수량자', '{n,m}', 'n회 이상 m회 이하', '\\d{2,4}'],
  ['수량자', '*?', '최소 범위로 반복하는 게으른 수량자', '.*?'],
  ['앵커', '^', '문자열 또는 줄의 시작', '^제목'],
  ['앵커', '$', '문자열 또는 줄의 끝', '끝$'],
  ['앵커', '\\b', '단어 경계', '\\bword\\b'],
  ['앵커', '\\B', '단어 경계가 아닌 위치', '\\Bword'],
  ['그룹', '(…)', '캡처 그룹', '(abc)'],
  ['그룹', '(?:…)', '캡처하지 않는 그룹', '(?:abc)'],
  ['그룹', '(?<name>…)', '이름 있는 캡처 그룹', '(?<word>\\w+)'],
  ['그룹', '\\1', '첫 번째 캡처 그룹 역참조', '(\\w+)\\s+\\1'],
  ['그룹', '\\k<name>', '이름 있는 그룹 역참조', '(?<word>\\w+)\\s+\\k<word>'],
  ['탐색', '(?=…)', '뒤에 패턴이 오는 위치 (긍정 전방 탐색)', '\\d+(?=원)'],
  ['탐색', '(?!…)', '뒤에 패턴이 오지 않는 위치 (부정 전방 탐색)', 'foo(?!bar)'],
  ['탐색', '(?<=…)', '앞에 패턴이 있는 위치 (긍정 후방 탐색)', '(?<=₩)\\d+'],
  ['탐색', '(?<!…)', '앞에 패턴이 없는 위치 (부정 후방 탐색)', '(?<!-)\\d+'],
  ['기타', 'a|b', '왼쪽 또는 오른쪽 패턴', '고양이|강아지'],
  ['기타', '\\.', '특수 문자를 문자 그대로 찾기', '\\.' ],
  ['플래그', 'g', '첫 매치가 아닌 모든 매치 검색', 'g', 'flag'],
  ['플래그', 'i', '영문 대소문자 무시', 'i', 'flag'],
  ['플래그', 'm', '^와 $를 각 줄의 시작과 끝에도 적용', 'm', 'flag'],
  ['플래그', 's', '점(.)이 줄바꿈에도 매치', 's', 'flag'],
  ['플래그', 'u', '유니코드 코드 포인트 단위로 처리', 'u', 'flag'],
  ['플래그', 'y', 'lastIndex 위치에서만 고정 검색', 'y', 'flag'],
  ['플래그', 'd', '매치와 그룹의 시작·끝 인덱스 기록', 'd', 'flag'],
  ['플래그', 'v', '유니코드 집합 표기 확장 (최신 브라우저)', 'v', 'flag'],
];

tool({
  id: 'regex-tester', cat: CAT, name: '정규식 테스터 + 치트시트',
  desc: '정규식을 실시간으로 테스트하고 검색 가능한 JavaScript 정규식 치트시트를 제공합니다.',
  keywords: 'regex regexp pattern match replace cheat sheet reference 문법 치트시트 정규표현식',
  render(root) {
    const io = makeIO(root, {
      inputs: [{ id: 'text', label: '테스트 문자열', rows: 6, value: '연락처: kim@example.com, lee@test.co.kr\n전화: 010-1234-5678' }],
      options: [
        { id: 'pattern', label: '패턴', type: 'text', size: 300, value: '[\\w.]+@[\\w.]+' },
        { id: 'flags', label: '플래그', type: 'text', size: 70, value: 'g' },
        { id: 'replace', label: '치환(선택)', type: 'text', size: 160, placeholder: '$& 또는 $1' },
      ],
      outputHTML: true, runOnLoad: true,
      process(text, o) {
        if (!o.pattern) return '';
        const re = new RegExp(o.pattern, o.flags);
        const matches = [];
        if (re.global) {
          let m;
          while ((m = re.exec(text)) !== null) {
            matches.push(m);
            if (m.index === re.lastIndex) re.lastIndex++;
            if (matches.length > 1000) break;
          }
        } else {
          const m = re.exec(text);
          if (m) matches.push(m);
        }
        const box = h('div');
        // 하이라이트
        const hl = h('pre', { style: { margin: '0 0 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' } });
        let pos = 0;
        for (const m of matches) {
          if (m.index >= pos) {
            hl.append(text.slice(pos, m.index), h('mark', { class: 'rx' }, m[0] || '∅'));
            pos = m.index + m[0].length;
          }
        }
        hl.append(text.slice(pos));
        box.append(h('p', { style: { fontWeight: 700 } }, `매치 ${matches.length}개`), hl);
        if (matches.length) {
          box.append(h('table', { class: 'grid' },
            h('tr', null, ['#', '위치', '매치', '그룹'].map((x) => h('th', null, x))),
            matches.slice(0, 100).map((m, i) => h('tr', null,
              h('td', null, i + 1), h('td', null, m.index),
              h('td', { class: 'mono' }, m[0]),
              h('td', { class: 'mono' }, m.length > 1 ? m.slice(1).map((g, gi) => `$${gi + 1}=${g ?? '∅'}`).join(', ') : (m.groups ? JSON.stringify(m.groups) : '-'))))));
        }
        if (o.replace) {
          box.append(h('h4', null, '치환 결과'),
            h('pre', { class: 'out-html', style: { whiteSpace: 'pre-wrap' } }, text.replace(new RegExp(o.pattern, o.flags), o.replace)));
        }
        return box;
      },
    });

    const search = h('input', { type: 'text', placeholder: '문법 또는 설명 검색', 'aria-label': '정규식 치트시트 검색', style: { width: '100%', margin: '10px 0' } });
    const result = h('div', { 'aria-live': 'polite' });
    function insert(item) {
      if (item[4] === 'flag') {
        const flags = io.optEls.flags;
        if (!flags.value.includes(item[1])) flags.value += item[1];
        flags.dispatchEvent(new Event('input'));
        return;
      }
      const pattern = io.optEls.pattern;
      const start = pattern.selectionStart ?? pattern.value.length;
      const end = pattern.selectionEnd ?? start;
      pattern.setRangeText(item[3], start, end, 'end');
      pattern.focus();
      pattern.dispatchEvent(new Event('input'));
    }
    function drawCheats() {
      const query = search.value.trim().toLocaleLowerCase();
      const items = REGEX_CHEATS.filter((item) => !query || item.slice(0, 4).join(' ').toLocaleLowerCase().includes(query));
      result.innerHTML = '';
      if (!items.length) {
        result.append(h('p', { class: 'note' }, '검색 결과가 없습니다.'));
        return;
      }
      const table = h('table', { class: 'grid' },
        h('thead', null, h('tr', null, ['분류', '문법', '설명', '삽입 예시'].map((label) => h('th', null, label)))),
        h('tbody', null, items.map((item) => h('tr', null,
          h('td', null, item[0]),
          h('td', null, h('button', { type: 'button', class: 'copy-mini', title: item[4] === 'flag' ? '플래그에 추가' : '패턴에 삽입', onclick: () => insert(item) }, item[1])),
          h('td', null, item[2]),
          h('td', { class: 'mono' }, item[3])))));
      result.append(h('div', { style: { overflowX: 'auto' } }, table));
    }
    const cheats = h('details', { style: { marginTop: '16px' } },
      h('summary', { style: { cursor: 'pointer', fontWeight: '700' } }, `정규식 치트시트 (${REGEX_CHEATS.length}개)`),
      h('div', { class: 'note', style: { marginTop: '10px' } }, 'JavaScript 정규식 기준입니다. 문법 버튼은 패턴에 예시를 삽입하고, 플래그 버튼은 플래그 입력에 추가합니다. 후방 탐색은 ES2018+, v 플래그는 최신 브라우저 지원이 필요합니다.'),
      search, result);
    search.addEventListener('input', drawCheats);
    root.append(cheats);
    drawCheats();
  },
});
