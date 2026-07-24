// main.js — 라우터 / 사이드바 / 홈 화면
import { tools, categories, h, stageToolInput } from './core.js';
import './tools/encoding.js';
import './tools/dataformat.js';
import './tools/devfmt-format.js';
import './tools/devfmt-convert.js';
import './tools/devfmt-diff.js';
import './tools/devfmt-reference.js';
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
const menuBtn = document.getElementById('menu-btn');
const sidebarTop = document.getElementById('sidebar-top');
const detectResult = document.getElementById('detect-result');
const externalWarning = document.getElementById('external-resource-warning');
const updateNotice = document.getElementById('update-notice');
const updateApply = document.getElementById('update-apply');
const MAX_DETECT_LENGTH = 64 * 1024;
let pastedDetectionPending = false;
let cleanupCurrentTool = null;
let searchResultIndex = -1;
let navLinkId = 0;

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

/* ---------- 즐겨찾기 ---------- */
function loadStoredList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const favorites = new Set(loadStoredList('wtools-favorites'));
const saveFavorites = () => localStorage.setItem('wtools-favorites', JSON.stringify([...favorites]));

function favoriteList() {
  return [...favorites].map((id) => tools.find((t) => t.id === id)).filter(Boolean);
}

function setStar(btn, id) {
  const active = favorites.has(id);
  const label = active ? '즐겨찾기 해제' : '즐겨찾기 추가';
  btn.classList.toggle('active', active);
  btn.textContent = active ? '★' : '☆';
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

function starBtn(id) {
  const btn = h('button', {
    class: 'star-btn',
    type: 'button',
    'data-id': id,
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(id);
    },
  });
  setStar(btn, id);
  return btn;
}

function toggleFavorite(id) {
  favorites[favorites.has(id) ? 'delete' : 'add'](id);
  saveFavorites();
  buildNav();
  applyFilter();
  syncNavActive();
  const m = (location.hash || '#/').match(/^#\/tool\/([\w-]+)/);
  if (m) {
    const btn = content.querySelector('.tool-header .star-btn');
    if (btn) setStar(btn, id);
  } else {
    renderHome();
  }
}

/* ---------- 사이드바 ---------- */
const collapsed = new Set(loadStoredList('wtools-collapsed'));
const saveCollapsed = () => localStorage.setItem('wtools-collapsed', JSON.stringify([...collapsed]));

function navItem(t) {
  return h('div', { class: 'nav-item' },
    h('a', { id: `nav-tool-${++navLinkId}`, href: '#/tool/' + t.id, 'data-id': t.id, 'data-search': (t.name + ' ' + t.id + ' ' + (t.desc || '') + ' ' + (t.keywords || '')).toLowerCase() }, t.name),
    starBtn(t.id));
}

function buildNav() {
  nav.innerHTML = '';
  navLinkId = 0;
  const favList = favoriteList();
  if (favList.length) {
    nav.append(h('div', { class: 'cat favorites' },
      h('div', { class: 'cat-title' }, '⭐ 즐겨찾기'),
      favList.map((t) => navItem(t))));
  }
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
      list.map((t) => navItem(t)));
    nav.append(sec);
  }
}

function visibleSearchResults() {
  if (!search.value.trim()) return [];
  return [...nav.querySelectorAll('.cat:not(.hidden) .nav-item:not(.hidden) a')];
}

function setCurrentSearchResult(index) {
  const results = visibleSearchResults();
  nav.querySelectorAll('a.search-current').forEach((a) => a.classList.remove('search-current'));
  if (index == null || !results.length) {
    searchResultIndex = -1;
    search.removeAttribute('aria-activedescendant');
    return;
  }
  searchResultIndex = (index + results.length) % results.length;
  const current = results[searchResultIndex];
  current.classList.add('search-current');
  search.setAttribute('aria-activedescendant', current.id);
  current.scrollIntoView({
    block: 'nearest',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}

function applyFilter() {
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  nav.classList.toggle('searching', !!terms.length); // 검색 중에는 접힌 카테고리도 결과를 보여준다
  for (const sec of nav.querySelectorAll('.cat')) {
    let visible = 0;
    for (const item of sec.querySelectorAll('.nav-item')) {
      const a = item.querySelector('a');
      const hit = !terms.length || terms.every((term) => a.dataset.search.includes(term));
      item.classList.toggle('hidden', !hit);
      if (hit) visible++;
    }
    sec.classList.toggle('hidden', !visible);
  }
  search.setAttribute('aria-expanded', String(!!terms.length && visibleSearchResults().length > 0));
  setCurrentSearchResult(null);
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
search.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!visibleSearchResults().length) return;
    e.preventDefault();
    setCurrentSearchResult(searchResultIndex + (e.key === 'ArrowDown' ? 1 : -1));
  } else if (e.key === 'Enter' && searchResultIndex >= 0) {
    const current = visibleSearchResults()[searchResultIndex];
    if (current) {
      e.preventDefault();
      current.click();
    }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    if (matchMedia('(max-width: 800px)').matches) setSidebarOpen(true);
    search.focus();
    search.select();
  } else if (e.key === 'Escape') {
    if (search.value) {
      search.value = '';
      showDetection('');
      applyFilter();
      search.focus();
    } else if (sidebar.classList.contains('open')) {
      setSidebarOpen(false);
      menuBtn.focus();
    } else if (document.activeElement === search) {
      search.blur();
    } else {
      return;
    }
    e.preventDefault();
  }
});

function setSidebarOpen(open) {
  sidebar.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? '도구 메뉴 닫기' : '도구 메뉴 열기');
}
menuBtn.addEventListener('click', () => setSidebarOpen(!sidebar.classList.contains('open')));
nav.addEventListener('click', (e) => { if (e.target.tagName === 'A') setSidebarOpen(false); });
document.addEventListener('pointerdown', (e) => {
  if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !menuBtn.contains(e.target))
    setSidebarOpen(false);
});
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
function card(t) {
  return h('div', { class: 'card' },
    h('a', { class: 'card-link', href: '#/tool/' + t.id },
      h('div', { class: 't' }, t.name),
      h('div', { class: 'd' }, t.desc || '')),
    starBtn(t.id));
}

function renderHome() {
  const home = h('div', { class: 'home' },
    h('h1', null, 'W-Tools'),
    h('p', { class: 'sub' }, `브라우저에서 바로 실행되는 웹 도구 ${tools.length}개.`));
  const favList = favoriteList();
  if (favList.length) {
    home.append(h('div', { class: 'cat-section' },
      h('h2', null, '⭐ 즐겨찾기'),
      h('div', { class: 'card-grid' }, favList.map((t) => card(t)))));
  }
  for (const [cat, list] of byCat()) {
    if (!list.length) continue;
    home.append(h('div', { class: 'cat-section' },
      h('h2', null, cat),
      h('div', { class: 'card-grid' }, list.map((t) => card(t)))));
  }
  content.innerHTML = '';
  content.append(home);
}

function renderToolNotFound(id) {
  content.innerHTML = '';
  content.append(h('div', { class: 'home' },
    h('h1', null, '도구를 찾을 수 없습니다'),
    h('p', { class: 'error' }, `요청한 도구 “${id}”가 존재하지 않습니다.`),
    h('p', { class: 'sub' }, '주소가 올바른지 확인하거나 홈에서 사용할 도구를 선택하세요.'),
    h('a', { class: 'btn primary', href: '#/' }, '홈으로 이동')));
  document.title = '도구를 찾을 수 없습니다 — W-Tools';
}

function renderTool(id) {
  const t = tools.find((x) => x.id === id);
  if (!t) { renderToolNotFound(id); return; }
  content.innerHTML = '';
  const box = h('div', null,
    h('div', { class: 'tool-header' },
      h('div', { class: 'crumb' }, h('a', { href: '#/' }, '홈'), ' / ', t.cat),
      h('div', { class: 'tool-title-row' }, h('h1', null, t.name), starBtn(t.id)),
      h('p', { class: 'desc' }, t.desc || '')),
    h('div', { class: 'tool-body' }));
  content.append(box);
  try {
    const cleanup = t.render(box.querySelector('.tool-body'));
    if (typeof cleanup === 'function') cleanupCurrentTool = cleanup;
  } catch (e) {
    box.append(h('p', { class: 'error' }, '도구 로드 중 오류: ' + e.message));
  }
  document.title = t.name + ' — W-Tools';
}

function syncNavActive() {
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/tool\/([\w-]+)/);
  for (const a of nav.querySelectorAll('a'))
    a.classList.toggle('active', !!m && a.dataset.id === m[1]);
  // 현재 도구가 속한 (즐겨찾기 포함) 섹션은 자동으로 펼친다
  for (const a of nav.querySelectorAll('a.active')) {
    const sec = a.closest('.cat');
    if (sec?.classList.contains('collapsed')) {
      sec.classList.remove('collapsed');
      collapsed.delete(sec.dataset.cat);
      saveCollapsed();
    }
  }
}

function route() {
  if (cleanupCurrentTool) {
    try { cleanupCurrentTool(); }
    catch (e) { console.error('도구 리소스 정리 중 오류:', e); }
    cleanupCurrentTool = null;
  }
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/tool\/([\w-]+)/);
  syncNavActive();
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
    // 첫 설치 시 clients.claim()으로 제어권만 넘어온 경우와
    // 업데이트로 컨트롤러가 교체된 경우를 구분하기 위해 기록해 둔다.
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        let refreshing = false;
        const showUpdate = (worker) => {
          if (!worker || !navigator.serviceWorker.controller) return;
          updateNotice.classList.remove('hidden');
          updateApply.onclick = () => {
            updateApply.disabled = true;
            updateApply.textContent = '적용 중…';
            worker.postMessage({ type: 'SKIP_WAITING' });
          };
        };
        if (registration.waiting) showUpdate(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed') showUpdate(worker);
          });
        });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!hadController) {
            // 첫 방문: 페이지는 이미 네트워크에서 로드됐으므로 새로고침이 필요 없다.
            hadController = true;
            return;
          }
          if (refreshing) return;
          refreshing = true;
          location.reload();
        });
      })
      .catch(() => { /* 오프라인 지원은 선택 사항이므로 무시한다. */ });
  });
}

window.addEventListener('load', () => {
  if (!globalThis.CryptoJS || !globalThis.jsyaml) externalWarning.classList.remove('hidden');
});
