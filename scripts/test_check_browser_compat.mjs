import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibilityErrors, executableSource } from './check_browser_compat.mjs';

test('문자열과 주석의 using 설명은 선언으로 오인하지 않는다', () => {
  const source = [
    '// using a resource is documented here',
    '/* using another resource */',
    "const single = 'using a value';",
    'const double = "using a value";',
    'const template = `using a value`;',
  ].join('\n');
  assert.deepEqual(compatibilityErrors(source, 'sample.js'), []);
  assert.equal(executableSource(source).split('\n').length, source.split('\n').length);
});

test('실제 using 선언은 원래 줄 번호로 보고한다', () => {
  const errors = compatibilityErrors([
    "const emoji = '🧪'; // using a resource is only prose",
    "const text = 'using a value';",
    'using resource = acquire();',
  ].join('\n'), 'sample.js');
  assert.deepEqual(errors, ['sample.js:3: 최소 브라우저 이후 기능 using 선언']);
});

test('Intl.Segmenter 문자열은 무시하고 실제 무가드 호출만 찾는다', () => {
  assert.deepEqual(compatibilityErrors("const text = 'new Intl.Segmenter()';", 'sample.js'), []);
  assert.deepEqual(
    compatibilityErrors('const segmenter = new Intl.Segmenter();', 'sample.js'),
    ['sample.js:1: Intl.Segmenter 기능 감지가 없습니다.'],
  );
  assert.deepEqual(compatibilityErrors([
    "if (typeof Intl.Segmenter === 'function') {",
    '  const segmenter = new Intl.Segmenter();',
    '}',
  ].join('\n'), 'sample.js'), []);
  assert.deepEqual(compatibilityErrors([
    "if ('Segmenter' in Intl) {",
    '  const segmenter = new Intl.Segmenter();',
    '}',
  ].join('\n'), 'sample.js'), []);
  assert.deepEqual(
    compatibilityErrors('// "Segmenter" in Intl\nconst segmenter = new Intl.Segmenter();', 'sample.js'),
    ['sample.js:2: Intl.Segmenter 기능 감지가 없습니다.'],
  );
});
