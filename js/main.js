// main.js — 라우터 / 사이드바 / 홈 화면
import { tools, categories, h, stageToolInput } from './core.js';
import './tools/encoding.js';
import './tools/dataformat.js';
import './tools/devfmt.js';
import './tools/stringtools.js';
import './tools/hashing.js';
import './tools/cryptotools.js';
import './tools/pki.js';
import './tools/network.js';
import './tools/datetime.js';
import './tools/media.js';
import './tools/mathtools.js';
import './tools/archive.js';

const nav = document.getElementById('nav');
const content = document.getElementById('content');
const search = document.getElementById('search');
const sidebar = document.getElementById('sidebar');
const sidebarTop = document.getElementById('sidebar-top');
const detectResult = document.getElementById('detect-result');
const MAX_DETECT_LENGTH = 64 * 1024;
let pastedDetectionPending = false;

function decodeB64UrlJson(part) {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function detectValue(raw) {
  const value = raw.trim();
  if (value.length < 8 || value.length > MAX_DETECT_LENGTH) return null;

  const jwt = value.split('.');
  if (jwt.length === 3 && jwt.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
    try {
      const header = decodeB64UrlJson(jwt[0]);
      decodeB64UrlJson(jwt[1]);
      if (header && typeof header === 'object')
        return { label: 'JWT', tools: [{ id: 'jwt', label: 'JWT 디코더로 열기' }] };
    } catch { /* 다른 형식 검사를 계속한다. */ }
  }

  if (/^[\[{]/.test(value)) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object')
        return { label: 'JSON', tools: [{ id: 'json-format', label: 'JSON 포맷 도구로 열기' }] };
    } catch { /* 다른 형식 검사를 계속한다. */ }
  }

  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol))
      return { label: 'URL', tools: [
        { id: 'url-parser', label: 'URL 파서로 열기' },
        { id: 'url-encode', label: 'URL 인코더로 열기' },
      ] };
  } catch { /* 다른 형식 검사를 계속한다. */ }

  if (/^(?:[0-9a-f]{8}|[0-9a-f]{16}|[0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{56}|[0-9a-f]{64}|[0-9a-f]{96}|[0-9a-f]{128})$/i.test(value)
      || /^\$(?:2[abxy]?|argon2|1|5|6|pbkdf2)\$/.test(value) || /^\{SSHA\}/.test(value))
    return { label: '해시', tools: [{ id: 'hash-analyze', label: '해시 분석기로 열기' }] };

  const compact = value.replace(/\s/g, '');
  if (compact.length >= 12 && compact.length % 4 !== 1 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) {
    try {
      atob(compact.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - compact.length % 4) % 4));
      return { label: 'Base64', tools: [{ id: 'base64', label: 'Base64 디코더로 열기', actionId: 'dec' }] };
    } catch { /* 감지하지 않는다. */ }
  }
  return null;
}

function showDetection(raw) {
  const detected = detectValue(raw);
  detectResult.innerHTML = '';
  detectResult.classList.toggle('hidden', !detected);
  if (!detected) return;
  const close = h('button', {
    class: 'detect-close', type: 'button', 'aria-label': '입력값과 추천 지우기', title: '입력값과 추천 지우기',
  }, '×');
  close.addEventListener('click', () => {
    search.value = '';
    detectResult.innerHTML = '';
    detectResult.classList.add('hidden');
    applyFilter();
    search.focus();
  });
  detectResult.append(
    close,
    h('div', { class: 'detect-label' }, '입력값 감지: ', h('strong', null, detected.label)),
    h('div', { class: 'detect-actions' }, detected.tools.map((item) => {
      const link = h('a', { href: '#/tool/' + item.id }, item.label);
      link.addEventListener('click', () => {
        stageToolInput(item.id, raw.trim(), { actionId: item.actionId, options: item.options });
        if (location.hash === link.hash) queueMicrotask(route);
      });
      return link;
    })),
  );
}

function byCat() {
  const m = new Map(categories.map((c) => [c, []]));
  for (const t of tools) (m.get(t.cat) || m.set(t.cat, []).get(t.cat)).push(t);
  return m;
}

/* ---------- 사이드바 ---------- */
const collapsed = new Set(JSON.parse(localStorage.getItem('wtools-collapsed') || '[]'));
const saveCollapsed = () => localStorage.setItem('wtools-collapsed', JSON.stringify([...collapsed]));

function buildNav() {
  nav.innerHTML = '';
  for (const [cat, list] of byCat()) {
    if (!list.length) continue;
    const sec = h('div', { class: 'cat' + (collapsed.has(cat) ? ' collapsed' : ''), 'data-cat': cat },
      h('div', {
        class: 'cat-title',
        onclick: () => {
          collapsed[sec.classList.toggle('collapsed') ? 'add' : 'delete'](cat);
          saveCollapsed();
        },
      }, cat),
      list.map((t) => h('a', { href: '#/tool/' + t.id, 'data-id': t.id, 'data-search': (t.name + ' ' + t.id + ' ' + (t.desc || '') + ' ' + (t.keywords || '')).toLowerCase() }, t.name)));
    nav.append(sec);
  }
}

function applyFilter() {
  const q = search.value.trim().toLowerCase();
  nav.classList.toggle('searching', !!q); // 검색 중에는 접힌 카테고리도 결과를 보여준다
  for (const sec of nav.querySelectorAll('.cat')) {
    let visible = 0;
    for (const a of sec.querySelectorAll('a')) {
      const hit = !q || a.dataset.search.includes(q);
      a.classList.toggle('hidden', !hit);
      if (hit) visible++;
    }
    sec.classList.toggle('hidden', !visible);
  }
  updateSidebarTop();
}
search.addEventListener('input', (e) => {
  applyFilter();
  if (pastedDetectionPending) pastedDetectionPending = false;
  else {
    detectResult.innerHTML = '';
    detectResult.classList.add('hidden');
  }
});
search.addEventListener('paste', (e) => {
  pastedDetectionPending = true;
  showDetection(e.clipboardData?.getData('text') || '');
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    search.focus();
    search.select();
  }
});

document.getElementById('menu-btn').addEventListener('click', () => sidebar.classList.toggle('open'));
nav.addEventListener('click', (e) => { if (e.target.tagName === 'A') sidebar.classList.remove('open'); });
function updateSidebarTop() {
  const visible = sidebar.scrollTop > 240;
  sidebarTop.classList.toggle('visible', visible);
  sidebarTop.setAttribute('aria-hidden', String(!visible));
  sidebarTop.tabIndex = visible ? 0 : -1;
}
sidebar.addEventListener('scroll', updateSidebarTop, { passive: true });
sidebarTop.addEventListener('click', () => {
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  sidebar.scrollTo({ top: 0, behavior });
});
updateSidebarTop();

/* ---------- 라우팅 ---------- */
function renderHome() {
  const home = h('div', { class: 'home' },
    h('h1', null, 'W-Tools'),
    h('p', { class: 'sub' }, `브라우저에서 바로 실행되는 웹 도구 ${tools.length}개.`));
  for (const [cat, list] of byCat()) {
    if (!list.length) continue;
    home.append(h('div', { class: 'cat-section' },
      h('h2', null, cat),
      h('div', { class: 'card-grid' },
        list.map((t) => h('a', { class: 'card', href: '#/tool/' + t.id },
          h('div', { class: 't' }, t.name),
          h('div', { class: 'd' }, t.desc || ''))))));
  }
  content.innerHTML = '';
  content.append(home);
}

function renderTool(id) {
  const t = tools.find((x) => x.id === id);
  if (!t) { renderHome(); return; }
  content.innerHTML = '';
  const box = h('div', null,
    h('div', { class: 'tool-header' },
      h('div', { class: 'crumb' }, h('a', { href: '#/' }, '홈'), ' / ', t.cat),
      h('h1', null, t.name),
      h('p', { class: 'desc' }, t.desc || '')),
    h('div', { class: 'tool-body' }));
  content.append(box);
  try {
    t.render(box.querySelector('.tool-body'));
  } catch (e) {
    box.append(h('p', { class: 'error' }, '도구 로드 중 오류: ' + e.message));
  }
  document.title = t.name + ' — W-Tools';
}

function route() {
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/tool\/([\w-]+)/);
  for (const a of nav.querySelectorAll('a'))
    a.classList.toggle('active', m && a.dataset.id === m[1]);
  // 현재 도구가 속한 카테고리는 자동으로 펼친다
  const sec = nav.querySelector('a.active')?.closest('.cat');
  if (sec?.classList.contains('collapsed')) {
    sec.classList.remove('collapsed');
    collapsed.delete(sec.dataset.cat);
    saveCollapsed();
  }
  if (m) renderTool(m[1]);
  else { document.title = 'W-Tools — 웹 도구 모음'; renderHome(); }
  content.scrollTop = 0;
  window.scrollTo(0, 0);
}

buildNav();
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 지원은 선택 사항이므로 무시한다. */ });
  });
}
