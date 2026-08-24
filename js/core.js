// core.js — 도구 등록 프레임워크 + 공통 유틸리티
import './dependencies.js';

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
export function registerToolManifests(manifests) {
  for (const manifest of manifests) {
    if (tools.some((item) => item.id === manifest.id)) throw new Error(`중복된 도구 ID입니다: ${manifest.id}`);
    tools.push({ ...manifest });
  }
}

// 지연 로드된 구현은 먼저 등록된 검색/홈 메타데이터를 같은 객체에서 갱신한다.
// 객체 정체성을 유지해야 이미 만들어 둔 사이드바와 즐겨찾기 참조도 최신 render를 본다.
export function tool(def) {
  const existing = tools.find((item) => item.id === def.id);
  if (existing) Object.assign(existing, def);
  else tools.push(def);
}

const cleanupByRoot = new WeakMap();
export function addToolCleanup(root, cleanup) {
  if (typeof cleanup !== 'function') return cleanup;
  const list = cleanupByRoot.get(root) || [];
  list.push(cleanup);
  cleanupByRoot.set(root, list);
  return cleanup;
}

export function cleanupToolRoot(root) {
  for (const node of [root, ...root.querySelectorAll('*')]) {
    const list = cleanupByRoot.get(node) || [];
    cleanupByRoot.delete(node);
    for (const cleanup of list.reverse()) cleanup();
  }
}

let pendingToolInput = null;
export function stageToolInput(toolId, value, setup = {}) {
  pendingToolInput = { toolId, value, ...setup };
}

function takeToolInput(inputIds) {
  const id = location.hash.match(/^#\/tool\/([\w-]+)/)?.[1];
  if (!pendingToolInput || pendingToolInput.toolId !== id) return null;
  if (pendingToolInput.inputId && !inputIds.includes(pendingToolInput.inputId)) return null;
  const pending = pendingToolInput;
  pendingToolInput = null;
  return pending;
}

function transferTargets(sourceId, outputId) {
  const output = tools.find((item) => item.id === sourceId)?.transfer?.outputs
    ?.find((item) => item.id === outputId);
  if (!output) return [];
  const targetIds = output.targets?.length
    ? output.targets
    : tools.map((item) => item.id);
  return targetIds.flatMap((targetId) => {
    const target = tools.find((item) => item.id === targetId);
    if (!target) return [];
    const inputs = (target.transfer?.inputs || []).filter((input) => input.accepts?.includes(output.type));
    return inputs.length ? [{ target, inputs, type: output.type }] : [];
  });
}

const TRANSFER_TYPES = Object.freeze({
  text: { label: '텍스트', validate: (value) => String(value).length > 0 },
  base64: { label: 'Base64', validate: (value) => /^(?:[A-Za-z0-9+/_-]{2,}={0,2})$/.test(String(value).replace(/\s/g, '')) },
  hex: { label: 'Hex', validate: (value) => /^(?:[0-9a-f]{2})+$/i.test(String(value).replace(/[\s:,-]|0x/gi, '')) },
  hash: { label: '해시', validate: (value) => /^(?:[0-9a-f]{8,}|\$[^\s]+|\{SSHA\}[^\s]+)$/i.test(String(value).trim()) },
  checksum: { label: '체크섬 목록', validate: (value) => String(value).trim().length > 0 },
  json: { label: 'JSON', validate(value) { try { JSON.parse(String(value)); return true; } catch { return false; } } },
  ndjson: { label: 'NDJSON', validate(value) {
    const lines = String(value).split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return false;
    try { lines.forEach((line) => JSON.parse(line)); return true; } catch { return false; }
  } },
  yaml: { label: 'YAML', validate: (value) => String(value).trim().length > 0 },
  xml: { label: 'XML', validate: (value) => /^\s*</.test(String(value)) },
  csv: { label: 'CSV', validate: (value) => String(value).includes(',') || String(value).includes('\t') },
  toml: { label: 'TOML', validate: (value) => String(value).trim().length > 0 },
  env: { label: 'ENV', validate: (value) => /^\s*(?:export\s+)?[A-Za-z_][\w]*\s*=/m.test(String(value)) },
  url: { label: 'URL/URI', validate(value) { try { return !!new URL(String(value).trim()); } catch { return false; } } },
  pem: { label: 'PEM', validate: (value) => /-----BEGIN [A-Z0-9 ]+-----[\s\S]+-----END [A-Z0-9 ]+-----/.test(String(value)), sensitive: true },
  jwk: { label: 'JWK', validate(value) { try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed.kty === 'string'; } catch { return false; } }, sensitive: true },
  asn1: { label: 'ASN.1', validate: (value) => /^(?:[0-9a-f]{2})+$/i.test(String(value).replace(/\s/g, '')) },
  'data-uri': { label: 'Data URI', validate: (value) => /^data:[^,]+,/i.test(String(value)) },
});

function transferType(type) {
  return TRANSFER_TYPES[type] || TRANSFER_TYPES.text;
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
let fileDropId = 0;
export function formLabel(control, text, attrs = {}) {
  if (!control.id) control.id = `wtools-field-${++fieldId}`;
  return h('label', { ...attrs, for: control.id }, text);
}

function fileMatchesAccept(file, accept) {
  const rules = accept.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((rule) => rule.startsWith('.') ? name.endsWith(rule)
    : rule.endsWith('/*') ? type.startsWith(rule.slice(0, -1))
      : type === rule);
}

function clipboardFileName(type, index) {
  const extensions = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    'text/plain': 'txt', 'application/json': 'json', 'application/pdf': 'pdf',
  };
  return `클립보드-${index + 1}.${extensions[type] || 'bin'}`;
}

export const FILE_BUDGET = Object.freeze({
  warnFileBytes: 32 * 1024 * 1024,
  warnTotalBytes: 64 * 1024 * 1024,
  warnCount: 20,
  maxFileBytes: 256 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxCount: 200,
});

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes.toLocaleString()} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes / 1024, unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i++) { value /= 1024; unit = units[i]; }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function numericBudget(input, key, fallback) {
  const value = Number(input.dataset[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function assessFileBudget(files, overrides = {}) {
  const list = [...files];
  const budget = { ...FILE_BUDGET, ...overrides };
  const total = list.reduce((sum, file) => sum + file.size, 0);
  const largest = list.reduce((max, file) => Math.max(max, file.size), 0);
  const hard = [];
  const warnings = [];
  if (list.length > budget.maxCount) hard.push(`파일 개수 ${list.length}개가 최대 ${budget.maxCount}개를 넘습니다.`);
  if (largest > budget.maxFileBytes) hard.push(`단일 파일이 최대 ${formatBytes(budget.maxFileBytes)}를 넘습니다.`);
  if (total > budget.maxTotalBytes) hard.push(`파일 총합 ${formatBytes(total)}이 최대 ${formatBytes(budget.maxTotalBytes)}를 넘습니다.`);
  if (!hard.length) {
    if (list.length > budget.warnCount) warnings.push(`파일 ${list.length}개`);
    if (largest > budget.warnFileBytes) warnings.push(`단일 파일 최대 ${formatBytes(largest)}`);
    if (total > budget.warnTotalBytes) warnings.push(`총합 ${formatBytes(total)}`);
  }
  return { files: list, total, largest, hard, warnings, budget };
}

function inputFileBudget(input) {
  return {
    warnFileBytes: numericBudget(input, 'fileWarnFile', FILE_BUDGET.warnFileBytes),
    warnTotalBytes: numericBudget(input, 'fileWarnTotal', FILE_BUDGET.warnTotalBytes),
    warnCount: numericBudget(input, 'fileWarnCount', FILE_BUDGET.warnCount),
    maxFileBytes: numericBudget(input, 'fileMaxFile', FILE_BUDGET.maxFileBytes),
    maxTotalBytes: numericBudget(input, 'fileMaxTotal', FILE_BUDGET.maxTotalBytes),
    maxCount: numericBudget(input, 'fileMaxCount', FILE_BUDGET.maxCount),
  };
}

function fileSelectionSignature(files) {
  return [...files].map((file) => `${file.name}:${file.size}:${file.lastModified}`).join('|');
}

// 도구가 만든 파일 input을 공통 드롭·클립보드 UI로 보강한다.
export function enhanceFileInputs(root) {
  let fileInputIndex = 0;
  for (const input of root.querySelectorAll('input[type="file"]:not([data-file-enhanced])')) {
    input.dataset.fileEnhanced = 'true';
    const inputLabel = input.getAttribute('aria-label')?.trim()
      || [...(input.labels || [])].map((label) => label.textContent.trim()).filter(Boolean).join(' ')
      || (input.multiple ? '여러 파일 선택' : '파일 선택');
    input.hidden = true;
    const status = h('span', { class: 'file-drop-status', 'aria-live': 'polite' });
    const browse = h('button', { class: 'btn small', type: 'button' }, '파일 찾아보기');
    const paste = h('button', { class: 'btn small', type: 'button' }, '클립보드 파일 붙여넣기');
    const budgetApprove = h('button', { class: 'btn small hidden', type: 'button' }, '그래도 처리');
    const description = h('span', { class: 'sr-only', id: `wtools-file-drop-description-${++fileDropId}` }, `${inputLabel} 입력`);
    const zone = h('div', {
      class: 'file-drop-zone', role: 'group', tabindex: 0,
      'aria-label': `파일 끌어놓기 및 클립보드 붙여넣기 영역 ${++fileInputIndex}`,
      'aria-describedby': description.id,
    },
    description,
    h('span', { class: 'file-drop-instruction' }, input.multiple
      ? '파일을 여기에 끌어놓거나 이 영역에서 Ctrl/Cmd+V로 붙여넣으세요. 여러 파일을 받을 수 있습니다.'
      : '파일을 여기에 끌어놓거나 이 영역에서 Ctrl/Cmd+V로 붙여넣으세요.'),
    h('span', { class: 'file-drop-actions' }, browse, paste),
    budgetApprove,
    status,
    h('span', { class: 'file-drop-privacy' }, '파일 내용은 브라우저 밖으로 전송되지 않습니다.'),
    input.dataset.fileBudgetNote
      ? h('span', { class: 'file-drop-budget-note' }, `이 도구의 예산 예외: ${input.dataset.fileBudgetNote}`)
      : null);

    let approvedSignature = '';
    let pendingSignature = '';

    const announce = (message, error = false) => {
      if (!zone.isConnected) return;
      status.textContent = message;
      status.classList.toggle('error', error);
    };
    const enforceBudget = (event) => {
      const files = [...(input.files || [])];
      if (!files.length) return;
      const signature = fileSelectionSignature(files);
      const assessment = assessFileBudget(files, inputFileBudget(input));
      if (assessment.hard.length) {
        event.stopImmediatePropagation();
        input.value = '';
        budgetApprove.classList.add('hidden');
        announce(`안전 한도를 초과해 처리하지 않았습니다. ${assessment.hard.join(' ')}`, true);
        return;
      }
      if (assessment.warnings.length && signature !== approvedSignature) {
        event.stopImmediatePropagation();
        pendingSignature = signature;
        budgetApprove.classList.remove('hidden');
        announce(`큰 파일 작업입니다(${assessment.warnings.join(', ')}). 메모리 사용량을 확인한 뒤 계속할 수 있습니다.`, true);
        return;
      }
      budgetApprove.classList.add('hidden');
      pendingSignature = '';
    };
    input.addEventListener('change', enforceBudget, true);
    budgetApprove.addEventListener('click', () => {
      if (!pendingSignature || !input.files?.length) return;
      approvedSignature = pendingSignature;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const selectFiles = (files, source) => {
      if (!zone.isConnected) return;
      if (input.disabled) { announce('현재 파일을 처리 중입니다. 완료된 뒤 다시 시도하세요.', true); return; }
      const candidates = [...files].filter(Boolean);
      const accepted = candidates.filter((file) => fileMatchesAccept(file, input.accept));
      const rejected = candidates.filter((file) => !fileMatchesAccept(file, input.accept));
      if (!accepted.length) {
        announce(rejected.length ? '이 입력에서 지원하지 않는 파일 형식입니다.' : `${source}에서 파일을 찾지 못했습니다.`, true);
        return;
      }
      const selected = input.multiple ? accepted : accepted.slice(0, 1);
      try {
        const transfer = new DataTransfer();
        selected.forEach((file) => transfer.items.add(file));
        input.files = transfer.files;
      } catch {
        announce('이 브라우저에서는 끌어놓기 파일을 입력에 연결할 수 없습니다. 파일 선택을 이용하세요.', true);
        return;
      }
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (!input.files?.length || pendingSignature) return;
      const suffix = rejected.length ? `, 지원하지 않는 형식 ${rejected.length}개 제외` : '';
      announce(`${source}에서 ${selected.length}개 파일을 가져왔습니다${suffix}.`);
    };

    browse.addEventListener('click', () => input.click());
    paste.addEventListener('click', async () => {
      if (!globalThis.isSecureContext || !navigator.clipboard?.read) {
        announce('클립보드 파일 읽기는 HTTPS 또는 localhost의 지원 브라우저에서만 사용할 수 있습니다.', true);
        zone.focus();
        return;
      }
      try {
        const files = [];
        for (const item of await navigator.clipboard.read()) {
          for (const type of item.types) {
            const blob = await item.getType(type);
            files.push(blob instanceof File ? blob : new File([blob], clipboardFileName(type, files.length), { type }));
          }
        }
        selectFiles(files, '클립보드');
      } catch (error) {
        announce(error?.name === 'NotAllowedError'
          ? '클립보드 읽기 권한이 거부되었습니다. 브라우저 권한을 확인하거나 파일 선택을 이용하세요.'
          : '클립보드에서 파일을 읽지 못했습니다. 파일 선택을 이용하세요.', true);
      }
    });
    zone.addEventListener('paste', (event) => {
      const files = event.clipboardData?.files?.length
        ? [...event.clipboardData.files]
        : [...(event.clipboardData?.items || [])].map((item) => item.kind === 'file' ? item.getAsFile() : null).filter(Boolean);
      if (!files.length) { announce('클립보드에 파일이 없습니다.', true); return; }
      event.preventDefault();
      selectFiles(files, '클립보드');
    });
    zone.addEventListener('dragenter', (event) => {
      if ([...(event.dataTransfer?.types || [])].includes('Files')) {
        event.preventDefault();
        zone.classList.add('dragging');
      }
    });
    zone.addEventListener('dragover', (event) => {
      if ([...(event.dataTransfer?.types || [])].includes('Files')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
    });
    zone.addEventListener('dragleave', (event) => {
      if (!zone.contains(event.relatedTarget)) zone.classList.remove('dragging');
    });
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('dragging');
      selectFiles(event.dataTransfer?.files || [], '끌어놓기');
    });
    input.addEventListener('change', () => {
      if (input.files?.length) announce(`선택한 파일: ${[...input.files].map((file) => file.name).join(', ')}`);
    });
    input.insertAdjacentElement('afterend', zone);
  }
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
export function concatBytes(...parts) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
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

export function abortError() {
  return new DOMException('작업이 취소되었습니다.', 'AbortError');
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

export async function readFileChunks(file, { signal, chunkSize = 2 * 1024 * 1024, onChunk, onProgress } = {}) {
  if (typeof file?.slice !== 'function') throw new Error('파일을 읽을 수 없습니다.');
  let offset = 0;
  while (offset < file.size) {
    throwIfAborted(signal);
    const end = Math.min(file.size, offset + chunkSize);
    const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    throwIfAborted(signal);
    await onChunk?.(bytes, offset, file.size);
    offset = end;
    onProgress?.(file.size ? offset / file.size : 1);
  }
  if (!file.size) onProgress?.(1);
}

export function requireFeature(feature, available, fallback) {
  if (available) return;
  const defaults = {
    webcrypto: '이 브라우저는 이 도구에 필요한 WebCrypto를 지원하지 않습니다. 지원 브라우저를 최신 버전으로 업데이트하세요.',
    worker: '이 브라우저는 대용량 작업에 필요한 Web Worker를 지원하지 않습니다.',
    canvas: '이 브라우저는 이미지 처리에 필요한 Canvas 기능을 지원하지 않습니다.',
    imagebitmap: '이 브라우저는 이미지 디코딩에 필요한 ImageBitmap 기능을 지원하지 않습니다.',
    wasm: '이 브라우저는 이 알고리즘에 필요한 WebAssembly를 지원하지 않습니다.',
    clipboard: '이 브라우저 또는 현재 연결에서는 클립보드 기능을 사용할 수 없습니다.',
    camera: '이 브라우저 또는 현재 연결에서는 카메라 기능을 사용할 수 없습니다.',
  };
  throw new Error(fallback || defaults[feature] || '이 브라우저에서 필요한 기능을 지원하지 않습니다.');
}

// makeIO 밖의 파일·키·아카이브 작업에 동일한 실행 상태와 취소/재시도를 제공한다.
export function createAsyncRunner(root, cfg = {}) {
  const status = cfg.status || h('div', {
    class: 'io-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
  });
  const errorOut = cfg.errorOut || h('div', { class: 'async-error' });
  const cancelButton = h('button', { class: 'btn small hidden', type: 'button' }, '취소');
  const retryButton = h('button', { class: 'btn small hidden', type: 'button' }, '다시 시도');
  const actions = h('div', { class: 'async-runner-actions' }, cancelButton, retryButton);
  if (!cfg.status) root.append(status);
  if (!cfg.errorOut) root.append(errorOut);
  root.append(actions);

  let running = false;
  let controller = null;
  let lastTask = null;
  let sequence = 0;
  let disposed = false;
  const controls = () => (typeof cfg.controls === 'function' ? cfg.controls() : cfg.controls || []).filter(Boolean);

  function message(text, error = false) {
    if (disposed || !root.isConnected) return;
    status.className = `io-status${text ? ' active' : ''}${error ? ' error' : ''}`;
    status.textContent = text;
  }

  function setRunning(value) {
    running = value;
    if (!root.isConnected) return;
    root.setAttribute('aria-busy', String(value));
    for (const control of controls()) control.disabled = value;
    cancelButton.classList.toggle('hidden', !value || cfg.cancelable === false);
    cancelButton.disabled = !value;
    retryButton.classList.add('hidden');
  }

  function cancel() {
    if (!controller || controller.signal.aborted) return;
    message('취소 중…');
    cancelButton.disabled = true;
    controller.abort();
  }

  async function run(task = lastTask) {
    if (!task || disposed) return false;
    if (running) {
      message('이미 작업을 처리 중입니다. 완료하거나 취소한 뒤 다시 시도하세요.', true);
      return false;
    }
    lastTask = task;
    const my = ++sequence;
    controller = new AbortController();
    errorOut.replaceChildren();
    setRunning(true);
    message(cfg.runningMessage || '처리 중…');
    const context = {
      signal: controller.signal,
      progress(text) { message(text || '처리 중…'); },
      active() { return !disposed && my === sequence && root.isConnected && !controller.signal.aborted; },
      download(name, data, type) {
        if (!this.active()) return false;
        download(name, data, type);
        return true;
      },
    };
    try {
      const result = await task(context);
      if (!context.active()) return false;
      cfg.onSuccess?.(result, context);
      message(cfg.successMessage || '처리가 완료되었습니다.');
      return true;
    } catch (error) {
      const aborted = error?.name === 'AbortError' || controller.signal.aborted;
      if (!disposed && my === sequence && root.isConnected) {
        const detail = aborted ? '작업이 취소되었습니다.' : error?.message || String(error);
        errorOut.replaceChildren(h('span', { class: aborted ? 'note' : 'error' }, detail));
        message(aborted ? detail : `처리 실패: ${detail}`, !aborted);
        retryButton.classList.toggle('hidden', aborted || cfg.retryable === false);
        cfg.onError?.(error, context);
      }
      return false;
    } finally {
      if (my === sequence) {
        controller = null;
        setRunning(false);
      }
    }
  }

  cancelButton.addEventListener('click', cancel);
  retryButton.addEventListener('click', () => run());
  const cleanup = () => {
    disposed = true;
    sequence++;
    controller?.abort();
    controller = null;
  };
  addToolCleanup(root, cleanup);
  return { run, cancel, cleanup, status, errorOut, cancelButton, retryButton, get running() { return running; } };
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
  const resolved = new URL(url, import.meta.url);
  if (resolved.origin !== location.origin) {
    return Promise.reject(new Error('검증되지 않은 외부 모듈은 실행할 수 없습니다.'));
  }
  return (loadedModules[resolved.href] ??= import(resolved.href).catch(() => {
    delete loadedModules[resolved.href];
    throw new Error('외부 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인하세요.');
  }));
}

const dependencies = globalThis.WTOOLS_DEPENDENCIES;
if (!dependencies) throw new Error('제3자 라이브러리 등록부를 불러오지 못했습니다.');

// SRI로 CDN 응답을 검증한다. 메타데이터는 서비스 워커와 같은 등록부를 사용한다.
export const LIB = Object.fromEntries(Object.entries(dependencies.cdn)
  .map(([id, { url, integrity }]) => [id, { url, integrity }]));

// 동적 ESM/WASM은 검토한 로컬 사본만 사용하며 정적 검사에서 SHA-384를 대조한다.
export function vendorUrl(id) {
  const entry = dependencies.vendored[id];
  if (!entry) throw new Error(`등록되지 않은 제3자 모듈입니다: ${id}`);
  return new URL('../' + entry.path, import.meta.url).href;
}

/* ---------- 공통 도구 UI 빌더 ----------
cfg = {
  inputs: [{id,label,rows,placeholder,value}]  // 생략 시 [{id:'input'}], null이면 입력 없음
  options: [{id,label,type:'select'|'text'|'password'|'number'|'checkbox',values,value,placeholder,size}]
  actions: [{id,label,primary}]                // 생략 시 자동 실행만
  process: (input|{inputs}, opts, actionId, signal) => string|Node|Promise
  outputHTML: bool, outputRows, autorun (기본 true), runOnLoad (기본 false), note,
  transferOutput: {id, when?: ({result,input,opts,actionId}) => bool,
                   value?: ({result,input,opts,actionId}) => string},
  cancelable: bool, retryable: bool, largeInputThreshold (기본 1,000,000자, false면 경고 안 함)
}
------------------------------------------------ */
export function makeIO(root, cfg) {
  const largeInputThreshold = cfg.largeInputThreshold === false ? Infinity : (cfg.largeInputThreshold || 1_000_000);
  const wrap = h('div', { class: 'io', 'aria-busy': 'false' });
  const inputDefs = cfg.inputs === null ? [] : (cfg.inputs || [{ id: 'input', label: '입력' }]);
  const inputEls = {};
  const staged = inputDefs.length ? takeToolInput(inputDefs.map((def) => def.id)) : null;

  for (const def of inputDefs) {
    const ta = h('textarea', {
      id: `wtools-${def.id}-${++fieldId}`,
      class: 'mono', rows: def.rows || 8,
      placeholder: def.placeholder || '', spellcheck: 'false',
    });
    if (def.value != null) ta.value = def.value;
    if (staged && def.id === (staged.inputId || inputDefs[0].id)) ta.value = staged.value;
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
  const sourceId = location.hash.match(/^#\/tool\/([\w-]+)/)?.[1];
  const transferConfig = typeof cfg.transferOutput === 'string'
    ? { id: cfg.transferOutput }
    : cfg.transferOutput;
  const transferButton = h('button', {
    class: 'copy-mini hidden', type: 'button', 'aria-expanded': 'false',
  }, '다른 도구로 보내기');
  const outActions = h('div', { class: 'out-actions' },
    copyBtn(() => (cfg.outputHTML ? out.textContent : out.value)), transferButton);
  const outHead = h('div', { class: 'out-head' },
    outLabel,
    outActions);
  const transferTarget = h('select', { 'aria-label': '전달할 도구' });
  const transferInput = h('select', { 'aria-label': '전달할 입력 칸' });
  const transferGo = h('button', { class: 'btn small', type: 'button' }, '보내기');
  const transferLabel = h('span', { class: 'io-label', id: `wtools-transfer-label-${++fieldId}` }, '결과 전달');
  const transferConsent = h('input', { type: 'checkbox' });
  const transferConsentWrap = h('span', { class: 'transfer-sensitive hidden' },
    formLabel(transferConsent, '개인키·시크릿일 수 있는 민감한 값을 한 번 전달하는 데 동의합니다.'), transferConsent);
  const transferError = h('span', { class: 'transfer-error', role: 'alert' });
  const transferPanel = h('div', {
    class: 'transfer-panel hidden', role: 'group', 'aria-labelledby': transferLabel.id,
  },
    transferLabel, transferTarget, transferInput, transferConsentWrap, transferGo, transferError,
    h('span', { class: 'transfer-privacy' }, '값은 현재 탭의 메모리에서 한 번만 전달됩니다.'));
  const status = h('div', {
    class: 'io-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
  });
  const retryButton = h('button', { class: 'btn small hidden', type: 'button' }, '다시 시도');
  retryButton.addEventListener('click', () => run());
  wrap.append(status, h('div', { class: 'out-wrap' }, outHead, transferPanel, out));
  status.after(retryButton);
  root.append(wrap);

  function getOpts() {
    const o = {};
    for (const [id, el] of Object.entries(optEls))
      o[id] = el.type === 'checkbox' ? el.checked : el.value;
    return o;
  }
  let transferContext = null;
  let compatibleTargets = [];
  function updateTransferInputs() {
    const selected = compatibleTargets.find((item) => item.target.id === transferTarget.value);
    transferInput.innerHTML = '';
    for (const input of selected?.inputs || [])
      transferInput.append(h('option', { value: input.id }, input.label));
    transferInput.classList.toggle('hidden', (selected?.inputs.length || 0) < 2);
    const sensitive = !!transferType(selected?.type).sensitive;
    transferConsentWrap.classList.toggle('hidden', !sensitive);
    transferConsent.checked = false;
    transferError.textContent = '';
  }
  transferTarget.addEventListener('change', updateTransferInputs);
  transferButton.addEventListener('click', () => {
    const open = transferPanel.classList.toggle('hidden');
    transferButton.setAttribute('aria-expanded', String(!open));
    if (!open) transferTarget.focus();
  });
  transferGo.addEventListener('click', () => {
    if (!transferContext) return;
    const selected = compatibleTargets.find((item) => item.target.id === transferTarget.value);
    const input = selected?.inputs.find((item) => item.id === transferInput.value) || selected?.inputs[0];
    if (!selected || !input) return;
    const value = transferConfig.value
      ? transferConfig.value(transferContext)
      : cfg.outputHTML ? out.textContent : out.value;
    const type = transferType(selected.type);
    if (!type.validate(value)) {
      transferError.textContent = `${type.label} 형식으로 검증되지 않아 전달하지 않았습니다.`;
      return;
    }
    if (type.sensitive && !transferConsent.checked) {
      transferError.textContent = '민감한 값 전달 동의를 먼저 선택하세요.';
      transferConsent.focus();
      return;
    }
    transferError.textContent = '';
    const setup = input.optionsByType?.[selected.type] || {};
    stageToolInput(selected.target.id, String(value), { ...setup, inputId: input.id });
    const hash = '#/tool/' + selected.target.id;
    if (location.hash === hash) window.dispatchEvent(new Event('wtools:staged-input'));
    else location.hash = hash;
  });
  function setTransferResult(context, isErr) {
    transferContext = null;
    compatibleTargets = [];
    transferButton.classList.add('hidden');
    transferPanel.classList.add('hidden');
    transferButton.setAttribute('aria-expanded', 'false');
    if (isErr || !transferConfig || context.result == null) return;
    let allowed = true;
    try { allowed = !transferConfig.when || transferConfig.when(context); }
    catch { allowed = false; }
    if (!allowed) return;
    let outputId;
    try { outputId = typeof transferConfig.id === 'function' ? transferConfig.id(context) : transferConfig.id; }
    catch { return; }
    if (!outputId) return;
    const value = transferConfig.value
      ? transferConfig.value(context)
      : cfg.outputHTML ? out.textContent : out.value;
    const declared = tools.find((item) => item.id === sourceId)?.transfer?.outputs
      ?.find((item) => item.id === outputId);
    if (!transferType(declared?.type).validate(value)) return;
    compatibleTargets = transferTargets(sourceId, outputId);
    if (!compatibleTargets.length) return;
    transferContext = { ...context, outputId };
    transferTarget.innerHTML = '';
    for (const item of compatibleTargets)
      transferTarget.append(h('option', { value: item.target.id }, item.target.name));
    updateTransferInputs();
    transferButton.classList.remove('hidden');
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
    setTransferResult({ result: res, input: lastInput, opts: lastOpts, actionId: lastAction }, isErr);
  }

  let seq = 0, running = false, pending = false, controller = null, largeInputApproved = false;
  let lastInput = null, lastOpts = null;
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
    const opts = getOpts();
    lastInput = arg;
    lastOpts = opts;
    let isAsync = false;
    controller = cfg.cancelable ? new AbortController() : null;
    try {
      let res = cfg.process(arg, opts, lastAction, controller?.signal);
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

  addToolCleanup(wrap, () => {
    seq++;
    pending = false;
    controller?.abort();
    controller = null;
  });
  if (cfg.runOnLoad || staged) run();
  return { run, cancel, inputEls, optEls, out, status, setOut, getOpts };
}
