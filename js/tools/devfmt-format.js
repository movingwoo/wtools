// 코드 포맷팅 / 개발 유틸리티 — 포맷터 / 뷰어
import { tool, makeIO, h, formLabel, kvTable, decodeInput, FMT_IN } from '../core.js';
import { parseXML } from './dataformat.js';

const CAT = '코드 포맷팅 / 개발 유틸리티';
const CODE_FORMAT_WORKER_THRESHOLD = 2_000;
const CODE_FORMAT_WARNING_THRESHOLD = 200_000;
const CODE_FORMAT_MAX_INPUT_LENGTH = 4 * 1024 * 1024;

let codeFormatterPromise;
function loadCodeFormatter() {
  return (codeFormatterPromise ??= import('../lib/code/formatter.js').catch(() => {
    codeFormatterPromise = null;
    throw new Error('코드 포맷터 엔진을 불러오지 못했습니다. 잠시 후 다시 시도하세요.');
  }));
}

let sqlFormatterPromise;
function loadSqlFormatter() {
  return (sqlFormatterPromise ??= import('../lib/code/sql-formatter.js').catch(() => {
    sqlFormatterPromise = null;
    throw new Error('SQL 포맷터 엔진을 불러오지 못했습니다. 잠시 후 다시 시도하세요.');
  }));
}

function formatCodeInWorker(text, lang, action, indentSize, signal, formatterOptions = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/code-format.js', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      callback(value);
    };
    const abort = () => finish(reject, new DOMException('작업이 취소되었습니다.', 'AbortError'));
    worker.addEventListener('message', ({ data }) => {
      if (data.error) {
        const error = new Error(data.error);
        error.code = data.code;
        finish(reject, error);
      } else finish(resolve, data.result);
    }, { once: true });
    worker.addEventListener('error', () => {
      finish(reject, new Error('코드 포맷터 Worker를 실행하지 못했습니다.'));
    }, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    else worker.postMessage({ text, lang, action, indentSize, formatterOptions });
  });
}

async function runInternalFormatter(text, lang, action, indentSize, signal, formatterOptions = {}) {
  if (text.length >= CODE_FORMAT_WORKER_THRESHOLD)
    return formatCodeInWorker(text, lang, action, indentSize, signal, formatterOptions);
  const formatter = lang === 'sql' ? await loadSqlFormatter() : await loadCodeFormatter();
  if (signal?.aborted) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
  const functions = {
    js: { fmt: formatter.formatJavaScript, min: formatter.minifyJavaScript },
    css: { fmt: formatter.formatCss, min: formatter.minifyCss },
    html: { fmt: formatter.formatHtml, min: formatter.minifyHtml },
    sql: { fmt: formatter.formatSql, min: formatter.minifySql },
  };
  return functions[lang][action](text, { indentSize, ...formatterOptions });
}

function sqlFormatterOptions(options) {
  return {
    dialect: options.sqlDialect,
    mysqlBackslashEscapes: options.mysqlBackslashEscapes,
    mysqlAnsiQuotes: options.mysqlAnsiQuotes,
  };
}

function codeFormatterError(error, lang) {
  const label = { js: 'JavaScript', css: 'CSS', html: 'HTML', sql: 'SQL' }[lang] || '코드';
  if (error?.code === 'FORMAT_NESTING')
    return new Error(`${label} 중첩이 너무 깊습니다. 중첩을 256단계 이하로 줄이세요.`, { cause: error });
  if (error?.code === 'FORMAT_OUTPUT_LIMIT')
    return new Error(`${label} 포맷 결과가 16,777,216자를 초과합니다. 입력이나 중첩을 줄이세요.`, { cause: error });
  if (error?.code === 'SQL_UNTERMINATED')
    return new Error('SQL 문자열, 인용 식별자 또는 블록 주석이 닫히지 않았습니다.', { cause: error });
  if (error?.code === 'SQL_TOKEN_LIMIT')
    return new Error('SQL 토큰이 500,000개를 초과합니다. 입력을 줄이세요.', { cause: error });
  if (error?.code === 'SQL_DIALECT')
    return new Error('지원하지 않는 SQL 종류입니다.', { cause: error });
  if (error?.code === 'SQL_SYNTAX')
    return new Error('SQL 괄호 구조가 올바르지 않습니다.', { cause: error });
  return error;
}

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
  keywords: 'json pretty prettify beautify minify tree viewer formatter',
  transfer: {
    inputs: [{ id: 'input', label: 'JSON', accepts: ['json'] }],
    outputs: [{ id: 'json', label: 'JSON 결과', type: 'json', targets: ['data-convert', 'json-schema'] }],
  },
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'JSON', rows: 10, value: '{"name":"WTools","list":[1,2,3],"nested":{"ok":true}}' }],
      options: [
        { id: 'indent', label: '들여쓰기', type: 'select', values: [['2', '2칸'], ['4', '4칸'], ['tab', '탭']] },
        { id: 'sortKeys', label: '키 정렬', type: 'checkbox' },
      ],
      actions: [{ id: 'fmt', label: '포맷' }, { id: 'min', label: '압축' }, { id: 'tree', label: '트리 뷰' }],
      outputHTML: true, outputRows: 12,
      transferOutput: {
        id: 'json',
        when: ({ result, actionId }) => actionId !== 'tree' && !!result?.textContent.trim(),
        value: ({ result }) => result.textContent,
      },
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
    const io = makeIO(root, {
      inputs: [{ id: 'input', label: '코드', rows: 12, placeholder: 'SELECT id,name FROM users WHERE age>20 ORDER BY name' }],
      options: [
        { id: 'lang', label: '언어', type: 'select', values: [['sql', 'SQL'], ['js', 'JavaScript'], ['css', 'CSS'], ['html', 'HTML'], ['xml', 'XML'], ['yaml', 'YAML']] },
        { id: 'indent', label: '들여쓰기', type: 'select', values: [['2', '2칸'], ['4', '4칸']] },
        { id: 'sqlDialect', label: 'SQL 종류', type: 'select', value: 'standard', values: [
          ['standard', 'SQL:2023'], ['postgresql', 'PostgreSQL'], ['mysql', 'MySQL'], ['sqlite', 'SQLite'],
        ] },
        { id: 'mysqlBackslashEscapes', label: 'MySQL 백슬래시 이스케이프', type: 'checkbox', value: true },
        { id: 'mysqlAnsiQuotes', label: 'MySQL ANSI_QUOTES', type: 'checkbox' },
      ],
      actions: [{ id: 'fmt', label: '포맷' }, { id: 'min', label: '압축' }],
      outputRows: 12, autorun: false, cancelable: true,
      largeInputThreshold: CODE_FORMAT_WARNING_THRESHOLD,
      async process(text, o, action, signal) {
        if (!text.trim()) return '';
        if (text.length > CODE_FORMAT_MAX_INPUT_LENGTH)
          throw new Error('코드 포맷터 입력은 4,194,304자 이하여야 합니다.');
        const size = +o.indent;
        if (action === 'min') {
          switch (o.lang) {
            case 'html': case 'css': case 'js':
              try { return await runInternalFormatter(text, o.lang, action, size, signal); }
              catch (error) { throw codeFormatterError(error, o.lang); }
            case 'xml': return text.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
            case 'sql': {
              try {
                return await runInternalFormatter(text, o.lang, action, size, signal,
                  sqlFormatterOptions(o));
              }
              catch (error) { throw codeFormatterError(error, o.lang); }
            }
            case 'yaml': return jsyaml.dump(jsyaml.load(text), { flowLevel: 0 }).trim();
          }
        }
        switch (o.lang) {
          case 'sql': {
            try {
              return await runInternalFormatter(text, o.lang, action, size, signal,
                sqlFormatterOptions(o));
            }
            catch (error) { throw codeFormatterError(error, o.lang); }
          }
          case 'js': {
            try { return await runInternalFormatter(text, o.lang, action, size, signal); }
            catch (error) { throw codeFormatterError(error, o.lang); }
          }
          case 'css': {
            try { return await runInternalFormatter(text, o.lang, action, size, signal); }
            catch (error) { throw codeFormatterError(error, o.lang); }
          }
          case 'html': {
            try { return await runInternalFormatter(text, o.lang, action, size, signal); }
            catch (error) { throw codeFormatterError(error, o.lang); }
          }
          case 'xml': return fmtXml(text, ' '.repeat(size));
          case 'yaml': return jsyaml.dump(jsyaml.load(text), { indent: size, lineWidth: 120 });
        }
      },
      note: 'SQL은 SQL:2023 공통 DML·DDL과 CTE·조인·집합 연산·CASE·윈도 함수 범위를 포맷합니다. 선택한 SQL 종류에 맞춰 인용문·주석·연산자·파라미터를 보존하며, MySQL 연결의 SQL 모드와 옵션을 같게 설정해야 합니다. 각 SQL 종류의 전체 문법을 검사하지는 않습니다. SQL·JavaScript·CSS·HTML은 외부 요청 없이 자체 엔진으로 처리하고, 2천 자 이상은 취소 가능한 Worker를 사용하며 입력은 최대 4,194,304자, 결과는 최대 16,777,216자입니다.',
    });
    const sqlOnly = ['sqlDialect', 'mysqlBackslashEscapes', 'mysqlAnsiQuotes'];
    const updateSqlOptions = () => {
      const isSql = io.optEls.lang.value === 'sql';
      const isMysql = isSql && io.optEls.sqlDialect.value === 'mysql';
      for (const id of sqlOnly)
        io.optEls[id].closest('.opt-item').classList.toggle('hidden', !isSql || id !== 'sqlDialect' && !isMysql);
    };
    io.optEls.lang.addEventListener('change', updateSqlOptions);
    io.optEls.sqlDialect.addEventListener('change', updateSqlOptions);
    updateSqlOptions();
  },
});

let syntaxHighlighterPromise;
const SYNTAX_LARGE_INPUT_LENGTH = 200_000;
const SYNTAX_MAX_INPUT_LENGTH = 1_000_000;
const SYNTAX_RENDER_BATCH = 2_000;

function loadSyntaxHighlighter() {
  return (syntaxHighlighterPromise ??= import('../lib/code/syntax-highlighter.js').catch(() => {
    syntaxHighlighterPromise = null;
    throw new Error('구문 강조 엔진을 불러오지 못했습니다. 잠시 후 다시 시도하세요.');
  }));
}

function syntaxAbortError() {
  return new DOMException('구문 강조 작업이 취소되었습니다.', 'AbortError');
}

async function renderSyntaxCode(tokens, signal) {
  const code = h('code');
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < tokens.length; i++) {
    if (signal?.aborted) throw syntaxAbortError();
    const token = tokens[i];
    fragment.append(token.type
      ? h('span', { class: 'syn-' + token.type }, token.value)
      : document.createTextNode(token.value));
    if ((i + 1) % SYNTAX_RENDER_BATCH === 0) {
      code.append(fragment);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  code.append(fragment);
  return code;
}

tool({
  id: 'syntax-highlight', cat: CAT, name: '구문 강조 (Syntax Highlighter)',
  desc: '22개 언어의 코드를 자체 토크나이저와 밝은/어두운 테마로 강조합니다.',
  keywords: 'highlight code color',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '코드', rows: 10, placeholder: 'function hello() {\n  console.log("world");\n}' }],
      options: [{ id: 'lang', label: '언어', type: 'select', values: [['auto', '자동 감지'], 'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'kotlin', 'swift', 'php', 'ruby', 'sql', 'html', 'xml', 'css', 'json', 'yaml', 'bash', 'shell', 'markdown'] }],
      outputHTML: true,
      cancelable: true,
      largeInputThreshold: SYNTAX_LARGE_INPUT_LENGTH,
      async process(text, o, _actionId, signal) {
        if (!text.trim()) return '';
        if (text.length > SYNTAX_MAX_INPUT_LENGTH)
          throw new Error('구문 강조 입력은 1,000,000자 이하여야 합니다.');
        const { highlight, highlightAuto } = await loadSyntaxHighlighter();
        if (signal?.aborted) throw syntaxAbortError();
        const result = o.lang === 'auto' ? highlightAuto(text) : highlight(text, o.lang);
        const code = await renderSyntaxCode(result.tokens, signal);
        const pre = h('pre', { class: 'syntax-highlight' }, code);
        const detected = o.lang === 'auto' ? (result.language || '일반 텍스트') : result.language;
        return h('div', null, pre,
          h('div', { class: 'note syntax-highlight-note' }, '감지된 언어: ' + detected));
      },
      note: '코드는 브라우저 안에서 처리하며 외부 라이브러리를 요청하지 않습니다. 자동 감지는 확신도가 낮으면 일반 텍스트로 표시하며, 입력은 최대 1,000,000자까지 처리합니다.',
    });
  },
});

let markdownParserPromise;
const MARKDOWN_WORKER_THRESHOLD = 200_000;
const MARKDOWN_MAX_INPUT_LENGTH = 4 * 1024 * 1024;
function loadMarkdownParser() {
  return (markdownParserPromise ??= import('../lib/markdown/parser.js').catch(() => {
    markdownParserPromise = null;
    throw new Error('Markdown 변환기를 불러오지 못했습니다. 잠시 후 다시 시도하세요.');
  }));
}

function renderMarkdownInWorker(text, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/markdown-render.js', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      callback(value);
    };
    const abort = () => finish(reject, new DOMException('작업이 취소되었습니다.', 'AbortError'));
    worker.addEventListener('message', ({ data }) => {
      if (data.error) {
        const error = new Error(data.error);
        error.code = data.code;
        finish(reject, error);
      } else finish(resolve, data.html);
    }, { once: true });
    worker.addEventListener('error', () => {
      finish(reject, new Error('Markdown 변환 Worker를 실행하지 못했습니다.'));
    }, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    else worker.postMessage({ text });
  });
}

tool({
  id: 'markdown-html', cat: CAT, name: 'Markdown → HTML 변환기',
  desc: 'CommonMark·GFM의 주요 Markdown 문법을 자체 파서로 HTML 코드로 변환하고 렌더링 미리보기를 제공합니다.',
  keywords: 'markdown md html preview',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'Markdown', rows: 10, value: '# 제목\n\n- 목록 1\n- 목록 2\n\n**굵게** *기울임* `코드`\n\n[링크](https://example.com)' }],
      actions: [{ id: 'html', label: 'HTML 코드' }, { id: 'preview', label: '미리보기' }],
      outputHTML: true, outputRows: 12, cancelable: true,
      async process(text, o, action, signal) {
        if (text.length > MARKDOWN_MAX_INPUT_LENGTH) {
          throw new Error('Markdown 입력은 최대 4,194,304자까지 처리할 수 있습니다. 입력을 나눠서 변환하세요.');
        }
        let html;
        try {
          if (text.length >= MARKDOWN_WORKER_THRESHOLD) html = await renderMarkdownInWorker(text, signal);
          else {
            const { parseMarkdown } = await loadMarkdownParser();
            html = parseMarkdown(text);
          }
        } catch (error) {
          if (error?.name === 'AbortError' || error?.message?.startsWith('Markdown 변환기를 불러오지')) throw error;
          if (error?.code === 'MAX_INPUT') {
            throw new Error('Markdown 입력은 최대 4,194,304자까지 처리할 수 있습니다. 입력을 나눠서 변환하세요.');
          }
          if (error?.code === 'MAX_NESTING') {
            throw new Error('Markdown 중첩이 너무 깊습니다. 목록과 인용문 중첩을 64단계 이하로 줄이세요.');
          }
          if (error?.code === 'MAX_STRUCTURES') {
            throw new Error('Markdown 구조가 너무 복잡합니다. 블록·목록·표 항목을 10만 개 이하로 줄이세요.');
          }
          if (error?.code === 'MAX_OUTPUT') {
            throw new Error('변환 결과가 33,554,432자 제한을 넘습니다. 입력을 나눠서 변환하세요.');
          }
          throw new Error('Markdown을 변환하지 못했습니다. 입력을 확인하세요.');
        }
        if (action === 'preview') {
          const iframe = h('iframe', { sandbox: '', referrerpolicy: 'no-referrer', style: { width: '100%', height: '400px', border: '1px solid var(--border)', borderRadius: '8px', background: '#fff' } });
          iframe.srcdoc = '<meta charset="utf-8"><style>body{font-family:sans-serif;padding:16px}</style>' + html;
          return iframe;
        }
        return h('pre', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, html);
      },
      note: '표·작업 목록을 포함한 GFM 문법과 raw HTML을 지원합니다. 입력은 최대 4,194,304자이며, 큰 입력은 취소 가능한 Worker에서 처리합니다. 미리보기는 스크립트 권한이 없는 샌드박스에서 렌더링되지만, 변환 결과는 HTML sanitizer가 아닙니다. 신뢰할 수 없는 Markdown의 결과를 웹 페이지에 직접 삽입하지 마세요.',
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
      formLabel(file, '파일 선택 (브라우저 밖으로 전송되지 않습니다)', { class: 'io-label' }), file,
      formLabel(ta, '또는 직접 입력', { class: 'io-label', style: { marginTop: '10px' } }), ta,
      h('div', { class: 'opt-row' }, h('span', { class: 'opt-item' }, formLabel(fmt, '입력 형식'), fmt)),
      info, out));
  },
});
