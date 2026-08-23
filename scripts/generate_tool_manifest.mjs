#!/usr/bin/env node
// 도구 구현을 실행해 검색/홈에 필요한 직렬화 가능한 메타데이터만 분리한다.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'js/tool-manifest.js');
const modules = [
  'encoding', 'dataformat', 'devfmt-format', 'devfmt-convert', 'devfmt-diff', 'devfmt-reference',
  'stringtools', 'hashing', 'cryptotools', 'pki', 'network', 'datetime', 'media', 'mathtools', 'archive',
];

const core = await import(pathToFileURL(resolve(root, 'js/core.js')));
const manifests = [];
for (const name of modules) {
  const before = new Set(core.tools.map((item) => item.id));
  const modulePath = resolve(root, `js/tools/${name}.js`);
  const source = await readFile(modulePath, 'utf8');
  await import(pathToFileURL(modulePath));
  for (const tool of core.tools.filter((item) => !before.has(item.id))) {
    const plain = JSON.parse(JSON.stringify({
      id: tool.id,
      cat: tool.cat,
      name: tool.name,
      desc: tool.desc || '',
      keywords: tool.keywords || '',
      externalRequest: tool.externalRequest,
      transfer: tool.transfer,
    }));
    manifests.push({
      ...plain,
      module: `./tools/${name}.js`,
      externalLibrary: /\b(?:loadScript|loadCss|loadModule|vendorUrl)\s*\(/.test(source),
    });
  }
}

const output = `// 이 파일은 scripts/generate_tool_manifest.mjs로 갱신합니다. 직접 편집하지 마세요.\n`
  + `export const TOOL_MANIFESTS = Object.freeze(${JSON.stringify(manifests, null, 2)});\n`;
if (process.argv.includes('--check')) {
  let current = '';
  try { current = await readFile(target, 'utf8'); } catch { /* 누락도 불일치로 처리한다. */ }
  if (current !== output) {
    console.error('js/tool-manifest.js가 도구 구현과 다릅니다. node scripts/generate_tool_manifest.mjs를 실행하세요.');
    process.exitCode = 1;
  } else {
    console.log(`도구 메타데이터 ${manifests.length}개가 구현과 일치합니다.`);
  }
} else {
  await writeFile(target, output);
  console.log(`js/tool-manifest.js에 도구 메타데이터 ${manifests.length}개를 기록했습니다.`);
}
