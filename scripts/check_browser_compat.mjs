#!/usr/bin/env node
// Chrome/Edge 110, Firefox 115, Safari 16.4보다 새로운 문법·전역 API의 무가드 사용을 막는다.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.js')) files.push(path);
  }
}
walk(join(root, 'js'));
files.push(join(root, 'sw.js'));

const unsupported = [
  [/\bPromise\.withResolvers\s*\(/, 'Promise.withResolvers'],
  [/\bArray\.fromAsync\s*\(/, 'Array.fromAsync'],
  [/\b(?:Object|Map)\.groupBy\s*\(/, 'groupBy'],
  [/\bRegExp\.escape\s*\(/, 'RegExp.escape'],
  [/\bTemporal\./, 'Temporal'],
  [/\busing\s+[A-Za-z_$]/, 'using 선언'],
];
const errors = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const [pattern, feature] of unsupported) {
    const match = pattern.exec(source);
    if (match) {
      const line = source.slice(0, match.index).split('\n').length;
      errors.push(`${relative(root, file)}:${line}: 최소 브라우저 이후 기능 ${feature}`);
    }
  }
  for (const match of source.matchAll(/new\s+Intl\.Segmenter\s*\(/g)) {
    const before = source.slice(Math.max(0, match.index - 250), match.index);
    if (!/(?:typeof\s+Intl\.Segmenter|['"]Segmenter['"]\s+in\s+Intl)/.test(before)) {
      const line = source.slice(0, match.index).split('\n').length;
      errors.push(`${relative(root, file)}:${line}: Intl.Segmenter 기능 감지가 없습니다.`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`브라우저 기준선 정적 검사 통과: ${files.length}개 JavaScript 파일`);
