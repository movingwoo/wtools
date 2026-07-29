// theme.js — 첫 화면 렌더링 전 테마 적용 + 수동 전환
(function () {
  'use strict';

  const STORAGE_KEY = 'wtools-theme';
  const ORDER = ['system', 'light', 'dark'];
  const INFO = {
    system: { icon: '🖥️', label: '시스템' },
    light: { icon: '☀️', label: '라이트' },
    dark: { icon: '🌙', label: '다크' },
  };
  const THEME_COLORS = {
    light: '#2563eb',
    dark: '#0e1116',
  };
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  let selected = readTheme();
  let toggle = null;

  function normalize(theme) {
    return ORDER.includes(theme) ? theme : 'system';
  }

  function readTheme() {
    try {
      return normalize(localStorage.getItem(STORAGE_KEY));
    } catch {
      return 'system';
    }
  }

  function effectiveTheme() {
    return selected === 'system' ? (systemDark.matches ? 'dark' : 'light') : selected;
  }

  function updateThemeColor() {
    const meta = document.getElementById('theme-color');
    if (meta) meta.content = THEME_COLORS[effectiveTheme()];
  }

  function applyTheme() {
    if (selected === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', selected);
    updateThemeColor();
  }

  function updateToggle() {
    if (!toggle) return;
    const current = INFO[selected];
    const next = INFO[ORDER[(ORDER.indexOf(selected) + 1) % ORDER.length]];
    const description = `현재 테마: ${current.label}. ${next.label} 테마로 전환`;
    toggle.textContent = `${current.icon} ${current.label}`;
    toggle.setAttribute('aria-label', description);
    toggle.title = description;
  }

  function setTheme(theme, persist) {
    selected = normalize(theme);
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, selected);
      } catch { /* 저장할 수 없어도 현재 페이지의 전환은 유지한다. */ }
    }
    applyTheme();
    updateToggle();
  }

  applyTheme();

  document.addEventListener('DOMContentLoaded', () => {
    toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    updateToggle();
    toggle.addEventListener('click', () => {
      const next = ORDER[(ORDER.indexOf(selected) + 1) % ORDER.length];
      setTheme(next, true);
    });
  });

  const handleSystemTheme = () => {
    if (selected === 'system') updateThemeColor();
  };
  if (typeof systemDark.addEventListener === 'function')
    systemDark.addEventListener('change', handleSystemTheme);
  else
    systemDark.addListener(handleSystemTheme);

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) setTheme(event.newValue, false);
  });
}());
