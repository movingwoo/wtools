import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { queryJsonPath } from '../js/lib/data/jsonpath.js';

const corpusPath = process.argv[2];
if (!corpusPath) throw new Error('Usage: node scripts/run_jsonpath_suite.mjs <cts.json>');

const lock = JSON.parse(await readFile(new URL('./jsonpath-test-lock.json', import.meta.url), 'utf8'));
const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
const excluded = new Set(lock.excludedTags);
const failures = [];
let passed = 0, skipped = 0;

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

if (!Array.isArray(corpus.tests) || corpus.tests.length !== lock.totalCases)
  failures.push(`case inventory differs: expected ${lock.totalCases}, received ${corpus.tests?.length}`);

for (const test of corpus.tests || []) {
  if ((test.tags || []).some((tag) => excluded.has(tag))) {
    skipped++;
    continue;
  }
  try {
    const actual = queryJsonPath(test.document, test.selector);
    if (test.invalid_selector) {
      failures.push(`${test.name}: invalid selector was accepted`);
      continue;
    }
    const accepted = [test.result, ...(test.results || [])]
      .filter((result) => result !== undefined);
    if (!accepted.some((expected) => equal(actual, expected)))
      failures.push(`${test.name}: result differs for ${test.selector}`);
    else passed++;
  } catch (error) {
    if (test.invalid_selector) passed++;
    else failures.push(`${test.name}: ${error?.message || error}`);
  }
}

if (passed !== lock.supportedCases)
  failures.push(`supported result count differs: expected ${lock.supportedCases}, received ${passed}`);
if (passed + skipped !== lock.totalCases)
  failures.push(`excluded result count differs: passed ${passed}, skipped ${skipped}`);

if (failures.length) {
  console.error('Pinned JSONPath Compliance Test Suite cases failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Passed ${passed}/${lock.totalCases} RFC 9535 cases; skipped ${skipped} `
    + `${lock.excludedTags.join('/')} function cases outside the documented scope.`);
}
