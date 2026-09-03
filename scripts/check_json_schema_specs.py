#!/usr/bin/env python3
"""Validate the pinned official JSON Schema Test Suite support range."""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / 'scripts' / 'json-schema-test-lock.json'
SRI_PATTERN = re.compile(r'^sha384-[A-Za-z0-9+/]{64}$')
USER_AGENT = 'W-Tools JSON Schema standards audit (https://github.com/movingwoo/wtools)'
MAX_REVIEW_AGE = timedelta(days=120)
DRAFTS = ['draft4', 'draft6', 'draft7', 'draft2019-09', 'draft2020-12']
META_SCHEMA_URLS = [
  'https://json-schema.org/draft-04/schema',
  'https://json-schema.org/draft-06/schema',
  'https://json-schema.org/draft-07/schema',
  'https://json-schema.org/draft/2019-09/schema',
  *[f'https://json-schema.org/draft/2019-09/meta/{name}'
    for name in ['core', 'applicator', 'validation', 'meta-data', 'format', 'content']],
  'https://json-schema.org/draft/2020-12/schema',
  *[f'https://json-schema.org/draft/2020-12/meta/{name}'
    for name in ['core', 'applicator', 'unevaluated', 'validation', 'meta-data',
                 'format-annotation', 'content']],
]


def load_lock(path: Path = LOCK_PATH) -> dict:
  data = json.loads(path.read_text(encoding='utf-8'))
  validate_lock(data)
  return data


def validate_lock(data: dict) -> None:
  required = {
    'standard', 'standardUrls', 'specificationUrl', 'currentDialect', 'metaSchemas',
    'ietfDraft', 'suiteRepository', 'suiteBranch', 'suiteCommit',
    'suiteUrl', 'suiteSha384', 'excludedFiles', 'excludedSchemaFeatures', 'drafts',
    'skippedReasons', 'supportedGroups', 'supportedCases', 'reviewed',
  }
  if set(data) != required:
    raise ValueError('JSON Schema lock fields differ from the required schema')
  if data['standard'] != 'JSON Schema Draft 4/6/7/2019-09/2020-12':
    raise ValueError('JSON Schema standard inventory is invalid')
  if list(data['standardUrls']) != DRAFTS or any(
      not url.startswith('https://json-schema.org/draft')
      for url in data['standardUrls'].values()):
    raise ValueError('JSON Schema official standard URLs are invalid')
  if data['specificationUrl'] != 'https://json-schema.org/specification' \
      or data['currentDialect'] != '2020-12':
    raise ValueError('JSON Schema current specification inventory is invalid')
  if list(data['metaSchemas']) != META_SCHEMA_URLS \
      or any(not SRI_PATTERN.fullmatch(digest) for digest in data['metaSchemas'].values()):
    raise ValueError('JSON Schema meta-schema URL or hash inventory is invalid')
  ietf = data['ietfDraft']
  if set(ietf) != {'name', 'revision', 'updated', 'url', 'apiUrl'} \
      or ietf['name'] != 'draft-ietf-jsonschema-json-schema' \
      or not re.fullmatch(r'\d{2}', ietf['revision']) \
      or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', ietf['updated']) \
      or ietf['url'] != f'https://datatracker.ietf.org/doc/{ietf["name"]}/' \
      or ietf['apiUrl'] != f'https://datatracker.ietf.org/api/v1/doc/document/{ietf["name"]}/':
    raise ValueError('JSON Schema IETF draft inventory is invalid')
  if (data['suiteRepository'] != 'json-schema-org/JSON-Schema-Test-Suite'
      or data['suiteBranch'] != 'main'
      or not re.fullmatch(r'[0-9a-f]{40}', data['suiteCommit'])
      or data['suiteCommit'] not in data['suiteUrl']
      or not SRI_PATTERN.fullmatch(data['suiteSha384'])):
    raise ValueError('JSON Schema suite repository, branch, commit, URL, or hash is invalid')
  expected_files = [
    'dynamicRef.json', 'recursiveRef.json', 'refRemote.json',
    'unevaluatedItems.json', 'unevaluatedProperties.json', 'vocabulary.json',
  ]
  if data['excludedFiles'] != expected_files:
    raise ValueError('JSON Schema excluded file inventory is invalid')
  expected_features = [
    '$dynamicAnchor', '$dynamicRef', '$recursiveAnchor', '$recursiveRef', '$vocabulary',
    'contentSchema', 'external-or-relative-$ref', 'nested-$id-resource',
    'unevaluatedItems', 'unevaluatedProperties',
  ]
  if data['excludedSchemaFeatures'] != expected_features:
    raise ValueError('JSON Schema excluded feature inventory is invalid')
  expected_drafts = {
    'draft4': {'rootFiles': 30, 'totalGroups': 160, 'totalCases': 618,
               'groups': 146, 'cases': 589, 'skippedGroups': 14, 'skippedCases': 29},
    'draft6': {'rootFiles': 36, 'totalGroups': 232, 'totalCases': 839,
               'groups': 209, 'cases': 790, 'skippedGroups': 23, 'skippedCases': 49},
    'draft7': {'rootFiles': 37, 'totalGroups': 257, 'totalCases': 927,
               'groups': 230, 'cases': 870, 'skippedGroups': 27, 'skippedCases': 57},
    'draft2019-09': {'rootFiles': 46, 'totalGroups': 372, 'totalCases': 1259,
                     'groups': 252, 'cases': 949, 'skippedGroups': 120, 'skippedCases': 310},
    'draft2020-12': {'rootFiles': 46, 'totalGroups': 383, 'totalCases': 1299,
                     'groups': 249, 'cases': 966, 'skippedGroups': 134, 'skippedCases': 333},
  }
  expected_skipped = {
    '$recursiveAnchor': {'groups': 1, 'cases': 2},
    'contentSchema': {'groups': 2, 'cases': 16},
    'external-or-relative-$ref': {'groups': 56, 'cases': 116},
    'file:dynamicRef.json': {'groups': 21, 'cases': 44},
    'file:recursiveRef.json': {'groups': 9, 'cases': 34},
    'file:refRemote.json': {'groups': 60, 'cases': 125},
    'file:unevaluatedItems.json': {'groups': 55, 'cases': 127},
    'file:unevaluatedProperties.json': {'groups': 88, 'cases': 258},
    'file:vocabulary.json': {'groups': 4, 'cases': 10},
    'nested-$id-resource': {'groups': 18, 'cases': 40},
    'unevaluatedProperties': {'groups': 4, 'cases': 6},
  }
  if data['drafts'] != expected_drafts or data['skippedReasons'] != expected_skipped \
      or data['supportedGroups'] != 1086 or data['supportedCases'] != 4164:
    raise ValueError('JSON Schema supported case inventory is invalid')
  try:
    reviewed = date.fromisoformat(data['reviewed'])
  except (TypeError, ValueError):
    raise ValueError('JSON Schema review date must use YYYY-MM-DD') from None
  today = date.today()
  if reviewed > today or today - reviewed > MAX_REVIEW_AGE:
    raise ValueError('JSON Schema review date is stale')


def request(url: str, token: str = '') -> bytes:
  headers = {'Accept': 'application/vnd.github+json', 'User-Agent': USER_AGENT}
  if token and urllib.parse.urlsplit(url).hostname == 'api.github.com':
    headers['Authorization'] = f'Bearer {token}'
  with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
    return response.read()


def sha384_sri(data: bytes) -> str:
  return 'sha384-' + base64.b64encode(hashlib.sha384(data).digest()).decode('ascii')


def branch_commit(repository: str, branch: str, token: str = '') -> str:
  data = json.loads(request(f'https://api.github.com/repos/{repository}/commits/{branch}', token))
  return data.get('sha', '')


def extract_tests(archive: bytes, destination: Path, lock: dict) -> None:
  prefix = f'JSON-Schema-Test-Suite-{lock["suiteCommit"]}/tests/'
  with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as bundle:
    for member in bundle.getmembers():
      if not member.isfile() or not member.name.startswith(prefix) or not member.name.endswith('.json'):
        continue
      relative = Path(member.name.removeprefix(prefix))
      if len(relative.parts) != 2 or relative.parts[0] not in DRAFTS:
        continue
      source = bundle.extractfile(member)
      if source is None:
        raise ValueError(f'could not read JSON Schema suite member: {member.name}')
      target = destination / relative
      target.parent.mkdir(parents=True, exist_ok=True)
      target.write_bytes(source.read())


def run_pinned_corpus(lock: dict, token: str = '') -> list[str]:
  errors = []
  archive = request(lock['suiteUrl'], token)
  if sha384_sri(archive) != lock['suiteSha384']:
    return ['official JSON Schema Test Suite SHA-384 changed']
  with tempfile.TemporaryDirectory(prefix='wtools-json-schema-suite-') as temporary:
    tests_path = Path(temporary) / 'tests'
    extract_tests(archive, tests_path, lock)
    try:
      result = subprocess.run(
        ['node', str(ROOT / 'scripts' / 'run_json_schema_suite.mjs'), str(tests_path)],
        cwd=ROOT, text=True, capture_output=True, check=False, timeout=60,
      )
    except subprocess.TimeoutExpired:
      return ['JSON Schema corpus runner timed out after 60 seconds']
    if result.returncode:
      errors.append(result.stderr.strip() or result.stdout.strip() or 'JSON Schema corpus runner failed')
  return errors


def check_remote(lock: dict, token: str = '') -> list[str]:
  errors = []
  latest = branch_commit(lock['suiteRepository'], lock['suiteBranch'], token)
  if latest != lock['suiteCommit']:
    errors.append(f'JSON Schema Test Suite changed: reviewed {lock["suiteCommit"]}, latest {latest}')
  specification = request(lock['specificationUrl'], token).decode('utf-8', errors='replace')
  marker = rf'The current version is\s*<em>{re.escape(lock["currentDialect"])}</em>'
  if not re.search(marker, specification):
    errors.append(f'JSON Schema current dialect changed or could not be confirmed: {lock["currentDialect"]}')
  for url, expected in lock['metaSchemas'].items():
    if sha384_sri(request(url, token)) != expected:
      errors.append(f'official JSON Schema meta-schema changed: {url}')
  ietf = json.loads(request(lock['ietfDraft']['apiUrl'], token))
  if ietf.get('name') != lock['ietfDraft']['name'] \
      or ietf.get('rev') != lock['ietfDraft']['revision'] \
      or str(ietf.get('time', ''))[:10] != lock['ietfDraft']['updated'] \
      or ietf.get('rfc') is not None:
    errors.append('JSON Schema IETF draft revision or publication state changed: '
                  f'reviewed {lock["ietfDraft"]["revision"]}, received {ietf.get("rev", "unknown")}')
  errors.extend(run_pinned_corpus(lock, token))
  return errors


def main() -> int:
  parser = argparse.ArgumentParser(description='Validate the JSON Schema official test suite pin.')
  parser.add_argument('--run-pinned', action='store_true',
                      help='download, verify, and run the pinned official corpus')
  parser.add_argument('--check-latest', action='store_true',
                      help='compare the suite branch with the reviewed state')
  args = parser.parse_args()
  try:
    lock = load_lock()
    print(f'JSON Schema lock is valid: {lock["supportedCases"]} supported official cases.')
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN', '')
    errors = check_remote(lock, token) if args.check_latest else (
      run_pinned_corpus(lock, token) if args.run_pinned else []
    )
    if errors:
      print('JSON Schema standards review failed:')
      for error in errors:
        print(f'- {error}')
      return 1
    if args.check_latest:
      print('Latest JSON Schema dialect, meta-schemas, IETF draft, suite, and pinned cases are current.')
    elif args.run_pinned:
      print('All pinned supported JSON Schema cases passed.')
    return 0
  except (OSError, ValueError, KeyError, json.JSONDecodeError, tarfile.TarError) as error:
    print(f'JSON Schema standards audit failed: {error}')
    return 1


if __name__ == '__main__':
  raise SystemExit(main())
