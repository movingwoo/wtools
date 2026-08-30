#!/usr/bin/env python3
"""Validate the pinned YAML specification and official test-suite corpus."""

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
LOCK_PATH = ROOT / 'scripts' / 'yaml-test-suite-lock.json'
SRI_PATTERN = re.compile(r'^sha384-[A-Za-z0-9+/]{64}$')
USER_AGENT = 'W-Tools YAML standards audit (https://github.com/movingwoo/wtools)'


def load_lock(path: Path = LOCK_PATH) -> dict:
  data = json.loads(path.read_text(encoding='utf-8'))
  validate_lock(data)
  return data


def validate_lock(data: dict) -> None:
  required = {
    'specVersion', 'specUrl', 'specRepository', 'specTag', 'specCommit',
    'suiteRepository', 'suiteTag', 'suiteCommit', 'archiveUrl', 'archiveSha384',
    'suiteCases', 'comparableValidCases', 'invalidCases', 'supportedValidCases', 'reviewed',
  }
  if set(data) != required:
    raise ValueError('YAML lock fields differ from the required schema')
  if data['specVersion'] != '1.2.2' or data['specVersion'] not in data['specUrl']:
    raise ValueError('YAML specification version and URL must identify 1.2.2')
  if (data['specRepository'] != 'yaml/yaml-spec' or data['specTag'] != data['specVersion']
      or not re.fullmatch(r'[0-9a-f]{40}', data['specCommit'])):
    raise ValueError('YAML specification repository, tag, or commit is invalid')
  if data['suiteRepository'] != 'yaml/yaml-test-suite':
    raise ValueError('YAML Test Suite must use the official yaml/yaml-test-suite repository')
  if data['suiteTag'] not in data['archiveUrl'] or not re.fullmatch(r'[0-9a-f]{40}', data['suiteCommit']):
    raise ValueError('YAML Test Suite tag, archive URL, or commit is invalid')
  if not SRI_PATTERN.fullmatch(data['archiveSha384']):
    raise ValueError('YAML Test Suite archive SHA-384 is invalid')
  cases = data['supportedValidCases']
  if (data['suiteCases'] != 402 or data['comparableValidCases'] != 279
      or data['invalidCases'] != 94 or data['suiteCases'] < len(cases)
      or len(cases) != len(set(cases)) or cases != sorted(cases)
      or not all(re.fullmatch(r'[A-Z0-9]{4}(?:/[0-9]{2,3})?', item) for item in cases)):
    raise ValueError('YAML Test Suite case inventory is invalid')


def request(url: str, token: str = '') -> bytes:
  headers = {'Accept': 'application/vnd.github+json', 'User-Agent': USER_AGENT}
  if token and urllib.parse.urlsplit(url).hostname == 'api.github.com':
    headers['Authorization'] = f'Bearer {token}'
  with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
    return response.read()


def sha384_sri(data: bytes) -> str:
  return 'sha384-' + base64.b64encode(hashlib.sha384(data).digest()).decode('ascii')


def resolve_tag_commit(repository: str, tag: str, token: str = '') -> str:
  tag_url = f'https://api.github.com/repos/{repository}/git/ref/tags/{tag}'
  target = json.loads(request(tag_url, token)).get('object', {})
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
  if latest_spec != lock['specTag']:
    errors.append(f'new YAML specification tag available: pinned {lock["specTag"]}, latest {latest_spec}')
  spec_commit = resolve_tag_commit(lock['specRepository'], lock['specTag'], token)
  if spec_commit != lock['specCommit']:
    errors.append(f'spec commit changed: expected {lock["specCommit"]}, received {spec_commit}')
  repository = lock['suiteRepository']
  latest_suite = latest_tag(repository, re.compile(r'data-\d{4}-\d{2}-\d{2}'), token)
  if latest_suite != lock['suiteTag']:
    errors.append(f'new YAML Test Suite tag available: pinned {lock["suiteTag"]}, latest {latest_suite}')
  suite_commit = resolve_tag_commit(repository, lock['suiteTag'], token)
  if suite_commit != lock['suiteCommit']:
    errors.append(f'suite commit changed: expected {lock["suiteCommit"]}, received {suite_commit}')
  archive = request(lock['archiveUrl'], token)
  if sha384_sri(archive) != lock['archiveSha384']:
    errors.append('official YAML Test Suite archive SHA-384 changed')
    return errors
  with tempfile.TemporaryDirectory(prefix='wtools-yaml-suite-') as temporary:
    archive_path = Path(temporary) / 'suite.tar.gz'
    archive_path.write_bytes(archive)
    extract_root = Path(temporary) / 'data'
    extract_root.mkdir()
    with tarfile.open(archive_path, 'r:gz') as bundle:
      members = bundle.getmembers()
      if any(Path(member.name).is_absolute() or '..' in Path(member.name).parts
             or not (member.isfile() or member.isdir() or member.issym() or member.islnk())
             for member in members):
        errors.append('YAML Test Suite archive contains an unsafe path')
        return errors
      # The corpus includes convenience symlink indexes under name/ and tags/; the
      # ID directories used by the runner contain only regular files.
      bundle.extractall(extract_root, members=[member for member in members
                                              if member.isfile() or member.isdir()])
    roots = [item for item in extract_root.iterdir() if item.is_dir()]
    if len(roots) != 1:
      errors.append('YAML Test Suite archive root is ambiguous')
      return errors
    result = subprocess.run(
      ['node', str(ROOT / 'scripts' / 'run_yaml_suite.mjs'), str(roots[0])],
      cwd=ROOT, text=True, capture_output=True, check=False,
    )
    if result.returncode:
      errors.append(result.stderr.strip() or result.stdout.strip() or 'YAML corpus runner failed')
  return errors


def main() -> int:
  parser = argparse.ArgumentParser(description='Validate the YAML specification and test-suite pin.')
  parser.add_argument('--check-latest', action='store_true', help='compare latest official tags and run the pinned corpus')
  args = parser.parse_args()
  try:
    lock = load_lock()
    print(f'YAML lock is valid: YAML {lock["specVersion"]}, '
          f'{len(lock["supportedValidCases"])} supported valid cases and {lock["invalidCases"]} invalid cases.')
    if not args.check_latest:
      return 0
    errors = check_remote(lock, os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN', ''))
    if errors:
      print('YAML standards review failed:')
      for error in errors:
        print(f'- {error}')
      return 1
    print('Latest YAML specification/test-suite tags and the pinned official corpus are current.')
    return 0
  except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
    print(f'YAML standards audit failed: {error}')
    return 1


if __name__ == '__main__':
  raise SystemExit(main())
