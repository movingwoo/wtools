// core.js — 도구 등록 프레임워크 + 공통 유틸리티

export const categories = [
  '인코딩 / 디코딩',
  '데이터 포맷 변환',
  '코드 포맷팅 / 개발 유틸리티',
  '문자열 / 텍스트',
  '해싱',
  '암호화 / 복호화',
  '공개키 / 인증서',
  '네트워크',
  '날짜 / 시간',
  '이미지 / 미디어 / QR',
  '수학 / 논리 / 랜덤',
  '압축 / 아카이브',
];

export const tools = [];
export function tool(def) { tools.push(def); }

let pendingToolInput = null;
export function stageToolInput(toolId, value, setup = {}) {
  pendingToolInput = { toolId, value, ...setup };
}

function takeToolInput() {
  const id = location.hash.match(/^#\/tool\/([\w-]+)/)?.[1];
  if (!pendingToolInput || pendingToolInput.toolId !== id) return null;
  const pending = pendingToolInput;
  pendingToolInput = null;
  return pending;
}

/* ---------- DOM 헬퍼 ---------- */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : String(kid));
  }
  return el;
}

export function copyBtn(getText, label = '복사') {
  const b = h('button', { class: 'copy-mini', type: 'button' }, label);
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(typeof getText === 'function' ? getText() : getText);
      b.textContent = '복사됨!';
    } catch { b.textContent = '실패'; }
    setTimeout(() => (b.textContent = label), 1200);
  });
  return b;
}

// [[라벨, 값], ...] → 복사 버튼이 달린 키-값 테이블
export function kvTable(rows) {
  return h('table', { class: 'kv' },
    rows.map(([k, v]) =>
      h('tr', null,
        h('th', null, k),
        h('td', null, copyBtn(String(v)), String(v)))));
}

/* ---------- 바이트/문자열 변환 ---------- */
const TE = new TextEncoder();
export const strToBytes = (s) => TE.encode(s);
export const bytesToStr = (b) => new TextDecoder('utf-8', { fatal: false }).decode(b);

export function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function hexToBytes(hex) {
  const clean = hex.replace(/[\s:,-]|0x/gi, '');
  if (!/^[0-9a-f]*$/i.test(clean) || clean.length % 2) throw new Error('올바른 Hex 문자열이 아닙니다.');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}
export function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function b64ToBytes(str) {
  const clean = str.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  let bin;
  try { bin = atob(clean); } catch { throw new Error('올바른 Base64 문자열이 아닙니다.'); }
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// 입력 형식(text/base64/hex) → 바이트
export function decodeInput(str, fmt) {
  if (fmt === 'base64') return b64ToBytes(str);
  if (fmt === 'hex') return hexToBytes(str);
  return strToBytes(str);
}
// 바이트 → 출력 형식
export function encodeOutput(bytes, fmt) {
  if (fmt === 'base64') return bytesToB64(bytes);
  if (fmt === 'hex') return bytesToHex(bytes);
  return bytesToStr(bytes);
}
export const FMT_IN = [['text', '텍스트'], ['base64', 'Base64'], ['hex', 'Hex']];
export const FMT_BIN = [['base64', 'Base64'], ['hex', 'Hex']];

// 일괄 처리 결과를 ZIP 하나로 묶어 다운로드. entries: [{ name, data: Blob|Uint8Array }]
export async function downloadZip(zipName, entries) {
  await loadScript(LIB.fflate);
  const obj = {};
  for (const e of entries) {
    let name = e.name, n = 1;
    while (obj[name] != null) name = e.name.replace(/(\.[^.\/]*)?$/, (m) => ` (${++n})` + m);
    obj[name] = e.data instanceof Blob ? new Uint8Array(await e.data.arrayBuffer()) : e.data;
  }
  const data = await new Promise((res, rej) =>
    fflate.zip(obj, { level: 6 }, (err, d) => (err ? rej(err) : res(d))));
  download(zipName, new Blob([data], { type: 'application/zip' }));
}

export function download(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- 외부 라이브러리 지연 로드 ---------- */
const loaded = {};
export function loadScript(url) {
  return (loaded[url] ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => res();
    s.onerror = () => {
      delete loaded[url];
      rej(new Error('외부 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인하세요.'));
    };
    document.head.append(s);
  }));
}
export function loadCss(url) {
  return (loaded[url] ??= new Promise((res, rej) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = url;
    l.onload = () => res();
    l.onerror = () => {
      delete loaded[url];
      rej(new Error('외부 스타일을 불러오지 못했습니다. 네트워크 연결을 확인하세요.'));
    };
    document.head.append(l);
  }));
}

const loadedModules = {};
export function loadModule(url) {
  return (loadedModules[url] ??= import(url).catch(() => {
    delete loadedModules[url];
    throw new Error('외부 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인하세요.');
  }));
}

export const LIB = {
  jsrsasign: 'https://cdn.jsdelivr.net/npm/jsrsasign@11.1.0/lib/jsrsasign-all-min.js',
  marked: 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
  hljs: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  hljsCss: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark-dimmed.min.css',
  qrcode: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
  uaparser: 'https://cdn.jsdelivr.net/npm/ua-parser-js@1.0.38/dist/ua-parser.min.js',
  beautifyJs: 'https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify.min.js',
  beautifyCss: 'https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify-css.min.js',
  beautifyHtml: 'https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify-html.min.js',
  sqlFormatter: 'https://cdn.jsdelivr.net/npm/sql-formatter@15.3.2/dist/sql-formatter.min.js',
  jsdiff: 'https://cdn.jsdelivr.net/npm/diff@5.2.0/dist/diff.min.js',
  figlet: 'https://cdn.jsdelivr.net/npm/figlet@1.7.0/lib/figlet.js',
  pako: 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
  fflate: 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js',
  lzma: 'https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma_worker.min.js',
  md4: 'https://cdn.jsdelivr.net/npm/js-md4@0.3.2/build/md4.min.js',
  jsqr: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  jsonpath: 'https://unpkg.com/jsonpath-plus@10.3.0/dist/index-browser-umd.min.cjs',
  jmespath: 'https://cdn.jsdelivr.net/npm/jmespath@0.16.0/jmespath.min.js',
  ajv: 'https://cdn.jsdelivr.net/npm/ajv@6.12.6/dist/ajv.bundle.js',
  bcrypt: 'https://cdn.jsdelivr.net/npm/bcryptjs@2.4.3/dist/bcrypt.min.js',
};

/* ---------- 공통 도구 UI 빌더 ----------
cfg = {
  inputs: [{id,label,rows,placeholder,value}]  // 생략 시 [{id:'input'}], null이면 입력 없음
  options: [{id,label,type:'select'|'text'|'password'|'number'|'checkbox',values,value,placeholder,size}]
  actions: [{id,label,primary}]                // 생략 시 자동 실행만
  process: (input|{inputs}, opts, actionId) => string|Node|Promise
  outputHTML: bool, outputRows, autorun (기본 true), runOnLoad (기본 false), note
}
------------------------------------------------ */
export function makeIO(root, cfg) {
  const wrap = h('div', { class: 'io', 'aria-busy': 'false' });
  const inputDefs = cfg.inputs === null ? [] : (cfg.inputs || [{ id: 'input', label: '입력' }]);
  const inputEls = {};
  const staged = inputDefs.length ? takeToolInput() : null;

  for (const def of inputDefs) {
    const ta = h('textarea', {
      class: 'mono', rows: def.rows || 8,
      placeholder: def.placeholder || '', spellcheck: 'false',
    });
    if (def.value != null) ta.value = def.value;
    if (staged && def === inputDefs[0]) ta.value = staged.value;
    inputEls[def.id] = ta;
    wrap.append(h('label', { class: 'io-label' }, def.label || '입력'), ta);
    ta.addEventListener('input', () => { if (cfg.autorun !== false) run(); });
  }

  const optEls = {};
  if (cfg.options?.length) {
    const row = h('div', { class: 'opt-row' });
    for (const o of cfg.options) {
      let el;
      if (o.type === 'select') {
        el = h('select', null, (o.values || []).map((v) => {
          const [val, label] = Array.isArray(v) ? v : [v, v];
          return h('option', { value: val, selected: val === o.value }, label);
        }));
      } else if (o.type === 'checkbox') {
        el = h('input', { type: 'checkbox' });
        el.checked = !!o.value;
      } else {
        el = h('input', { type: o.type || 'text', placeholder: o.placeholder || '' });
        if (o.value != null) el.value = o.value;
        if (o.size) el.style.width = o.size + 'px';
      }
      el.addEventListener(o.type === 'text' || o.type === 'password' || o.type === 'number' ? 'input' : 'change',
        () => { if (cfg.autorun !== false) run(); });
      optEls[o.id] = el;
      if (staged?.options?.[o.id] != null) {
        if (el.type === 'checkbox') el.checked = !!staged.options[o.id];
        else el.value = staged.options[o.id];
      }
      row.append(h('span', { class: 'opt-item' }, o.label ? h('label', null, o.label) : null, el));
    }
    wrap.append(row);
  }

  let lastAction = cfg.actions?.[0]?.id ?? null;
  const actionButtons = [];
  if (staged?.actionId && cfg.actions?.some((a) => a.id === staged.actionId)) lastAction = staged.actionId;
  if (cfg.actions?.length) {
    const row = h('div', { class: 'btn-row' });
    for (const a of cfg.actions) {
      const b = h('button', { class: 'btn' + (a.primary !== false && a === cfg.actions[0] ? ' primary' : ''), type: 'button' }, a.label);
      b.addEventListener('click', () => { lastAction = a.id; run(); });
      actionButtons.push(b);
      row.append(b);
    }
    wrap.append(row);
  }

  if (cfg.note) wrap.append(h('div', { class: 'note' }, cfg.note));

  const out = cfg.outputHTML
    ? h('div', { class: 'out-html' })
    : h('textarea', { class: 'mono out', rows: cfg.outputRows || 8, readonly: true, spellcheck: 'false' });
  const outHead = h('div', { class: 'out-head' },
    h('label', { class: 'io-label' }, cfg.outputLabel || '결과'),
    copyBtn(() => (cfg.outputHTML ? out.textContent : out.value)));
  const status = h('div', {
    class: 'io-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
  });
  wrap.append(status, h('div', { class: 'out-wrap' }, outHead, out));
  root.append(wrap);

  function getOpts() {
    const o = {};
    for (const [id, el] of Object.entries(optEls))
      o[id] = el.type === 'checkbox' ? el.checked : el.value;
    return o;
  }
  function setOut(res, isErr = false) {
    if (cfg.outputHTML) {
      out.innerHTML = '';
      out.classList.toggle('rendered', !isErr && res?.nodeType != null);
      if (isErr) out.append(h('span', { class: 'error' }, res));
      else if (res == null) out.textContent = '';
      else out.append(res.nodeType ? res : String(res));
    } else {
      out.value = isErr ? '⚠ ' + res : res == null ? '' : String(res);
      out.style.color = isErr ? 'var(--danger)' : '';
    }
  }

  let seq = 0, running = false, pending = false;
  function setRunning(value, message = '') {
    running = value;
    wrap.setAttribute('aria-busy', String(value));
    actionButtons.forEach((button) => { button.disabled = value; });
    status.classList.toggle('active', value || !!message);
    status.classList.toggle('error', !value && message.startsWith('처리 실패:'));
    status.textContent = value ? '처리 중…' : message;
  }
  async function run() {
    if (running) {
      pending = true;
      return;
    }
    const my = ++seq;
    const vals = {};
    for (const [id, el] of Object.entries(inputEls)) vals[id] = el.value;
    // 입력이 하나면 문자열을, 여러 개면 {id: 값} 객체를 process에 전달한다.
    const arg = cfg.inputs === null ? null : inputDefs.length === 1 ? vals[inputDefs[0].id] : vals;
    let isAsync = false;
    try {
      let res = cfg.process(arg, getOpts(), lastAction);
      if (res && typeof res.then === 'function') {
        isAsync = true;
        setRunning(true);
        res = await res;
      }
      if (my === seq && !pending) setOut(res);
      if (isAsync) setRunning(false, pending ? '' : '처리가 완료되었습니다.');
    } catch (e) {
      if (my === seq && !pending) setOut(e?.message || String(e), true);
      if (isAsync) setRunning(false, pending ? '' : '처리 실패: ' + (e?.message || String(e)));
    } finally {
      if (isAsync && pending) {
        pending = false;
        run();
      }
    }
  }

  if (cfg.runOnLoad || staged) run();
  return { run, inputEls, optEls, out, status, setOut, getOpts };
}
