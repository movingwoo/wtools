// 코드 포맷팅 / 개발 유틸리티 — 포맷터 / 뷰어
import { tool, makeIO, h, formLabel, kvTable, loadScript, loadCss, LIB, decodeInput, FMT_IN } from '../core.js';
import { parseXML } from './dataformat.js';

const CAT = '코드 포맷팅 / 개발 유틸리티';

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
