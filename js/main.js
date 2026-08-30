// main.js — 라우터 / 사이드바 / 홈 화면
import {
  tools, categories, h, enhanceFileInputs, stageToolInput, registerToolManifests, cleanupToolRoot,
} from './core.js';
import { TOOL_MANIFESTS } from './tool-manifest.js';

registerToolManifests(TOOL_MANIFESTS);

const nav = document.getElementById('nav');
const content = document.getElementById('content');
const search = document.getElementById('search');
const sidebar = document.getElementById('sidebar');
const menuBtn = document.getElementById('menu-btn');
const skipLink = document.querySelector('.skip-link');
const detectResult = document.getElementById('detect-result');
const externalWarning = document.getElementById('external-resource-warning');
const updateNotice = document.getElementById('update-notice');
const updateApply = document.getElementById('update-apply');
const mobileSidebarMedia = matchMedia('(max-width: 800px)');
const MAX_DETECT_LENGTH = 64 * 1024;
const DETECT_DEBOUNCE_MS = 250;
let detectionTimer = null;
let cleanupCurrentTool = null;
let searchResultIndex = -1;
let navLinkId = 0;
let routeSequence = 0;
const moduleLoads = new Map();

function decodeB64UrlJson(part) {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function detectValue(raw) {
  if (raw.length > MAX_DETECT_LENGTH) return null;
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

function scheduleDetection(raw) {
  if (detectionTimer !== null) {
    clearTimeout(detectionTimer);
    detectionTimer = null;
  }
  showDetection('');
  if (raw.length < 8 || raw.length > MAX_DETECT_LENGTH) return;
  detectionTimer = setTimeout(() => {
    detectionTimer = null;
    showDetection(raw);
  }, DETECT_DEBOUNCE_MS);
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
    scheduleDetection('');
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

function saveStoredList(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify([...values]));
  } catch { /* 저장소를 사용할 수 없어도 현재 세션의 동작은 유지한다. */ }
}

const favorites = new Set(loadStoredList('wtools-favorites'));
const saveFavorites = () => saveStoredList('wtools-favorites', favorites);

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
const saveCollapsed = () => saveStoredList('wtools-collapsed', collapsed);

function navItem(t) {
  return h('div', { class: 'nav-item', id: `nav-tool-${++navLinkId}`, role: 'treeitem', 'aria-level': '2' },
    h('a', { href: '#/tool/' + t.id, 'data-id': t.id, 'data-search': (t.name + ' ' + t.id + ' ' + (t.desc || '') + ' ' + (t.keywords || '')).toLowerCase() }, t.name),
    starBtn(t.id));
}

function buildNav() {
  nav.innerHTML = '';
  navLinkId = 0;
  let categoryId = 0;
  const favList = favoriteList();
  if (favList.length) {
    nav.append(h('div', { class: 'cat favorites', role: 'group', 'aria-label': '즐겨찾기' },
      h('div', { class: 'cat-title', 'aria-hidden': 'true' }, '⭐ 즐겨찾기'),
      h('div', { role: 'group' }, favList.map((t) => navItem(t)))));
  }
  for (const [cat, list] of byCat()) {
    if (!list.length) continue;
    const itemsId = `nav-category-${++categoryId}`;
    const isCollapsed = collapsed.has(cat);
    const items = h('div', { class: 'cat-items', id: itemsId, role: 'group' }, list.map((t) => navItem(t)));
    const sec = h('div', { class: 'cat' + (collapsed.has(cat) ? ' collapsed' : ''), 'data-cat': cat, role: 'group' },
      h('button', {
        class: 'cat-title', type: 'button', role: 'treeitem', 'aria-level': '1',
        'aria-label': `${cat} 카테고리`,
        'aria-expanded': String(!isCollapsed), 'aria-controls': itemsId,
        onclick: () => {
          collapsed[sec.classList.toggle('collapsed') ? 'add' : 'delete'](cat);
          sec.querySelector('.cat-title').setAttribute(
            'aria-expanded',
            String(nav.classList.contains('searching') || !sec.classList.contains('collapsed')),
          );
          saveCollapsed();
        },
      }, cat),
      items);
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
  search.setAttribute('aria-activedescendant', current.closest('[role="treeitem"]')?.id || '');
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
    const title = sec.querySelector('button.cat-title');
    if (title) title.setAttribute('aria-expanded', String(!!terms.length || !sec.classList.contains('collapsed')));
  }
  search.setAttribute('aria-expanded', String(!!terms.length && visibleSearchResults().length > 0));
  setCurrentSearchResult(null);
}
search.addEventListener('input', () => {
  applyFilter();
  scheduleDetection(search.value);
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
    if (mobileSidebarMedia.matches) setSidebarOpen(true);
    search.focus();
    search.select();
  } else if (e.key === 'Escape') {
    if (search.value) {
      search.value = '';
      scheduleDetection('');
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
  const nextOpen = mobileSidebarMedia.matches && open;
  const hidden = mobileSidebarMedia.matches && !nextOpen;
  if (hidden && sidebar.contains(document.activeElement)) menuBtn.focus();
  sidebar.classList.toggle('open', nextOpen);
  sidebar.toggleAttribute('inert', hidden);
  if (hidden) sidebar.setAttribute('aria-hidden', 'true');
  else sidebar.removeAttribute('aria-hidden');
  menuBtn.setAttribute('aria-expanded', String(nextOpen));
  menuBtn.setAttribute('aria-label', nextOpen ? '도구 메뉴 닫기' : '도구 메뉴 열기');
}
menuBtn.addEventListener('click', () => setSidebarOpen(!sidebar.classList.contains('open')));
nav.addEventListener('click', (e) => { if (e.target.tagName === 'A') setSidebarOpen(false); });
document.addEventListener('pointerdown', (e) => {
  if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !menuBtn.contains(e.target))
    setSidebarOpen(false);
});
mobileSidebarMedia.addEventListener('change', () => setSidebarOpen(false));
setSidebarOpen(false);

skipLink.addEventListener('click', (e) => {
  // 해시 라우팅을 유지하면서 본문으로 포커스를 이동한다.
  e.preventDefault();
  content.focus();
  content.scrollIntoView({ block: 'start' });
});

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

function appendExternalRequestNotice(body, t) {
  if (!t.externalRequest) return;
  const request = t.externalRequest;
  const action = request.action || '조회 버튼';
  body.append(h('aside', { class: 'external-request-notice', 'aria-label': '외부 서버 사용 안내' },
    h('strong', null, '외부 서버 사용 안내'),
    h('p', null, `${action}을 누르면 ${request.service}로 다음 정보가 전송됩니다: ${request.sends}.`),
    h('p', null, request.privacy),
    request.cors ? h('p', null, '외부 서버의 CORS 허용 응답이 필요하므로 네트워크나 브라우저 정책에 따라 조회가 실패할 수 있습니다.') : null));
}

function loadToolModule(t, retry = false) {
  if (!retry && moduleLoads.has(t.module)) return moduleLoads.get(t.module);
  const specifier = retry ? `${t.module}?retry=${Date.now()}` : t.module;
  const promise = import(specifier).catch((error) => {
    moduleLoads.delete(t.module);
    throw error;
  });
  moduleLoads.set(t.module, promise);
  return promise;
}

async function renderToolBody(t, body, token, retry = false) {
  body.setAttribute('aria-busy', 'true');
  body.replaceChildren(h('p', { class: 'tool-loading', role: 'status' }, retry ? '도구 모듈을 다시 불러오는 중…' : '도구 모듈을 불러오는 중…'));
  try {
    await loadToolModule(t, retry);
    if (token !== routeSequence || !body.isConnected) return;
    if (typeof t.render !== 'function') throw new Error('도구 구현이 등록되지 않았습니다.');
    body.replaceChildren();
    appendExternalRequestNotice(body, t);
    const cleanup = t.render(body);
    if (typeof cleanup === 'function') cleanupCurrentTool.toolCleanup = cleanup;
    enhanceFileInputs(body);
    body.setAttribute('aria-busy', 'false');
  } catch (error) {
    if (token !== routeSequence || !body.isConnected) return;
    body.setAttribute('aria-busy', 'false');
    body.replaceChildren(
      h('div', { class: 'tool-load-error error', 'data-error-code': 'MOD001' },
        h('strong', null, '도구 모듈을 불러오지 못했습니다. (MOD001)'),
        h('p', null, '네트워크 연결 또는 오프라인 캐시를 확인한 뒤 다시 시도하세요.'),
        h('button', { class: 'btn small', type: 'button', onclick: () => renderToolBody(t, body, token, true) }, '다시 시도')));
  }
}

function renderTool(id, token) {
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
  const body = box.querySelector('.tool-body');
  const cleanup = () => {
    try { cleanup.toolCleanup?.(); } finally { cleanupToolRoot(body); }
  };
  cleanup.toolCleanup = null;
  cleanupCurrentTool = cleanup;
  renderToolBody(t, body, token);
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
      sec.querySelector('button.cat-title')?.setAttribute('aria-expanded', 'true');
      collapsed.delete(sec.dataset.cat);
      saveCollapsed();
    }
  }
}

function route() {
  const token = ++routeSequence;
  if (cleanupCurrentTool) {
    try { cleanupCurrentTool(); }
    catch (e) { console.error('도구 리소스 정리 중 오류:', e); }
    cleanupCurrentTool = null;
  }
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/tool\/([\w-]+)/);
  syncNavActive();
  if (m) renderTool(m[1], token);
  else { document.title = 'W-Tools — 웹 도구 모음'; renderHome(); }
  content.scrollTop = 0;
  window.scrollTo(0, 0);
}

buildNav();
window.addEventListener('hashchange', route);
window.addEventListener('wtools:staged-input', route);
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
      .catch(() => {
        externalWarning.textContent = '오프라인 지원을 준비하지 못했습니다. 온라인 상태에서 새로고침해 복구하세요. (SWR001)';
        externalWarning.classList.remove('hidden');
      });
  });
}

window.addEventListener('load', () => {
  if (!globalThis.CryptoJS) externalWarning.classList.remove('hidden');
});
