import { parse, stringify, TomlDate, TOML_DEFAULT_LIMITS } from '../lib/data/toml.js';

function collectDates(value) {
  const result = [], seen = new Set(), stack = [{ value, path: [], depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop();
    if (!current.value || typeof current.value !== 'object' || seen.has(current.value)) continue;
    if (++nodes > TOML_DEFAULT_LIMITS.nodes)
      throw new TypeError(`TOML 결과 노드가 ${TOML_DEFAULT_LIMITS.nodes}개를 넘었습니다.`);
    if (current.value instanceof TomlDate) {
      result.push({ path: current.path, text: current.value.tomlText, type: current.value.tomlType });
      continue;
    }
    if (current.depth > TOML_DEFAULT_LIMITS.depth)
      throw new TypeError(`TOML 결과 중첩이 ${TOML_DEFAULT_LIMITS.depth}단계를 넘었습니다.`);
    seen.add(current.value);
    const entries = Array.isArray(current.value)
      ? Array.from(current.value, (child, index) => [index, child])
      : Object.entries(current.value);
    for (let index = entries.length - 1; index >= 0; index--) {
      const [key, child] = entries[index];
      stack.push({ value: child, path: [...current.path, key], depth: current.depth + 1 });
    }
  }
  return result;
}

function restoreDates(value, dates) {
  for (const { path, text, type } of dates || []) {
    let parent = value;
    for (let index = 0; index < path.length - 1; index++) parent = parent[path[index]];
    const key = path[path.length - 1];
    Object.defineProperty(parent, key, {
      value: new TomlDate(parent[key].getTime(), text, type),
      writable: true, configurable: true, enumerable: true,
    });
  }
}

self.addEventListener('message', ({ data }) => {
  try {
    if (data?.action === 'parse' && typeof data.text === 'string') {
      const result = parse(data.text);
      self.postMessage({ result, dates: collectDates(result) });
    } else if (data?.action === 'stringify') {
      restoreDates(data.value, data.dates);
      self.postMessage({ result: stringify(data.value) });
    } else throw new Error('지원하지 않는 TOML Worker 작업입니다.');
  } catch (error) {
    self.postMessage({ error: error?.message || String(error), code: error?.code });
  }
}, { once: true });
