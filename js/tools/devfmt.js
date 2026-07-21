// 코드 포맷팅 / 개발 유틸리티
import { tool, makeIO, h, kvTable, loadScript, loadCss, LIB, decodeInput, FMT_IN } from '../core.js';
import { parseXML, parseCSV, toCSV } from './dataformat.js';

const CAT = '코드 포맷팅 / 개발 유틸리티';

function shellTokens(text) {
  const out = [];
  let token = '', quote = '', escaped = false;
  for (const c of text.trim()) {
    if (escaped) { token += c; escaped = false; continue; }
    if (c === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) { if (c === quote) quote = ''; else token += c; continue; }
    if (c === "'" || c === '"') quote = c;
    else if (/\s/.test(c)) { if (token) { out.push(token); token = ''; } }
    else token += c;
  }
  if (quote) throw new Error('닫히지 않은 따옴표가 있습니다.');
  if (escaped) token += '\\';
  if (token) out.push(token);
  return out;
}

function curlToFetch(text) {
  const args = shellTokens(text.replace(/\\\r?\n/g, ' '));
  if (args.shift() !== 'curl') throw new Error('curl 명령으로 시작해야 합니다.');
  let url = '', method = '', body = '', user = '';
  const headers = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (['-X', '--request'].includes(a)) method = args[++i] || '';
    else if (['-H', '--header'].includes(a)) {
      const line = args[++i] || '', p = line.indexOf(':');
      if (p < 1) throw new Error('헤더는 "이름: 값" 형식이어야 합니다.');
      headers[line.slice(0, p).trim()] = line.slice(p + 1).trim();
    } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(a)) body = args[++i] ?? '';
    else if (['-u', '--user'].includes(a)) user = args[++i] || '';
    else if (a === '-I' || a === '--head') method = 'HEAD';
    else if (a === '-L' || a === '--location' || a === '-s' || a === '--silent') continue;
    else if (!a.startsWith('-')) url = a;
    else throw new Error(`아직 지원하지 않는 cURL 옵션입니다: ${a}`);
  }
  if (!url) throw new Error('요청 URL을 찾을 수 없습니다.');
  if (user) headers.Authorization = 'Basic ' + btoa(unescape(encodeURIComponent(user)));
  if (!method) method = body ? 'POST' : 'GET';
  const options = { method };
  if (Object.keys(headers).length) options.headers = headers;
  if (body) options.body = body;
  return `const response = await fetch(${JSON.stringify(url)}, ${JSON.stringify(options, null, 2)});\n` +
    'if (!response.ok) throw new Error(`HTTP ${response.status}`);\n' +
    'const data = await response.json();';
}

function fetchToCurl(text) {
  const m = text.match(/fetch\s*\(\s*(["'`])([^"'`]+)\1\s*(?:,\s*({[\s\S]*}))?\s*\)/);
  if (!m) throw new Error('fetch(URL, 옵션) 호출을 찾을 수 없습니다. 문자열 URL과 JSON 형태의 옵션을 사용하세요.');
  let opts = {};
  if (m[3]) {
    let raw = m[3].replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/'/g, '"');
    try { opts = JSON.parse(raw); } catch { throw new Error('fetch 옵션은 문자열 키/값으로 된 JSON 형태만 변환할 수 있습니다.'); }
  }
  const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const parts = ['curl'];
  if (opts.method && opts.method.toUpperCase() !== 'GET') parts.push('-X', opts.method.toUpperCase());
  for (const [k, v] of Object.entries(opts.headers || {})) parts.push('-H', q(`${k}: ${v}`));
  if (opts.body != null) parts.push('--data-raw', q(opts.body));
  parts.push(q(m[2]));
  return parts.join(' ');
}

tool({
  id: 'curl-fetch', cat: CAT, name: 'cURL ↔ fetch 변환기',
  desc: 'cURL 명령과 브라우저 JavaScript fetch 코드를 서로 변환합니다.',
  keywords: 'curl fetch api http request convert 변환 요청',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'cURL 또는 fetch 코드', rows: 10, value: "curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' --data-raw '{\"name\":\"홍길동\"}'" }],
      actions: [{ id: 'toFetch', label: 'cURL → fetch' }, { id: 'toCurl', label: 'fetch → cURL' }],
      autorun: false, outputRows: 12,
      process(text, o, action) {
        if (!text.trim()) return '';
        return action === 'toCurl' ? fetchToCurl(text) : curlToFetch(text);
      },
      note: '안전하게 코드를 생성만 하며 실제 네트워크 요청은 보내지 않습니다. 기본 옵션, 헤더, 본문, Basic 인증을 지원합니다.',
    });
  },
});

/* ---------- JSON ---------- */
function jsonTree(value, key) {
  const keySpan = key !== undefined ? [h('span', { class: 'jk' }, JSON.stringify(key)), ': '] : [];
  if (value === null || typeof value !== 'object') {
    const cls = typeof value === 'string' ? 'js' : typeof value === 'number' ? 'jn' : 'jb';
    return h('div', null, ...keySpan, h('span', { class: cls }, JSON.stringify(value)));
  }
  const isArr = Array.isArray(value);
  const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
  return h('details', { open: true },
    h('summary', null, ...keySpan, isArr ? `Array(${value.length})` : `Object {${entries.length}}`),
    entries.map(([k, v]) => jsonTree(v, isArr ? undefined : k)));
}

tool({
  id: 'json-format', cat: CAT, name: 'JSON 포맷/압축/트리 뷰어',
  desc: 'JSON을 정렬(pretty print), 압축(minify)하거나 접을 수 있는 트리로 표시합니다.',
  keywords: 'json pretty minify tree viewer',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'JSON', rows: 10, value: '{"name":"WTools","list":[1,2,3],"nested":{"ok":true}}' }],
      options: [
        { id: 'indent', label: '들여쓰기', type: 'select', values: [['2', '2칸'], ['4', '4칸'], ['tab', '탭']] },
        { id: 'sortKeys', label: '키 정렬', type: 'checkbox' },
      ],
      actions: [{ id: 'fmt', label: '포맷' }, { id: 'min', label: '압축' }, { id: 'tree', label: '트리 뷰' }],
      outputHTML: true, outputRows: 12,
      process(text, o, action) {
        if (!text.trim()) return '';
        let data = JSON.parse(text);
        if (o.sortKeys) {
          const sortObj = (v) => {
            if (Array.isArray(v)) return v.map(sortObj);
            if (v && typeof v === 'object')
              return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortObj(v[k])]));
            return v;
          };
          data = sortObj(data);
        }
        if (action === 'tree') return h('div', { class: 'jtree' }, jsonTree(data));
        if (action === 'min') return h('pre', { style: { margin: 0 } }, JSON.stringify(data));
        return h('pre', { style: { margin: 0 } }, JSON.stringify(data, null, o.indent === 'tab' ? '\t' : +o.indent));
      },
    });
  },
});

/* ---------- 각종 포맷터 ---------- */
function fmtXml(text, indent = '  ') {
  parseXML(text); // 유효성 검사
  const tokens = text.replace(/>\s+</g, '><').match(/<[^>]+>|[^<]+/g) || [];
  const out = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (/^<\//.test(tk)) { depth = Math.max(0, depth - 1); out.push(indent.repeat(depth) + tk); }
    else if (/^<[?!]/.test(tk) || /\/>$/.test(tk)) out.push(indent.repeat(depth) + tk);
    else if (tk.startsWith('<')) {
      // <tag>텍스트</tag> 는 한 줄로 합침
      if (tokens[i + 1] && !tokens[i + 1].startsWith('<') && tokens[i + 2] && /^<\//.test(tokens[i + 2])) {
        out.push(indent.repeat(depth) + tk + tokens[i + 1].trim() + tokens[i + 2]);
        i += 2;
      } else { out.push(indent.repeat(depth) + tk); depth++; }
    } else if (tk.trim()) out.push(indent.repeat(depth) + tk.trim());
  }
  return out.join('\n');
}

tool({
  id: 'code-format', cat: CAT, name: 'XML/CSS/JS/HTML/SQL/YAML 포맷터',
  desc: '각종 코드를 정렬(beautify)하거나 압축(minify)합니다.',
  keywords: 'beautify minify format pretty',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '코드', rows: 12, placeholder: 'SELECT id,name FROM users WHERE age>20 ORDER BY name' }],
      options: [
        { id: 'lang', label: '언어', type: 'select', values: [['sql', 'SQL'], ['js', 'JavaScript'], ['css', 'CSS'], ['html', 'HTML'], ['xml', 'XML'], ['yaml', 'YAML']] },
        { id: 'indent', label: '들여쓰기', type: 'select', values: [['2', '2칸'], ['4', '4칸']] },
      ],
      actions: [{ id: 'fmt', label: '포맷' }, { id: 'min', label: '압축' }],
      outputRows: 12, autorun: false,
      async process(text, o, action) {
        if (!text.trim()) return '';
        const size = +o.indent;
        if (action === 'min') {
          switch (o.lang) {
            case 'xml': case 'html': return text.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
            case 'css': return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').replace(/\s+/g, ' ').trim();
            case 'js': return text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
            case 'sql': return text.replace(/\s+/g, ' ').trim();
            case 'yaml': return jsyaml.dump(jsyaml.load(text), { flowLevel: 0 }).trim();
          }
        }
        switch (o.lang) {
          case 'sql': {
            await loadScript(LIB.sqlFormatter);
            return sqlFormatter.format(text, { tabWidth: size, keywordCase: 'upper' });
          }
          case 'js': {
            await loadScript(LIB.beautifyJs);
            return js_beautify(text, { indent_size: size });
          }
          case 'css': {
            await loadScript(LIB.beautifyCss);
            return css_beautify(text, { indent_size: size });
          }
          case 'html': {
            await loadScript(LIB.beautifyJs);
            await loadScript(LIB.beautifyCss);
            await loadScript(LIB.beautifyHtml);
            return html_beautify(text, { indent_size: size });
          }
          case 'xml': return fmtXml(text, ' '.repeat(size));
          case 'yaml': return jsyaml.dump(jsyaml.load(text), { indent: size, lineWidth: 120 });
        }
      },
    });
  },
});

tool({
  id: 'syntax-highlight', cat: CAT, name: '구문 강조 (Syntax Highlighter)',
  desc: '코드에 구문 강조를 적용해 HTML로 보여줍니다. (highlight.js)',
  keywords: 'highlight code color',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '코드', rows: 10, placeholder: 'function hello() {\n  console.log("world");\n}' }],
      options: [{ id: 'lang', label: '언어', type: 'select', values: [['auto', '자동 감지'], 'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'kotlin', 'swift', 'php', 'ruby', 'sql', 'html', 'xml', 'css', 'json', 'yaml', 'bash', 'shell', 'markdown'] }],
      outputHTML: true,
      async process(text, o) {
        if (!text.trim()) return '';
        await loadCss(LIB.hljsCss);
        await loadScript(LIB.hljs);
        const res = o.lang === 'auto' ? hljs.highlightAuto(text) : hljs.highlight(text, { language: o.lang });
        const pre = h('pre', { class: 'hljs', style: { margin: 0, padding: '12px', borderRadius: '8px', overflow: 'auto' } });
        const code = h('code');
        code.innerHTML = res.value;
        pre.append(code);
        return h('div', null, pre, h('div', { class: 'note', style: { marginTop: '8px' } }, '감지된 언어: ' + (res.language || o.lang)));
      },
    });
  },
});

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
  keywords: 'diff compare text',
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

/* ---------- Crontab ---------- */
const CRON_FIELDS = ['분', '시', '일', '월', '요일'];
const MONTH_KO = ['', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const DOW_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
function descField(expr, idx) {
  const unit = CRON_FIELDS[idx];
  const name = (v) => idx === 3 ? (MONTH_KO[v] || v) : idx === 4 ? (DOW_KO[v] ?? v) : v;
  if (expr === '*') return null;
  return expr.split(',').map((part) => {
    let m;
    if ((m = part.match(/^\*\/(\d+)$/))) return `${m[1]}${idx <= 1 ? unit : ''} ${unit} 간격마다`;
    if ((m = part.match(/^(\d+)-(\d+)\/(\d+)$/))) return `${name(+m[1])}~${name(+m[2])} 사이 ${m[3]} 간격`;
    if ((m = part.match(/^(\d+)-(\d+)$/))) return `${name(+m[1])}~${name(+m[2])}`;
    if ((m = part.match(/^(\d+)\/(\d+)$/))) return `${name(+m[1])}부터 ${m[2]} 간격`;
    return `${name(isNaN(+part) ? part : +part)}`;
  }).join(', ') + ` (${unit})`;
}

tool({
  id: 'crontab', cat: CAT, name: 'Crontab 표현식 생성/설명',
  desc: 'cron 표현식을 사람이 읽을 수 있는 설명으로 풀어주고 자주 쓰는 패턴을 제공합니다.',
  keywords: 'cron crontab schedule',
  render(root) {
    const presets = [
      ['* * * * *', '매분'], ['*/5 * * * *', '5분마다'], ['0 * * * *', '매시 정각'],
      ['0 0 * * *', '매일 자정'], ['0 9 * * 1-5', '평일 오전 9시'], ['0 0 * * 0', '매주 일요일 자정'],
      ['0 0 1 * *', '매월 1일 자정'], ['0 0 1 1 *', '매년 1월 1일'], ['30 4 * * 6', '토요일 새벽 4:30'],
    ];
    const io = makeIO(root, {
      inputs: [{ id: 'input', label: 'cron 표현식 (분 시 일 월 요일)', rows: 1, value: '*/15 9-18 * * 1-5' }],
      outputHTML: true, runOnLoad: true,
      process(text) {
        const parts = text.trim().split(/\s+/);
        if (parts.length !== 5) throw new Error('cron 표현식은 5개 필드(분 시 일 월 요일)여야 합니다.');
        const rows = parts.map((p, i) => [CRON_FIELDS[i], p + (descField(p, i) ? ' → ' + descField(p, i) : ' → 매 ' + CRON_FIELDS[i])]);
        const descs = parts.map((p, i) => descField(p, i)).filter(Boolean);
        return h('div', null,
          h('p', { style: { fontWeight: 700 } }, descs.length ? descs.join(' / ') + ' 에 실행' : '매분 실행'),
          kvTable(rows));
      },
    });
    root.append(h('h4', null, '자주 쓰는 패턴'),
      h('div', { class: 'btn-row' }, presets.map(([expr, label]) =>
        h('button', { class: 'btn small', type: 'button', onclick: () => { io.inputEls.input.value = expr; io.run(); } }, `${label} (${expr})`))));
  },
});

tool({
  id: 'markdown-html', cat: CAT, name: 'Markdown → HTML 변환기',
  desc: 'Markdown을 HTML 코드로 변환하고 렌더링 미리보기를 제공합니다.',
  keywords: 'markdown md html preview',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'Markdown', rows: 10, value: '# 제목\n\n- 목록 1\n- 목록 2\n\n**굵게** *기울임* `코드`\n\n[링크](https://example.com)' }],
      actions: [{ id: 'html', label: 'HTML 코드' }, { id: 'preview', label: '미리보기' }],
      outputHTML: true, outputRows: 12,
      async process(text, o, action) {
        await loadScript(LIB.marked);
        const html = marked.parse(text);
        if (action === 'preview') {
          const iframe = h('iframe', { sandbox: '', style: { width: '100%', height: '400px', border: '1px solid var(--border)', borderRadius: '8px', background: '#fff' } });
          iframe.srcdoc = '<meta charset="utf-8"><style>body{font-family:sans-serif;padding:16px}</style>' + html;
          return iframe;
        }
        return h('pre', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, html);
      },
    });
  },
});

function markdownHeadingText(raw) {
  return raw
    .replace(/\s+#+\s*$/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1')
    .trim();
}

function githubHeadingSlug(text, seen) {
  const base = text.toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  return base + (count ? '-' + count : '');
}

function markdownHeadings(text) {
  const headings = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = { char: marker[0], length: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const atx = line.match(/^ {0,3}(#{1,6})(?:\s+|$)(.*)$/);
    if (atx) {
      const title = markdownHeadingText(atx[2]);
      if (title) headings.push({ level: atx[1].length, title, line: i + 1 });
      continue;
    }
    if (i + 1 < lines.length && line.trim() && /^ {0,3}(=+|-+)\s*$/.test(lines[i + 1])) {
      const title = markdownHeadingText(line);
      if (title) headings.push({ level: lines[i + 1].trim()[0] === '=' ? 1 : 2, title, line: i + 1 });
      i++;
    }
  }
  const seen = new Map();
  return headings.map((heading) => ({ ...heading, anchor: githubHeadingSlug(heading.title, seen) }));
}

tool({
  id: 'markdown-toc', cat: CAT, name: 'Markdown 목차 생성기',
  desc: 'Markdown 헤딩을 분석해 GitHub 스타일 앵커가 적용된 목차를 생성합니다.',
  keywords: 'markdown md toc table of contents heading anchor slug 목차 헤딩 앵커 번호',
  render(root) {
    makeIO(root, {
      inputs: [{
        id: 'input', label: 'Markdown', rows: 14,
        value: '# 프로젝트 안내\n\n## 설치\n\n### 요구 사항\n\n## 사용법\n\n### 기본 사용법\n\n### 기본 사용법',
      }],
      options: [
        { id: 'includeH1', label: 'H1 포함', type: 'checkbox' },
        { id: 'maxLevel', label: '최대 깊이', type: 'select', values: [['2', 'H2'], ['3', 'H3'], ['4', 'H4'], ['5', 'H5'], ['6', 'H6']], value: '3' },
        { id: 'numbered', label: '번호 매기기', type: 'checkbox' },
      ],
      outputRows: 12, runOnLoad: true,
      process(text, o) {
        if (!text.trim()) return '';
        const all = markdownHeadings(text);
        if (!all.length) throw new Error('Markdown 헤딩을 찾을 수 없습니다. # 헤딩 또는 밑줄 형식 헤딩을 사용하세요.');
        const minLevel = o.includeH1 ? 1 : 2;
        const maxLevel = Number(o.maxLevel);
        const selected = all.filter((heading) => heading.level >= minLevel && heading.level <= maxLevel);
        if (!selected.length) throw new Error(`H${minLevel}~H${maxLevel} 범위의 헤딩을 찾을 수 없습니다.`);
        const counters = Array(6).fill(0);
        const result = selected.map((heading) => {
          const depth = Math.max(0, heading.level - minLevel);
          counters[depth]++;
          counters.fill(0, depth + 1);
          for (let i = 0; i < depth; i++) if (!counters[i]) counters[i] = 1;
          const number = o.numbered ? counters.slice(0, depth + 1).join('.') + '. ' : '';
          return `${'  '.repeat(depth)}- [${number}${heading.title}](#${heading.anchor})`;
        });
        return result.join('\n');
      },
      note: '코드 블록 안의 # 문자는 제외하며, 같은 제목은 두 번째부터 앵커에 -1, -2가 붙습니다. 앵커는 GitHub 방식에 맞춰 소문자와 하이픈으로 생성합니다.',
    });
  },
});

tool({
  id: 'html-strip', cat: CAT, name: 'HTML 렌더링 / 태그 제거',
  desc: 'HTML을 안전한 샌드박스에서 렌더링해 보거나, 태그를 제거해 순수 텍스트만 추출합니다.',
  keywords: 'html strip tags render sandbox',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'HTML', rows: 8, value: '<h1>제목</h1>\n<p>본문 <b>강조</b> 텍스트</p>' }],
      actions: [{ id: 'strip', label: '태그 제거' }, { id: 'render', label: '렌더링' }],
      outputHTML: true,
      process(text, o, action) {
        if (action === 'render') {
          const iframe = h('iframe', { sandbox: '', style: { width: '100%', height: '400px', border: '1px solid var(--border)', borderRadius: '8px', background: '#fff' } });
          iframe.srcdoc = '<meta charset="utf-8">' + text;
          return iframe;
        }
        const doc = new DOMParser().parseFromString(text, 'text/html');
        doc.querySelectorAll('script,style').forEach((n) => n.remove());
        return h('pre', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim());
      },
    });
  },
});

/* ---------- SQL INSERT ↔ JSON/CSV ---------- */
function sqlIdentifier(text) {
  const part = '(?:[A-Za-z_][A-Za-z0-9_$]*|`[^`]+`|"[^"]+"|\\[[^\\]]+\\])';
  if (!new RegExp(`^${part}(?:\\.${part})*$`).test(text.trim())) throw new Error(`올바르지 않은 테이블명입니다: ${text}`);
  return text.trim();
}
function unquoteSqlIdentifier(text) {
  return text.trim().replace(/^([`"\[])(.*)[`"\]]$/, '$2');
}
function parseSqlLiteral(token) {
  const value = token.trim();
  if (/^null$/i.test(value)) return null;
  if (/^true$/i.test(value)) return true;
  if (/^false$/i.test(value)) return false;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
    if (/^[+-]?\d+$/.test(value) && !Number.isSafeInteger(Number(value))) return value;
    return Number(value);
  }
  if (value.startsWith("'") && value.endsWith("'"))
    return value.slice(1, -1).replace(/''/g, "'").replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  throw new Error(`지원하지 않는 SQL 값입니다: ${value || '(빈 값)'}`);
}
function parseValueTuples(text) {
  const rows = [];
  let i = 0;
  const skip = () => { while (/\s/.test(text[i] || '')) i++; };
  while (i < text.length) {
    skip();
    if (text[i] === ';') { i++; skip(); break; }
    if (text[i] !== '(') throw new Error('VALUES 뒤에는 괄호로 묶인 값 목록이 필요합니다.');
    i++;
    const row = [];
    let token = '', quoted = false, closed = false;
    while (i < text.length) {
      const c = text[i];
      if (quoted) {
        token += c;
        if (c === "'" && text[i + 1] === "'") { token += text[++i]; }
        else if (c === '\\' && i + 1 < text.length) token += text[++i];
        else if (c === "'") quoted = false;
      } else if (c === "'") { quoted = true; token += c; }
      else if (c === ',') { row.push(parseSqlLiteral(token)); token = ''; }
      else if (c === ')') { row.push(parseSqlLiteral(token)); token = ''; closed = true; i++; break; }
      else token += c;
      i++;
    }
    if (quoted) throw new Error('닫히지 않은 SQL 문자열이 있습니다.');
    if (!closed) throw new Error('닫히지 않은 VALUES 괄호가 있습니다.');
    rows.push(row);
    skip();
    if (text[i] === ',') { i++; continue; }
    if (text[i] === ';') { i++; skip(); break; }
    if (i < text.length) throw new Error('VALUES 뒤의 ON CONFLICT, RETURNING, 서브쿼리 등은 지원하지 않습니다.');
  }
  if (text.slice(i).trim()) throw new Error('한 번에 하나의 INSERT 문만 변환할 수 있습니다.');
  if (!rows.length) throw new Error('VALUES 행을 찾을 수 없습니다.');
  return rows;
}
function parseSqlInsert(text) {
  const m = text.trim().match(/^INSERT\s+INTO\s+(.+?)\s*\(([^()]*)\)\s*VALUES\s*/i);
  if (!m) throw new Error('INSERT INTO 테이블 (컬럼...) VALUES (...) 형식만 지원합니다.');
  const table = sqlIdentifier(m[1]);
  const rawColumns = m[2].split(',').map((x) => x.trim());
  if (rawColumns.some((x) => !/^(?:[A-Za-z_][A-Za-z0-9_$]*|`[^`]+`|"[^"]+"|\[[^\]]+\])$/.test(x)))
    throw new Error('컬럼 목록에 올바르지 않은 식별자가 있습니다.');
  const columns = rawColumns.map(unquoteSqlIdentifier);
  if (!columns.length || columns.some((x) => !x)) throw new Error('컬럼 목록이 비어 있습니다.');
  if (new Set(columns).size !== columns.length) throw new Error('중복된 컬럼명이 있습니다.');
  const rows = parseValueTuples(text.trim().slice(m[0].length));
  rows.forEach((row, i) => {
    if (row.length !== columns.length) throw new Error(`${i + 1}번째 행의 값 개수(${row.length})가 컬럼 개수(${columns.length})와 다릅니다.`);
  });
  return { table, columns, records: rows.map((row) => Object.fromEntries(columns.map((key, i) => [key, row[i]]))) };
}
function recordsFromJson(text) {
  const data = JSON.parse(text);
  const records = Array.isArray(data) ? data : [data];
  if (!records.length || records.some((x) => !x || typeof x !== 'object' || Array.isArray(x)))
    throw new Error('JSON은 객체 또는 객체 배열이어야 합니다.');
  return records;
}
function recordsFromCsv(text) {
  const [columns, ...rows] = parseCSV(text);
  if (!columns?.length || !rows.length) throw new Error('헤더와 데이터 행이 있는 CSV를 입력하세요.');
  if (new Set(columns).size !== columns.length) throw new Error('CSV 헤더에 중복된 컬럼명이 있습니다.');
  return rows.map((row) => Object.fromEntries(columns.map((key, i) => [key, row[i] ?? ''])));
}
function recordsToSql(records, table, dialect) {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*$/.test(table))
    throw new Error('출력 테이블명은 users 또는 public.users 같은 형식으로 입력하세요.');
  const columns = [...new Set(records.flatMap(Object.keys))];
  if (!columns.length) throw new Error('변환할 컬럼이 없습니다.');
  const qid = (name) => {
    if (!name) throw new Error('빈 컬럼명은 사용할 수 없습니다.');
    if (dialect === 'mysql') return '`' + name.replace(/`/g, '``') + '`';
    return '"' + name.replace(/"/g, '""') + '"';
  };
  const literal = (value) => {
    if (value == null) return 'NULL';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('NaN과 Infinity는 SQL 값으로 변환할 수 없습니다.');
      return String(value);
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'object') value = JSON.stringify(value);
    return "'" + String(value).replace(/'/g, "''") + "'";
  };
  const tableSql = table.split('.').map(qid).join('.');
  const values = records.map((record) => '  (' + columns.map((key) => literal(record[key])).join(', ') + ')').join(',\n');
  return `INSERT INTO ${tableSql} (${columns.map(qid).join(', ')}) VALUES\n${values};`;
}

tool({
  id: 'sql-insert-convert', cat: CAT, name: 'SQL INSERT ↔ JSON/CSV 변환기',
  desc: '다중 행 SQL INSERT의 VALUES 데이터를 JSON·CSV와 상호 변환합니다.',
  keywords: 'sql insert json csv values convert mysql postgresql sqlite 변환',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'SQL INSERT, JSON 또는 CSV', rows: 12, value: "INSERT INTO users (id, name, active) VALUES\n  (1, '홍길동', TRUE),\n  (2, '김서연', FALSE);" }],
      options: [
        { id: 'table', label: '출력 테이블명', type: 'text', value: 'users', size: 140 },
        { id: 'dialect', label: 'SQL 방언', type: 'select', values: [['postgres', 'PostgreSQL'], ['mysql', 'MySQL'], ['sqlite', 'SQLite']] },
      ],
      actions: [
        { id: 'sqlJson', label: 'SQL → JSON' }, { id: 'sqlCsv', label: 'SQL → CSV' },
        { id: 'jsonSql', label: 'JSON → SQL' }, { id: 'csvSql', label: 'CSV → SQL' },
      ],
      autorun: false, outputRows: 14,
      process(text, o, action) {
        if (!text.trim()) return '';
        if (action === 'sqlJson') return JSON.stringify(parseSqlInsert(text).records, null, 2);
        if (action === 'sqlCsv') {
          const { columns, records } = parseSqlInsert(text);
          return toCSV([columns, ...records.map((record) => columns.map((key) => record[key] ?? ''))]);
        }
        const records = action === 'jsonSql' ? recordsFromJson(text) : recordsFromCsv(text);
        return recordsToSql(records, o.table.trim(), o.dialect);
      },
      note: 'INSERT INTO table (columns...) VALUES (...) 형식만 지원합니다. SQL 함수, 서브쿼리, ON CONFLICT, RETURNING 절은 지원하지 않습니다. CSV 값은 문자열로 변환됩니다.',
    });
  },
});

/* ---------- docker run ↔ compose ---------- */
function tokenize(cmd) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(cmd))) tokens.push(m[1] ?? m[2] ?? m[3]);
  return tokens;
}
function dockerRunToCompose(cmd) {
  const tokens = tokenize(cmd.replace(/\\\s*\n/g, ' ').trim());
  if (tokens[0] === 'docker') tokens.shift();
  if (tokens[0] === 'run') tokens.shift();
  const svc = { };
  const take = () => tokens.shift();
  let image = null, command = [];
  const multi = { '-p': 'ports', '--publish': 'ports', '-v': 'volumes', '--volume': 'volumes', '-e': 'environment', '--env': 'environment', '--label': 'labels', '--add-host': 'extra_hosts', '--dns': 'dns', '--cap-add': 'cap_add', '--device': 'devices' };
  const single = { '--name': 'container_name', '--restart': 'restart', '--network': 'network_mode', '--net': 'network_mode', '--hostname': 'hostname', '-h': 'hostname', '--user': 'user', '-u': 'user', '-w': 'working_dir', '--workdir': 'working_dir', '--entrypoint': 'entrypoint', '--memory': 'mem_limit', '-m': 'mem_limit', '--env-file': 'env_file' };
  while (tokens.length) {
    const t = take();
    if (image) { command.push(t); continue; }
    if (t === '-d' || t === '--detach' || t === '--rm' || t === '-it' || t === '-i' || t === '-t' || t === '--init') {
      if (t === '-it' || t === '-i') svc.stdin_open = true;
      if (t === '-it' || t === '-t') svc.tty = true;
      continue;
    }
    if (t === '--privileged') { svc.privileged = true; continue; }
    let key, val;
    if (t.includes('=') && t.startsWith('--')) [key, val] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)];
    else key = t;
    if (multi[key]) { (svc[multi[key]] ??= []).push(val ?? take()); continue; }
    if (single[key]) { svc[single[key]] = val ?? take(); continue; }
    if (t.startsWith('-')) { val ?? (tokens[0] && !tokens[0].startsWith('-') && take()); continue; } // 알 수 없는 옵션은 건너뜀
    image = t;
  }
  if (!image) throw new Error('이미지 이름을 찾지 못했습니다.');
  svc.image = image;
  if (command.length) svc.command = command.join(' ');
  const name = (svc.container_name || image.split('/').pop().split(':')[0]).replace(/[^a-zA-Z0-9_-]/g, '');
  const ordered = { image: svc.image };
  for (const k of ['container_name', 'command', 'entrypoint', 'ports', 'volumes', 'environment', 'env_file', 'restart', 'network_mode', 'hostname', 'user', 'working_dir', 'labels', 'extra_hosts', 'dns', 'cap_add', 'devices', 'mem_limit', 'privileged', 'stdin_open', 'tty'])
    if (svc[k] !== undefined) ordered[k] = svc[k];
  return jsyaml.dump({ services: { [name]: ordered } }, { lineWidth: 120 });
}
function composeToDockerRun(yml) {
  const doc = jsyaml.load(yml);
  const services = doc.services || doc;
  const out = [];
  for (const [name, s] of Object.entries(services)) {
    const parts = ['docker run -d'];
    parts.push('--name ' + (s.container_name || name));
    const q = (v) => /[\s"'$]/.test(String(v)) ? `'${v}'` : v;
    for (const p of s.ports || []) parts.push('-p ' + q(p));
    for (const v of s.volumes || []) parts.push('-v ' + q(v));
    const env = s.environment || [];
    const envList = Array.isArray(env) ? env : Object.entries(env).map(([k, v]) => `${k}=${v}`);
    for (const e of envList) parts.push('-e ' + q(e));
    if (s.restart) parts.push('--restart ' + s.restart);
    if (s.network_mode) parts.push('--network ' + s.network_mode);
    if (s.hostname) parts.push('--hostname ' + s.hostname);
    if (s.user) parts.push('--user ' + s.user);
    if (s.working_dir) parts.push('-w ' + s.working_dir);
    if (s.entrypoint) parts.push('--entrypoint ' + q(s.entrypoint));
    if (s.privileged) parts.push('--privileged');
    parts.push(s.image || '<image>');
    if (s.command) parts.push(Array.isArray(s.command) ? s.command.join(' ') : s.command);
    out.push(parts.join(' \\\n  '));
  }
  return out.join('\n\n');
}

tool({
  id: 'docker-convert', cat: CAT, name: 'docker run ↔ docker-compose 변환',
  desc: 'docker run 명령을 docker-compose.yml로, 또는 그 반대로 변환합니다.',
  keywords: 'docker compose container',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 8, value: 'docker run -d --name web -p 8080:80 -v ./html:/usr/share/nginx/html -e TZ=Asia/Seoul --restart unless-stopped nginx:alpine' }],
      actions: [{ id: 'toCompose', label: 'run → compose' }, { id: 'toRun', label: 'compose → run' }],
      outputRows: 12,
      process(text, o, action) {
        if (!text.trim()) return '';
        return action === 'toRun' ? composeToDockerRun(text) : dockerRunToCompose(text);
      },
    });
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
          const cb = h('input', { type: 'checkbox' });
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
        h('span', { class: 'opt-item' }, h('label', null, '8진수'), octInput),
        h('span', { class: 'opt-item' }, h('label', null, '심볼릭'), symOut)),
      grid,
      h('p', null, cmdOut, ' ', copyLater()));
    function copyLater() {
      const b = h('button', { class: 'copy-mini', type: 'button' }, '복사');
      b.addEventListener('click', () => navigator.clipboard.writeText(cmdOut.textContent));
      return b;
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

/* ---------- Hex 뷰어 ---------- */
// [오프셋, 시그니처(문자열 또는 바이트 배열), 이름] — 구체적인 것을 앞에 배치
const MAGICS = [
  [0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG 이미지'],
  [0, [0xff, 0xd8, 0xff], 'JPEG 이미지'],
  [0, 'GIF87a', 'GIF 이미지'], [0, 'GIF89a', 'GIF 이미지'],
  [0, '%PDF', 'PDF 문서'],
  [0, [0x50, 0x4b, 0x03, 0x04], 'ZIP 아카이브 (docx/xlsx/jar/apk 계열 포함)'],
  [0, [0x50, 0x4b, 0x05, 0x06], 'ZIP 아카이브 (빈 ZIP)'],
  [0, [0x1f, 0x8b], 'Gzip 압축'],
  [0, 'BZh', 'Bzip2 압축'],
  [0, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], 'XZ 압축'],
  [0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], '7-Zip 아카이브'],
  [0, 'Rar!', 'RAR 아카이브'],
  [0, [0x28, 0xb5, 0x2f, 0xfd], 'Zstandard 압축'],
  [0, [0x04, 0x22, 0x4d, 0x18], 'LZ4 프레임'],
  [0, [0x7f, 0x45, 0x4c, 0x46], 'ELF 실행 파일'],
  [0, [0xcf, 0xfa, 0xed, 0xfe], 'Mach-O 실행 파일 (64비트)'],
  [0, [0xce, 0xfa, 0xed, 0xfe], 'Mach-O 실행 파일 (32비트)'],
  [0, [0xca, 0xfe, 0xba, 0xbe], 'Java class 또는 Mach-O Universal'],
  [0, [0x00, 0x61, 0x73, 0x6d], 'WebAssembly 바이너리'],
  [0, 'SQLite format 3', 'SQLite 데이터베이스'],
  [0, 'OggS', 'Ogg 미디어'],
  [0, 'fLaC', 'FLAC 오디오'],
  [0, 'ID3', 'MP3 오디오 (ID3 태그)'],
  [0, [0x00, 0x00, 0x01, 0x00], 'ICO 아이콘'],
  [0, [0x49, 0x49, 0x2a, 0x00], 'TIFF 이미지 (리틀엔디언)'],
  [0, [0x4d, 0x4d, 0x00, 0x2a], 'TIFF 이미지 (빅엔디언)'],
  [0, '-----BEGIN', 'PEM 인코딩 데이터'],
  [0, '<?xml', 'XML 문서'],
  [0, '{\\rtf', 'RTF 문서'],
  [0, [0xef, 0xbb, 0xbf], 'UTF-8 BOM 텍스트'],
  [4, 'ftyp', 'MP4/MOV 미디어'],
  [257, 'ustar', 'TAR 아카이브'],
  [0, 'MZ', 'Windows 실행 파일 (EXE/DLL)'],
  [0, 'BM', 'BMP 이미지 (추정)'],
];
function detectMagic(bytes) {
  for (const [off, sig, name] of MAGICS) {
    const pat = typeof sig === 'string' ? [...sig].map((c) => c.charCodeAt(0)) : sig;
    if (off + pat.length > bytes.length) continue;
    if (pat.every((b, i) => bytes[off + i] === b)) return name;
  }
  // RIFF 계열은 8~11바이트의 서브타입으로 구분
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF') {
    const sub = String.fromCharCode(...bytes.subarray(8, 12));
    return { WEBP: 'WebP 이미지', WAVE: 'WAV 오디오', 'AVI ': 'AVI 비디오' }[sub] || 'RIFF 컨테이너 (' + sub.trim() + ')';
  }
  return null;
}
function hexDump(bytes, limit) {
  const n = Math.min(bytes.length, limit);
  const lines = [];
  for (let off = 0; off < n; off += 16) {
    const chunk = bytes.subarray(off, Math.min(off + 16, n));
    const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...chunk].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(off.toString(16).padStart(8, '0') + '  ' + hex.padEnd(47) + '  |' + ascii + '|');
  }
  return lines.join('\n');
}

tool({
  id: 'hex-viewer', cat: CAT, name: 'Hex 뷰어 (파일 덤프)',
  desc: '파일이나 텍스트를 16진수 덤프(xxd 형식)로 보고, 매직 넘버로 파일 형식을 판별합니다.',
  keywords: 'hex dump viewer binary magic number file type xxd signature',
  render(root) {
    const LIMIT = 65536;
    const info = h('div', { style: { marginTop: '10px' } });
    const out = h('textarea', { class: 'mono out', rows: 18, readonly: true, spellcheck: 'false', style: { whiteSpace: 'pre', overflowX: 'auto', marginTop: '8px' } });
    function show(bytes, label) {
      info.innerHTML = '';
      info.append(kvTable([
        ['입력', label],
        ['크기', bytes.length.toLocaleString() + ' bytes'],
        ['형식 추정 (매직 넘버)', detectMagic(bytes) || '알려진 시그니처 없음'],
      ]));
      out.value = hexDump(bytes, LIMIT) +
        (bytes.length > LIMIT ? `\n... (처음 64 KB만 표시, 전체 ${bytes.length.toLocaleString()} bytes)` : '');
    }
    const file = h('input', { type: 'file' });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (f) show(new Uint8Array(await f.arrayBuffer()), f.name);
    });
    const ta = h('textarea', { class: 'mono', rows: 4, placeholder: '파일 대신 텍스트/Hex/Base64를 직접 입력할 수도 있습니다.', spellcheck: 'false' });
    const fmt = h('select', null, FMT_IN.map(([v, l]) => h('option', { value: v }, l)));
    function fromText() {
      if (!ta.value.trim()) return;
      try { show(decodeInput(ta.value, fmt.value), '직접 입력 (' + fmt.value + ')'); }
      catch (e) { info.innerHTML = ''; info.append(h('span', { class: 'error' }, e.message)); out.value = ''; }
    }
    ta.addEventListener('input', fromText);
    fmt.addEventListener('change', fromText);
    root.append(h('div', { class: 'io' },
      h('label', { class: 'io-label' }, '파일 선택 (브라우저 밖으로 전송되지 않습니다)'), file,
      h('label', { class: 'io-label', style: { marginTop: '10px' } }, '또는 직접 입력'), ta,
      h('div', { class: 'opt-row' }, h('span', { class: 'opt-item' }, h('label', null, '입력 형식'), fmt)),
      info, out));
  },
});
