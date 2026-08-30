import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { loadAll } from '../js/lib/data/yaml.js';

const root = process.argv[2];
if (!root) throw new Error('Usage: node scripts/run_yaml_suite.mjs <yaml-test-suite-data-directory>');

const lock = JSON.parse(await readFile(new URL('./yaml-test-suite-lock.json', import.meta.url), 'utf8'));
const exists = (file) => access(file).then(() => true, () => false);
const directories = [];

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === 'in.yaml')) directories.push(directory);
  for (const entry of entries) {
    if (entry.isDirectory() && !['name', 'tags'].includes(entry.name))
      await collect(path.join(directory, entry.name));
  }
}

await collect(root);
directories.sort();
const cases = new Map();
for (const directory of directories) {
  const id = path.relative(root, directory);
  cases.set(id, {
    directory,
    invalid: await exists(path.join(directory, 'error')),
    comparable: await exists(path.join(directory, 'in.json')),
  });
}

const invalidCases = [...cases.entries()].filter(([, item]) => item.invalid);
const comparableValidCases = [...cases.entries()].filter(([, item]) => !item.invalid && item.comparable);
const failures = [];
if (cases.size !== lock.suiteCases)
  failures.push(`corpus inventory differs: expected ${lock.suiteCases}, received ${cases.size}`);
if (invalidCases.length !== lock.invalidCases)
  failures.push(`invalid-case inventory differs: expected ${lock.invalidCases}, received ${invalidCases.length}`);
if (comparableValidCases.length !== lock.comparableValidCases)
  failures.push(`comparable valid-case inventory differs: expected ${lock.comparableValidCases}, received ${comparableValidCases.length}`);

for (const id of lock.supportedValidCases) {
  const item = cases.get(id);
  if (!item || item.invalid || !item.comparable) {
    failures.push(`${id}: locked valid case is missing or has different metadata`);
    continue;
  }
  try {
    const yaml = await readFile(path.join(item.directory, 'in.yaml'), 'utf8');
    const expected = JSON.parse(await readFile(path.join(item.directory, 'in.json'), 'utf8'));
    const documents = loadAll(yaml);
    const actual = documents.length === 1 ? documents[0] : documents;
    const normalized = JSON.parse(JSON.stringify(actual));
    if (JSON.stringify(normalized) !== JSON.stringify(expected)) failures.push(`${id}: parsed value differs`);
  } catch (error) {
    failures.push(`${id}: ${error?.message || error}`);
  }
}

for (const [id, item] of invalidCases) {
  try {
    loadAll(await readFile(path.join(item.directory, 'in.yaml'), 'utf8'));
    failures.push(`${id}: invalid YAML was accepted`);
  } catch {
    // Every official malformed-input case must be rejected.
  }
}

if (failures.length) {
  console.error('Pinned YAML Test Suite cases failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Passed ${lock.supportedValidCases.length}/${lock.comparableValidCases} comparable valid cases and rejected ${lock.invalidCases}/${lock.invalidCases} invalid cases (${lock.suiteTag}, ${lock.suiteCases} total).`);
}
