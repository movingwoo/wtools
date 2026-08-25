#!/usr/bin/env node
// Chrome/Edge 110, Firefox 115, Safari 16.4보다 새로운 문법·전역 API의 무가드 사용을 막는다.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const unsupported = [
  [/\bPromise\.withResolvers\s*\(/, 'Promise.withResolvers'],
  [/\bArray\.fromAsync\s*\(/, 'Array.fromAsync'],
  [/\b(?:Object|Map)\.groupBy\s*\(/, 'groupBy'],
  [/\bRegExp\.escape\s*\(/, 'RegExp.escape'],
  [/\bTemporal\./, 'Temporal'],
  [/\busing\s+[A-Za-z_$]/, 'using 선언'],
];

// 위치와 줄바꿈은 그대로 두고 문자열·template literal·주석 내용만 공백으로 바꾼다.
// 검사할 토큰이 설명 문구나 예제에 들어 있어도 실제 코드로 오인하지 않게 한다.
function maskedSource(source, maskStrings) {
  // 인덱스는 JavaScript 정규식과 같은 UTF-16 code unit 기준을 유지한다.
  const output = source.split('');
  let state = 'code';
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (state === 'code') {
      if (char === '/' && next === '/') {
        output[index] = output[index + 1] = ' ';
        index++;
        state = 'line-comment';
      } else if (char === '/' && next === '*') {
        output[index] = output[index + 1] = ' ';
        index++;
        state = 'block-comment';
      } else if (char === "'") {
        if (maskStrings) output[index] = ' ';
        state = 'single-quote';
      } else if (char === '"') {
        if (maskStrings) output[index] = ' ';
        state = 'double-quote';
      } else if (char === '`') {
        if (maskStrings) output[index] = ' ';
        state = 'template';
      }
      continue;
    }
    if (char === '\n' || char === '\r') {
      output[index] = char;
      if (state === 'line-comment') state = 'code';
      continue;
    }
    const comment = state === 'line-comment' || state === 'block-comment';
    if (comment || maskStrings) output[index] = ' ';
    if (state === 'block-comment' && char === '*' && next === '/') {
      output[index + 1] = ' ';
      index++;
      state = 'code';
    } else if (['single-quote', 'double-quote', 'template'].includes(state) && char === '\\') {
      if (index + 1 < source.length) {
        if (source[index + 1] === '\n' || source[index + 1] === '\r') output[index + 1] = source[index + 1];
        else if (maskStrings) output[index + 1] = ' ';
        index++;
      }
    } else if ((state === 'single-quote' && char === "'")
      || (state === 'double-quote' && char === '"')
      || (state === 'template' && char === '`')) {
      state = 'code';
    }
  }
  return output.join('');
}

export function executableSource(source) {
  return maskedSource(source, true);
}

export function compatibilityErrors(source, file = '입력.js') {
  const code = executableSource(source);
  const commentFree = maskedSource(source, false);
  const errors = [];
  for (const [pattern, feature] of unsupported) {
    const match = pattern.exec(code);
    if (match) {
      const line = code.slice(0, match.index).split('\n').length;
      errors.push(`${file}:${line}: 최소 브라우저 이후 기능 ${feature}`);
    }
  }
  for (const match of code.matchAll(/new\s+Intl\.Segmenter\s*\(/g)) {
    const before = code.slice(Math.max(0, match.index - 250), match.index);
    const beforeWithStrings = commentFree.slice(Math.max(0, match.index - 250), match.index);
    if (!/typeof\s+Intl\.Segmenter/.test(before)
      && !/['"]Segmenter['"]\s+in\s+Intl/.test(beforeWithStrings)) {
      const line = code.slice(0, match.index).split('\n').length;
      errors.push(`${file}:${line}: Intl.Segmenter 기능 감지가 없습니다.`);
    }
  }
  return errors;
}

function filesToCheck() {
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
  return files;
}

export function main() {
  const files = filesToCheck();
  const errors = files.flatMap((file) => compatibilityErrors(
    readFileSync(file, 'utf8'), relative(root, file),
  ));
  if (errors.length) {
    console.error(errors.join('\n'));
    return 1;
  }
  console.log(`브라우저 기준선 정적 검사 통과: ${files.length}개 JavaScript 파일`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
