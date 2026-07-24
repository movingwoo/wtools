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
  if (el.classList.contains('error') && !el.hasAttribute('role')) el.setAttribute('role', 'alert');
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : String(kid));
  }
  return el;
}

let fieldId = 0;
export function formLabel(control, text, attrs = {}) {
  if (!control.id) control.id = `wtools-field-${++fieldId}`;
  return h('label', { ...attrs, for: control.id }, text);
}

function legacyCopy(text) {
  if (!document.queryCommandSupported?.('copy') || !document.hasFocus()) return false;
  const input = h('textarea', {
    readonly: true,
    'aria-hidden': 'true',
    style: { position: 'fixed', left: '-9999px', top: '0' },
  });
  input.value = text;
  document.body.append(input);
  input.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* 지원되지 않는 대체 동작 */ }
  input.remove();
  return copied;
}

export async function copyText(value) {
  const text = String(typeof value === 'function' ? value() : value);
  if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      if (legacyCopy(text)) return;
      if (error?.name === 'NotAllowedError')
        throw new Error('클립보드 권한이 없어 복사하지 못했습니다. 브라우저의 사이트 권한을 확인하세요.');
      throw new Error('클립보드에 복사하지 못했습니다. 브라우저 설정을 확인하세요.');
    }
  }
  if (legacyCopy(text)) return;
  if (!globalThis.isSecureContext)
    throw new Error('보안 연결(HTTPS 또는 localhost)에서만 클립보드 복사를 사용할 수 있습니다.');
  throw new Error('이 브라우저는 클립보드 복사를 지원하지 않습니다.');
}

export function copyBtn(getText, label = '복사') {
  const b = h('button', { class: 'copy-mini', type: 'button' }, label);
  const announcement = h('span', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  b.addEventListener('click', async () => {
    try {
      await copyText(getText);
      b.textContent = '복사됨!';
      announcement.textContent = '클립보드에 복사했습니다.';
    } catch (error) {
      b.textContent = '복사 실패';
      b.title = error.message;
      announcement.textContent = error.message;
    }
    b.append(announcement);
    setTimeout(() => {
      b.textContent = label;
      b.removeAttribute('title');
      b.append(announcement);
    }, 2500);
  });
  b.append(announcement);
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
// lib: URL 문자열 또는 { url, integrity } (SRI 해시가 있으면 무결성 검증)
export function loadScript(lib) {
  const url = typeof lib === 'string' ? lib : lib.url;
  const integrity = typeof lib === 'string' ? null : lib.integrity;
  return (loaded[url] ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url;
    if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous'; }
    s.onload = () => res();
    s.onerror = () => {
      delete loaded[url];
      rej(new Error('외부 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인하세요.'));
    };
    document.head.append(s);
  }));
}
export function loadCss(lib) {
  const url = typeof lib === 'string' ? lib : lib.url;
  const integrity = typeof lib === 'string' ? null : lib.integrity;
  return (loaded[url] ??= new Promise((res, rej) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = url;
    if (integrity) { l.integrity = integrity; l.crossOrigin = 'anonymous'; }
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

// SRI(Subresource Integrity)로 CDN 손상·변조 시 로드를 차단한다. 버전을 올릴 때 해시도 함께 갱신해야 한다.
export const LIB = {
  jsrsasign: { url: 'https://cdn.jsdelivr.net/npm/jsrsasign@11.1.0/lib/jsrsasign-all-min.js', integrity: 'sha384-vbfVWK2rJ9x1Xsycv0IIV02oWFwkOZ5Ohb/cQGU2ldysPOlCR4OtdM1nvOZFbpzk' },
  marked: { url: 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js', integrity: 'sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi' },
  hljs: { url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js', integrity: 'sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp' },
  hljsCss: { url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark-dimmed.min.css', integrity: 'sha384-PiLidnnRuzFgp4qiN8oGNmktrV8ETL+6a8heAxljUX4A+3XWlocwaMn9duBUepfK' },
  qrcode: { url: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js', integrity: 'sha384-lQXOAyZwHXE55JFyrOMB7nY2Wv+m5ZWNtJcHrd1rceRQXAYNLak8ukN5TjBTcIwz' },
  uaparser: { url: 'https://cdn.jsdelivr.net/npm/ua-parser-js@1.0.38/dist/ua-parser.min.js', integrity: 'sha384-yT+3Fq5fjwzDR/suVYN+YMuGERziAMutX4NZ7W9Rz3mzuHipPpY7oe04Fd6wFJZB' },
  beautifyJs: { url: 'https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify.min.js', integrity: 'sha384-FVx1WK8VHSskkzcjxDxmZKSJ3KQ8vYOZo+sirXFdjOxUq4Y4+9IrtCG8iiisHHfj' },
  beautifyCss: { url: 'https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify-css.min.js', integrity: 'sha384-YkGkitXFTTE2YT+poOaBOfObka+86Q4ianXfq8SwPtTSW3SIFE4Ha5u33+xVK65+' },
  beautifyHtml: { url: 'https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify-html.min.js', integrity: 'sha384-j7zhOGXtPN67K2CFiNW3h/EvKRoW14dRbO8Pj4f2089y8m2RoxS2l627sobb19d3' },
  sqlFormatter: { url: 'https://cdn.jsdelivr.net/npm/sql-formatter@15.3.2/dist/sql-formatter.min.js', integrity: 'sha384-7mUXtMlypVs4NSv+ZCUHAniscLZNgJXAaaOQrdOuYqKA6LvRVSlgbYyiMX0xyHuz' },
  jsdiff: { url: 'https://cdn.jsdelivr.net/npm/diff@5.2.0/dist/diff.min.js', integrity: 'sha384-lJJVaUgxmk/PVfQnAsGN1QuJZrE+n6bg2EMu33yVZOJ2av/3UzTHbmnPCI7ENJYa' },
  figlet: { url: 'https://cdn.jsdelivr.net/npm/figlet@1.7.0/lib/figlet.js', integrity: 'sha384-pX+W+tDvxyLP633VSCBwPlKIlXhOLmq+yYw7Vm2bo/NYS9bp8bzjV50qUlXVC1Qp' },
  pako: { url: 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', integrity: 'sha384-rNlaE5fs9dGIjmxWDALQh/RBAaGRYT5ChrzHo6tRfgrZ36iRFAiquP5g41Jsv+0j' },
  fflate: { url: 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js', integrity: 'sha384-DT0Ls0mO7JmjTnT+oBuMhEJzYJO1zUqzuuMXNdnOmOQRIpN2BgSjvBV/j50NngIT' },
  lzma: { url: 'https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma_worker.min.js', integrity: 'sha384-i0BmxJgY8ewnjHQFgeqUwAtroLPzl8tRN6M8tMYoR8fZPzUogiI6Uo8bUbzxKa9t' },
  md4: { url: 'https://cdn.jsdelivr.net/npm/js-md4@0.3.2/build/md4.min.js', integrity: 'sha384-MoZ9k3YaW/GZNhasK9XhYqny3gz3Ht9G2Hy3VLx4oEJMq2WZAivb7Tu2yqIpQ9mR' },
  jsqr: { url: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js', integrity: 'sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx' },
  jsonpath: { url: 'https://unpkg.com/jsonpath-plus@10.3.0/dist/index-browser-umd.min.cjs', integrity: 'sha384-hGQPqOxTPM4foQNgrQgUmEiH4XmDBHG/JM6hBfraI4LJ9LA9V/tDGADiGRXeC9/c' },
  jmespath: { url: 'https://cdn.jsdelivr.net/npm/jmespath@0.16.0/jmespath.min.js', integrity: 'sha384-gWcKrbXrrv/Qu9WrcJK8aDvaUwv8LMxpzdBtpRCNn3eoq7D6uOySOdo2YFvhaYrx' },
  ajv: { url: 'https://cdn.jsdelivr.net/npm/ajv@6.12.6/dist/ajv.bundle.js', integrity: 'sha384-FhxE5wb1R5PH1FNHJnhnZA5Th28cz8eOE7DjUCzNuwImYzw3t4Zl1wiWJhbuf+De' },
  bcrypt: { url: 'https://cdn.jsdelivr.net/npm/bcryptjs@2.4.3/dist/bcrypt.min.js', integrity: 'sha384-qGFE4FIJLgCFuYs3nzg39XpCtvT5AZUhaBdjB3e1+vpKQa03AkyWOyBSFb9OcQ/g' },
};

/* ---------- 공통 도구 UI 빌더 ----------
cfg = {
  inputs: [{id,label,rows,placeholder,value}]  // 생략 시 [{id:'input'}], null이면 입력 없음
  options: [{id,label,type:'select'|'text'|'password'|'number'|'checkbox',values,value,placeholder,size}]
  actions: [{id,label,primary}]                // 생략 시 자동 실행만
  process: (input|{inputs}, opts, actionId, signal) => string|Node|Promise
  outputHTML: bool, outputRows, autorun (기본 true), runOnLoad (기본 false), note,
  cancelable: bool, retryable: bool, largeInputThreshold (기본 1,000,000자, false면 경고 안 함)
}
------------------------------------------------ */
export function makeIO(root, cfg) {
  const largeInputThreshold = cfg.largeInputThreshold === false ? Infinity : (cfg.largeInputThreshold || 1_000_000);
  const wrap = h('div', { class: 'io', 'aria-busy': 'false' });
  const inputDefs = cfg.inputs === null ? [] : (cfg.inputs || [{ id: 'input', label: '입력' }]);
  const inputEls = {};
  const staged = inputDefs.length ? takeToolInput() : null;

  for (const def of inputDefs) {
    const ta = h('textarea', {
      id: `wtools-${def.id}-${++fieldId}`,
      class: 'mono', rows: def.rows || 8,
      placeholder: def.placeholder || '', spellcheck: 'false',
    });
    if (def.value != null) ta.value = def.value;
    if (staged && def === inputDefs[0]) ta.value = staged.value;
    inputEls[def.id] = ta;
    wrap.append(formLabel(ta, def.label || '입력', { class: 'io-label' }), ta);
    ta.addEventListener('input', () => {
      largeInputApproved = false;
      largeInputWarning.classList.add('hidden');
      if (cfg.autorun !== false) run();
    });
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
      el.id = `wtools-${o.id}-${++fieldId}`;
      el.addEventListener(o.type === 'text' || o.type === 'password' || o.type === 'number' ? 'input' : 'change',
        () => { if (cfg.autorun !== false) run(); });
      optEls[o.id] = el;
      if (staged?.options?.[o.id] != null) {
        if (el.type === 'checkbox') el.checked = !!staged.options[o.id];
        else el.value = staged.options[o.id];
      }
      row.append(h('span', { class: 'opt-item' }, o.label ? formLabel(el, o.label) : null, el));
    }
    wrap.append(row);
  }

  let lastAction = cfg.actions?.[0]?.id ?? null;
  const actionButtons = [];
  let cancelButton = null;
  if (staged?.actionId && cfg.actions?.some((a) => a.id === staged.actionId)) lastAction = staged.actionId;
  if (cfg.actions?.length || cfg.cancelable) {
    const row = h('div', { class: 'btn-row' });
    for (const a of cfg.actions || []) {
      const b = h('button', { class: 'btn' + (a.primary !== false && a === cfg.actions[0] ? ' primary' : ''), type: 'button' }, a.label);
      b.addEventListener('click', () => { lastAction = a.id; run(); });
      actionButtons.push(b);
      row.append(b);
    }
    if (cfg.cancelable) {
      cancelButton = h('button', { class: 'btn hidden', type: 'button' }, '취소');
      cancelButton.addEventListener('click', () => cancel());
      row.append(cancelButton);
    }
    wrap.append(row);
  }

  if (cfg.note) wrap.append(h('div', { class: 'note' }, cfg.note));
  const largeInputWarning = h('div', { class: 'note large-input-warning hidden', role: 'alert' },
    h('span', null, '입력이 매우 커서 브라우저가 잠시 응답하지 않을 수 있습니다.'),
    h('button', { class: 'btn small', type: 'button', onclick: () => run(true) }, '그래도 처리'));
  wrap.append(largeInputWarning);

  const out = cfg.outputHTML
    ? h('div', { class: 'out-html' })
    : h('textarea', { class: 'mono out', rows: cfg.outputRows || 8, readonly: true, spellcheck: 'false' });
  const outLabel = cfg.outputHTML
    ? h('span', { class: 'io-label', id: `wtools-output-label-${++fieldId}` }, cfg.outputLabel || '결과')
    : formLabel(out, cfg.outputLabel || '결과', { class: 'io-label' });
  if (cfg.outputHTML) {
    out.setAttribute('role', 'region');
    out.setAttribute('aria-labelledby', outLabel.id);
  }
  const outHead = h('div', { class: 'out-head' },
    outLabel,
    copyBtn(() => (cfg.outputHTML ? out.textContent : out.value)));
  const status = h('div', {
    class: 'io-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
  });
  const retryButton = h('button', { class: 'btn small hidden', type: 'button' }, '다시 시도');
  retryButton.addEventListener('click', () => run());
  wrap.append(status, h('div', { class: 'out-wrap' }, outHead, out));
  status.after(retryButton);
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

  let seq = 0, running = false, pending = false, controller = null, largeInputApproved = false;
  function setRunning(value, message = '') {
    running = value;
    wrap.setAttribute('aria-busy', String(value));
    actionButtons.forEach((button) => { button.disabled = value; });
    if (cancelButton) {
      cancelButton.classList.toggle('hidden', !value);
      cancelButton.disabled = !value;
    }
    status.classList.toggle('active', value || !!message);
    status.classList.toggle('error', !value && message.startsWith('처리 실패:'));
    status.textContent = value ? '처리 중…' : message;
    retryButton.classList.toggle('hidden', value || !cfg.retryable || !message.startsWith('처리 실패:'));
  }
  function inputLength() {
    return Object.values(inputEls).reduce((sum, el) => sum + el.value.length, 0);
  }
  function cancel() {
    if (!controller) return;
    pending = false;
    cancelButton.disabled = true;
    status.textContent = '취소 중…';
    controller.abort();
  }
  async function run(approveLargeInput = false) {
    if (running) {
      pending = true;
      return;
    }
    if (approveLargeInput) largeInputApproved = true;
    if (inputLength() > largeInputThreshold && !largeInputApproved) {
      largeInputWarning.classList.remove('hidden');
      return;
    }
    largeInputWarning.classList.add('hidden');
    setRunning(false);
    const my = ++seq;
    const vals = {};
    for (const [id, el] of Object.entries(inputEls)) vals[id] = el.value;
    // 입력이 하나면 문자열을, 여러 개면 {id: 값} 객체를 process에 전달한다.
    const arg = cfg.inputs === null ? null : inputDefs.length === 1 ? vals[inputDefs[0].id] : vals;
    let isAsync = false;
    controller = cfg.cancelable ? new AbortController() : null;
    try {
      let res = cfg.process(arg, getOpts(), lastAction, controller?.signal);
      if (res && typeof res.then === 'function') {
        isAsync = true;
        setRunning(true);
        res = await res;
      }
      if (my === seq && !pending) setOut(res);
      if (isAsync) setRunning(false, pending ? '' : '처리가 완료되었습니다.');
    } catch (e) {
      const aborted = e?.name === 'AbortError';
      if (my === seq && !pending) setOut(aborted ? '작업이 취소되었습니다.' : e?.message || String(e), !aborted);
      setRunning(false, pending ? '' : aborted ? '작업이 취소되었습니다.' : '처리 실패: ' + (e?.message || String(e)));
    } finally {
      controller = null;
      if (isAsync && pending) {
        pending = false;
        run();
      }
    }
  }

  if (cfg.runOnLoad || staged) run();
  return { run, cancel, inputEls, optEls, out, status, setOut, getOpts };
}
