import { isDeepStrictEqual } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import process from 'node:process';
import { compile, search } from '../js/lib/data/jmespath.js';

const testsPath = process.argv[2];
if (!testsPath) throw new Error('Usage: node scripts/run_jmespath_suite.mjs <tests-directory>');

const lock = JSON.parse(await readFile(new URL('./jmespath-test-lock.json', import.meta.url), 'utf8'));
const expectedFiles = [...lock.testFiles, 'benchmarks.json'].sort();
const actualFiles = (await readdir(testsPath)).filter((name) => name.endsWith('.json')).sort();
const failures = [];
let resultCases = 0;
let errorCases = 0;
let benchmarkCases = 0;

if (!isDeepStrictEqual(actualFiles, expectedFiles))
  failures.push(`file inventory differs: expected ${expectedFiles.join(', ')}, received ${actualFiles.join(', ')}`);

for (const file of lock.testFiles) {
  const groups = JSON.parse(await readFile(new URL(file, `file://${testsPath.replace(/\/$/, '')}/`), 'utf8'));
  for (const group of groups) {
    for (const test of group.cases || []) {
      try {
        const actual = search(group.given, test.expression);
        if (test.error) failures.push(`${file} ${test.expression}: expected ${test.error}, expression succeeded`);
        else if (!isDeepStrictEqual(actual, test.result))
          failures.push(`${file} ${test.expression}: result differs`);
        else resultCases++;
      } catch (error) {
        if (test.error === error?.code) errorCases++;
        else failures.push(`${file} ${test.expression}: expected ${test.error || 'result'}, received ${error?.code || error}`);
      }
    }
  }
}

const benchmarkGroups = JSON.parse(await readFile(
  new URL('benchmarks.json', `file://${testsPath.replace(/\/$/, '')}/`), 'utf8'));
for (const group of benchmarkGroups) {
  for (const test of group.cases || []) {
    try {
      const expression = compile(test.expression);
      if (test.bench === 'full') search(group.given, expression);
      benchmarkCases++;
    } catch (error) {
      failures.push(`benchmarks.json ${test.expression}: ${error?.message || error}`);
    }
  }
}

if (resultCases !== lock.resultCases)
  failures.push(`result count differs: expected ${lock.resultCases}, received ${resultCases}`);
if (errorCases !== lock.errorCases)
  failures.push(`error count differs: expected ${lock.errorCases}, received ${errorCases}`);
if (resultCases + errorCases !== lock.totalCases)
  failures.push(`total count differs: expected ${lock.totalCases}, received ${resultCases + errorCases}`);
if (benchmarkCases !== lock.benchmarkCases)
  failures.push(`benchmark count differs: expected ${lock.benchmarkCases}, received ${benchmarkCases}`);

if (failures.length) {
  console.error('Pinned JMESPath compliance cases failed:');
  failures.slice(0, 100).forEach((failure) => console.error(`- ${failure}`));
  if (failures.length > 100) console.error(`- ...and ${failures.length - 100} more failures`);
  process.exitCode = 1;
} else {
  console.log(`Passed ${resultCases} result cases, ${errorCases} error cases, and `
    + `${benchmarkCases} benchmark expressions from the pinned JMESPath suite.`);
}
