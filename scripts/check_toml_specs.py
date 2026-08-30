#!/usr/bin/env python3
"""Validate the pinned TOML specification and official test-suite corpus."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / 'scripts' / 'toml-test-lock.json'
SRI_PATTERN = re.compile(r'^sha384-[A-Za-z0-9+/]{64}$')
CASE_PATTERN = re.compile(r'^[a-z0-9-]+(?:/[a-z0-9-]+)+$')
USER_AGENT = 'W-Tools TOML standards audit (https://github.com/movingwoo/wtools)'


def load_lock(path: Path = LOCK_PATH) -> dict:
  data = json.loads(path.read_text(encoding='utf-8'))
  validate_lock(data)
  return data


def validate_lock(data: dict) -> None:
  required = {
    'specVersion', 'specUrl', 'specRepository', 'specTag', 'specCommit',
    'latestSpecVersion', 'latestSpecTag', 'latestSpecCommit',
    'suiteRepository', 'suiteTag', 'suiteCommit', 'archiveUrl', 'archiveSha384',
    'caseList', 'validCases', 'invalidCases', 'byteInvalidCases',
    'compatibilityOracle', 'compatibilityVersions', 'reviewed',
  }
  if set(data) != required:
    raise ValueError('TOML lock fields differ from the required schema')
  if (data['specVersion'] != '1.0.0' or data['specVersion'] not in data['specUrl']
      or data['specRepository'] != 'toml-lang/toml' or data['specTag'] != '1.0.0'
      or not re.fullmatch(r'[0-9a-f]{40}', data['specCommit'])):
    raise ValueError('TOML specification version, repository, tag, or commit is invalid')
  if (data['latestSpecVersion'] != data['latestSpecTag']
      or not re.fullmatch(r'\d+\.\d+\.\d+', data['latestSpecVersion'])
      or not re.fullmatch(r'[0-9a-f]{40}', data['latestSpecCommit'])):
    raise ValueError('latest reviewed TOML specification fields are invalid')
  if (data['suiteRepository'] != 'toml-lang/toml-test'
      or data['suiteTag'] not in data['archiveUrl']
      or not re.fullmatch(r'[0-9a-f]{40}', data['suiteCommit'])
      or not SRI_PATTERN.fullmatch(data['archiveSha384'])):
    raise ValueError('TOML Test Suite repository, tag, commit, URL, or hash is invalid')
  if (data['caseList'] != 'tests/files-toml-1.0.0'
      or data['validCases'] != 205 or data['invalidCases'] != 474):
    raise ValueError('TOML Test Suite case inventory is invalid')
  cases = data['byteInvalidCases']
  if (not cases or cases != sorted(cases) or len(cases) != len(set(cases))
      or not all(CASE_PATTERN.fullmatch(item) for item in cases)):
    raise ValueError('TOML byteInvalidCases inventory is invalid')
  if (data['compatibilityOracle'] != 'smol-toml'
      or data['compatibilityVersions'] != ['1.6.1', '1.8.0']):
    raise ValueError('TOML compatibility oracle versions are invalid')


def request(url: str, token: str = '') -> bytes:
  headers = {'Accept': 'application/vnd.github+json', 'User-Agent': USER_AGENT}
  if token and urllib.parse.urlsplit(url).hostname == 'api.github.com':
    headers['Authorization'] = f'Bearer {token}'
  with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
    return response.read()


def sha384_sri(data: bytes) -> str:
  return 'sha384-' + base64.b64encode(hashlib.sha384(data).digest()).decode('ascii')


def resolve_tag_commit(repository: str, tag: str, token: str = '') -> str:
  target = json.loads(request(
    f'https://api.github.com/repos/{repository}/git/ref/tags/{tag}', token
  )).get('object', {})
  if target.get('type') == 'tag':
    target = json.loads(request(
      f'https://api.github.com/repos/{repository}/git/tags/{target.get("sha")}', token
    )).get('object', {})
  return target.get('sha', '')


def latest_tag(repository: str, pattern: re.Pattern[str], token: str = '') -> str:
  tags = json.loads(request(f'https://api.github.com/repos/{repository}/tags?per_page=100', token))
  names = [item.get('name', '') for item in tags if pattern.fullmatch(item.get('name', ''))]
  if not names:
    raise ValueError(f'no release tags found for {repository}')
  return max(names, key=lambda name: tuple(int(part) for part in re.findall(r'\d+', name)))


def check_remote(lock: dict, token: str = '') -> list[str]:
  errors = []
  latest_spec = latest_tag(lock['specRepository'], re.compile(r'\d+\.\d+\.\d+'), token)
  if latest_spec != lock['latestSpecTag']:
    errors.append(f'new TOML specification tag available: reviewed {lock["latestSpecTag"]}, latest {latest_spec}')
  if resolve_tag_commit(lock['specRepository'], lock['specTag'], token) != lock['specCommit']:
    errors.append('pinned TOML specification tag changed')
  if resolve_tag_commit(lock['specRepository'], lock['latestSpecTag'], token) != lock['latestSpecCommit']:
    errors.append('latest reviewed TOML specification tag changed')
  latest_suite = latest_tag(lock['suiteRepository'], re.compile(r'v\d+\.\d+\.\d+'), token)
  if latest_suite != lock['suiteTag']:
    errors.append(f'new TOML Test Suite tag available: pinned {lock["suiteTag"]}, latest {latest_suite}')
  if resolve_tag_commit(lock['suiteRepository'], lock['suiteTag'], token) != lock['suiteCommit']:
    errors.append('pinned TOML Test Suite tag changed')
  archive = request(lock['archiveUrl'], token)
  if sha384_sri(archive) != lock['archiveSha384']:
    errors.append('official TOML Test Suite archive SHA-384 changed')
    return errors
  with tempfile.TemporaryDirectory(prefix='wtools-toml-suite-') as temporary:
    archive_path = Path(temporary) / 'suite.tar.gz'
    archive_path.write_bytes(archive)
    extract_root = Path(temporary) / 'data'
    extract_root.mkdir()
    with tarfile.open(archive_path, 'r:gz') as bundle:
      members = bundle.getmembers()
      if any(Path(member.name).is_absolute() or '..' in Path(member.name).parts
             or not (member.isfile() or member.isdir()) for member in members):
        errors.append('TOML Test Suite archive contains an unsafe path or entry type')
        return errors
      bundle.extractall(extract_root, members=members)
    roots = [item for item in extract_root.iterdir() if item.is_dir()]
    if len(roots) != 1:
      errors.append('TOML Test Suite archive root is ambiguous')
      return errors
    result = subprocess.run(
      ['node', str(ROOT / 'scripts' / 'run_toml_suite.mjs'), str(roots[0])],
      cwd=ROOT, text=True, capture_output=True, check=False,
    )
    if result.returncode:
      errors.append(result.stderr.strip() or result.stdout.strip() or 'TOML corpus runner failed')
  return errors


def main() -> int:
  parser = argparse.ArgumentParser(description='Validate the TOML specification and test-suite pin.')
  parser.add_argument('--check-latest', '--check-remote', dest='check_latest', action='store_true',
                      help='compare latest official tags and run the pinned downloaded corpus')
  args = parser.parse_args()
  try:
    lock = load_lock()
    rejected = lock['invalidCases'] - len(lock['byteInvalidCases'])
    print(f'TOML lock is valid: TOML {lock["specVersion"]}, '
          f'{lock["validCases"]} valid cases and {rejected} string-level invalid cases.')
    if not args.check_latest:
      return 0
    errors = check_remote(lock, os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN', ''))
    if errors:
      print('TOML standards review failed:')
      for error in errors:
        print(f'- {error}')
      return 1
    print('Latest reviewed TOML specification/test-suite tags and the pinned official corpus are current.')
    return 0
  except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
    print(f'TOML standards audit failed: {error}')
    return 1


if __name__ == '__main__':
  raise SystemExit(main())
