#!/usr/bin/env python3
"""Validate pinned Markdown standards and detect newer stable releases."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / 'scripts' / 'markdown-spec-lock.json'
USER_AGENT = 'W-Tools Markdown standards audit (https://github.com/movingwoo/wtools)'
SRI_PATTERN = re.compile(r'^sha384-[A-Za-z0-9+/]{64}$')


def load_lock(path: Path = LOCK_PATH) -> dict:
  data = json.loads(path.read_text(encoding='utf-8'))
  validate_lock(data)
  return data


def validate_lock(data: dict) -> None:
  if set(data) != {'commonmark', 'gfm'}:
    raise ValueError('lock must contain exactly commonmark and gfm')
  required = {
    'commonmark': {'version', 'releaseRepository', 'releaseUrl', 'vectorsUrl',
                   'vectorsSha384', 'examples', 'format'},
    'gfm': {'version', 'specUrl', 'releaseRepository', 'releaseTag', 'releaseUrl',
            'vectorsUrl', 'vectorsSha384', 'examples', 'format'},
  }
  for name, fields in required.items():
    entry = data[name]
    missing = fields - set(entry)
    if missing:
      raise ValueError(f'{name} is missing: {", ".join(sorted(missing))}')
    if not isinstance(entry['examples'], int) or entry['examples'] < 1:
      raise ValueError(f'{name}.examples must be a positive integer')
    if not SRI_PATTERN.fullmatch(entry['vectorsSha384']):
      raise ValueError(f'{name}.vectorsSha384 is not a SHA-384 SRI value')
    if entry['format'] not in {'json', 'cmark'}:
      raise ValueError(f'{name}.format must be json or cmark')
    for field in fields - {'examples'}:
      if not isinstance(entry[field], str) or not entry[field]:
        raise ValueError(f'{name}.{field} must be a non-empty string')


def request_headers(url: str, token: str = '') -> dict[str, str]:
  headers = {'Accept': 'application/vnd.github+json', 'User-Agent': USER_AGENT}
  if token and urllib.parse.urlsplit(url).hostname == 'api.github.com':
    headers['Authorization'] = f'Bearer {token}'
  return headers


def request_bytes(url: str, token: str = '') -> bytes:
  headers = request_headers(url, token)
  request = urllib.request.Request(url, headers=headers)
  with urllib.request.urlopen(request, timeout=30) as response:
    return response.read()


def request_json(url: str, token: str = '') -> dict:
  return json.loads(request_bytes(url, token))


def sha384_sri(data: bytes) -> str:
  digest = hashlib.sha384(data).digest()
  return 'sha384-' + base64.b64encode(digest).decode('ascii')


def count_examples(data: bytes, kind: str) -> int:
  if kind == 'json':
    parsed = json.loads(data)
    if not isinstance(parsed, list):
      raise ValueError('CommonMark vector source must be a JSON array')
    return len(parsed)
  return len(re.findall(rb'^`{32} example$', data, re.MULTILINE))


def latest_release(repository: str, token: str = '') -> str:
  release = request_json(f'https://api.github.com/repos/{repository}/releases/latest', token)
  tag = release.get('tag_name')
  if not isinstance(tag, str) or not tag:
    raise ValueError(f'{repository} latest release has no tag_name')
  return tag


def check_latest(lock: dict, token: str = '') -> list[str]:
  errors = []
  expected_releases = {
    'commonmark': lock['commonmark']['version'],
    'gfm': lock['gfm']['releaseTag'],
  }
  for name, entry in lock.items():
    latest = latest_release(entry['releaseRepository'], token)
    if latest != expected_releases[name]:
      errors.append(f'{name}: pinned {expected_releases[name]}, latest {latest}')
    vectors = request_bytes(entry['vectorsUrl'], token)
    digest = sha384_sri(vectors)
    if digest != entry['vectorsSha384']:
      errors.append(f'{name}: vector SHA-384 changed')
    examples = count_examples(vectors, entry['format'])
    if examples != entry['examples']:
      errors.append(f'{name}: expected {entry["examples"]} examples, received {examples}')

  gfm_page = request_bytes(lock['gfm']['specUrl'], token).decode('utf-8', errors='replace')
  if f'Version {lock["gfm"]["version"]}' not in gfm_page:
    errors.append(f'gfm: official page no longer identifies Version {lock["gfm"]["version"]}')
  return errors


def main() -> int:
  parser = argparse.ArgumentParser(description='Validate Markdown standard pins and latest releases.')
  parser.add_argument('--check-latest', action='store_true', help='fetch official sources and compare releases')
  args = parser.parse_args()
  try:
    lock = load_lock()
    print('Markdown standard lock is valid: CommonMark '
          f'{lock["commonmark"]["version"]}, GFM {lock["gfm"]["version"]}.')
    if not args.check_latest:
      return 0
    errors = check_latest(lock, os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN', ''))
    if errors:
      print('Markdown standard update review required:', file=sys.stderr)
      for error in errors:
        print(f'- {error}', file=sys.stderr)
      return 1
    print('Pinned Markdown releases, vector hashes, and example counts are current.')
    return 0
  except (json.JSONDecodeError, KeyError, OSError, ValueError, urllib.error.URLError) as error:
    print(f'Markdown standards audit failed: {error}', file=sys.stderr)
    return 1


if __name__ == '__main__':
  raise SystemExit(main())
