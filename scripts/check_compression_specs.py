#!/usr/bin/env python3
"""Validate pinned Compression Standard, WPT, and RFC sources."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / 'scripts' / 'compression-spec-lock.json'
USER_AGENT = 'W-Tools compression standards audit (https://github.com/movingwoo/wtools)'
SRI_PATTERN = re.compile(r'^sha384-[A-Za-z0-9+/]{64}$')
COMMIT_PATTERN = re.compile(r'^[0-9a-f]{40}$')
MAX_REVIEW_AGE = timedelta(days=120)
FORMATS = ['brotli', 'deflate', 'deflate-raw', 'gzip']
RFC_FORMATS = {'1950': 'zlib', '1951': 'deflate', '1952': 'gzip'}
ZIP_SPEC_URL = 'https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT'
ZIP_FEATURES = ['stored', 'deflate', 'data-descriptor', 'utf-8', 'unicode-path-extra-field']


def load_lock(path: Path = LOCK_PATH) -> dict:
  data = json.loads(path.read_text(encoding='utf-8'))
  validate_lock(data)
  return data


def validate_lock(data: dict) -> None:
  if set(data) != {'standard', 'wpt', 'rfcs', 'zip', 'reviewed'}:
    raise ValueError('compression lock fields differ from the required schema')

  standard = data['standard']
  if set(standard) != {
      'repository', 'branch', 'commit', 'feedUrl', 'sourceUrl', 'sourceSha384', 'formats'}:
    raise ValueError('Compression Standard lock fields are invalid')
  if standard['repository'] != 'whatwg/compression' or standard['branch'] != 'main' \
      or not COMMIT_PATTERN.fullmatch(standard['commit']) \
      or standard['feedUrl'] != 'https://github.com/whatwg/compression/commits/main.atom' \
      or standard['sourceUrl'] != (
        f'https://raw.githubusercontent.com/whatwg/compression/{standard["commit"]}/index.bs') \
      or not SRI_PATTERN.fullmatch(standard['sourceSha384']) \
      or standard['formats'] != FORMATS:
    raise ValueError('Compression Standard source inventory is invalid')

  wpt = data['wpt']
  if set(wpt) != {
      'repository', 'branch', 'path', 'commit', 'feedUrl', 'rawBaseUrl', 'files',
      'aggregateSha384'}:
    raise ValueError('Compression WPT lock fields are invalid')
  if wpt['repository'] != 'web-platform-tests/wpt' or wpt['branch'] != 'master' \
      or wpt['path'] != 'compression' or not COMMIT_PATTERN.fullmatch(wpt['commit']) \
      or wpt['feedUrl'] != (
        'https://github.com/web-platform-tests/wpt/commits/master/compression.atom') \
      or wpt['rawBaseUrl'] != (
        f'https://raw.githubusercontent.com/web-platform-tests/wpt/{wpt["commit"]}/compression/') \
      or not isinstance(wpt['files'], list) or len(wpt['files']) < 1 \
      or wpt['files'] != sorted(set(wpt['files'])) \
      or any(not isinstance(name, str) or not name or name.startswith(('/', '../'))
             or '/..' in name for name in wpt['files']) \
      or not SRI_PATTERN.fullmatch(wpt['aggregateSha384']):
    raise ValueError('Compression WPT source inventory is invalid')

  if set(data['rfcs']) != set(RFC_FORMATS):
    raise ValueError('compression RFC inventory is invalid')
  for number, expected_format in RFC_FORMATS.items():
    entry = data['rfcs'][number]
    if set(entry) != {'format', 'url', 'sha384', 'errataUrl', 'errata'} \
        or entry['format'] != expected_format \
        or entry['url'] != f'https://www.rfc-editor.org/rfc/rfc{number}.txt' \
        or entry['errataUrl'] != f'https://www.rfc-editor.org/errata/rfc{number}' \
        or not SRI_PATTERN.fullmatch(entry['sha384']) \
        or not isinstance(entry['errata'], list):
      raise ValueError(f'RFC {number} source inventory is invalid')
    normalized_errata = []
    for erratum in entry['errata']:
      if set(erratum) != {'id', 'status'} or not isinstance(erratum['id'], int) \
          or erratum['id'] < 1 or erratum['status'] not in {
            'Reported', 'Verified', 'Held for Document Update', 'Rejected'}:
        raise ValueError(f'RFC {number} errata inventory is invalid')
      normalized_errata.append((erratum['id'], erratum['status']))
    if normalized_errata != sorted(set(normalized_errata)):
      raise ValueError(f'RFC {number} errata inventory is not sorted or contains duplicates')

  zip_spec = data['zip']
  if set(zip_spec) != {'version', 'status', 'revised', 'url', 'sha384', 'supported'} \
      or zip_spec['version'] != '6.3.10' or zip_spec['status'] != 'FINAL' \
      or zip_spec['revised'] != '2022-11-01' or zip_spec['url'] != ZIP_SPEC_URL \
      or not SRI_PATTERN.fullmatch(zip_spec['sha384']) \
      or zip_spec['supported'] != ZIP_FEATURES:
    raise ValueError('ZIP APPNOTE source inventory is invalid')

  try:
    reviewed = date.fromisoformat(data['reviewed'])
  except (TypeError, ValueError):
    raise ValueError('compression review date must use YYYY-MM-DD') from None
  today = date.today()
  if reviewed > today or today - reviewed > MAX_REVIEW_AGE:
    raise ValueError('compression standards review date is stale')


def request(url: str) -> bytes:
  headers = {'User-Agent': USER_AGENT}
  with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
    return response.read()


def sha384_sri(data: bytes) -> str:
  return 'sha384-' + base64.b64encode(hashlib.sha384(data).digest()).decode('ascii')


def latest_feed_commit(data: bytes) -> str:
  try:
    root = ET.fromstring(data)
  except ET.ParseError as error:
    raise ValueError(f'invalid GitHub commits feed: {error}') from error
  namespace = {'atom': 'http://www.w3.org/2005/Atom'}
  entry = root.find('atom:entry', namespace)
  if entry is None:
    raise ValueError('GitHub commits feed contains no entry')
  for link in entry.findall('atom:link', namespace):
    match = re.fullmatch(r'https://github\.com/[^/]+/[^/]+/commit/([0-9a-f]{40})',
                         link.attrib.get('href', ''))
    if match:
      return match.group(1)
  raise ValueError('GitHub commits feed contains no commit link')


def extract_formats(source: bytes) -> list[str]:
  match = re.search(rb'enum CompressionFormat\s*\{(.*?)\}', source, re.DOTALL)
  if not match:
    return []
  return [value.decode('ascii') for value in re.findall(rb'"([a-z-]+)"', match.group(1))]


def aggregate_wpt(files: list[str], contents: list[bytes]) -> str:
  if len(files) != len(contents):
    raise ValueError('Compression WPT file and content counts differ')
  digest = hashlib.sha384()
  for name, content in zip(files, contents, strict=True):
    digest.update(name.encode('utf-8'))
    digest.update(b'\0')
    digest.update(content)
    digest.update(b'\0')
  return 'sha384-' + base64.b64encode(digest.digest()).decode('ascii')


def parse_errata(data: bytes, expected_rfc: str = '') -> list[dict]:
  text = data.decode('utf-8', errors='replace')
  if expected_rfc and not re.search(
      rf'name="rfc_number" value="{re.escape(expected_rfc)}"', text):
    raise ValueError(f'RFC {expected_rfc} errata page identity could not be confirmed')
  matches = re.findall(
    r'Errata-ID:\s*<a href="/eid(\d+)/">\d+</a>.*?'
    r'<dt class="col-sm-4">Status:</dt>\s*<dd[^>]*>\s*<span[^>]*>([^<]+)</span>',
    text, re.DOTALL,
  )
  if not matches and 'No matching errata found.' not in text:
    raise ValueError('RFC errata page structure could not be confirmed')
  return [
    {'id': int(identifier), 'status': status.strip()}
    for identifier, status in matches
  ]


def check_pinned(lock: dict) -> list[str]:
  errors = []
  standard_source = request(lock['standard']['sourceUrl'])
  if sha384_sri(standard_source) != lock['standard']['sourceSha384']:
    errors.append('WHATWG Compression Standard source SHA-384 changed')
  formats = extract_formats(standard_source)
  if formats != lock['standard']['formats']:
    errors.append(f'Compression Standard format inventory changed: received {formats}')

  wpt_contents = [request(lock['wpt']['rawBaseUrl'] + name) for name in lock['wpt']['files']]
  if aggregate_wpt(lock['wpt']['files'], wpt_contents) != lock['wpt']['aggregateSha384']:
    errors.append('Compression WPT aggregate SHA-384 changed')

  for number, entry in lock['rfcs'].items():
    if sha384_sri(request(entry['url'])) != entry['sha384']:
      errors.append(f'RFC {number} source SHA-384 changed')
    errata = parse_errata(request(entry['errataUrl']), number)
    if errata != entry['errata']:
      errors.append(f'RFC {number} errata changed: reviewed {entry["errata"]}, received {errata}')
  if sha384_sri(request(lock['zip']['url'])) != lock['zip']['sha384']:
    errors.append('ZIP APPNOTE source SHA-384 changed')
  return errors


def check_latest(lock: dict) -> list[str]:
  errors = []
  latest_standard = latest_feed_commit(request(lock['standard']['feedUrl']))
  if latest_standard != lock['standard']['commit']:
    errors.append('Compression Standard changed: '
                  f'reviewed {lock["standard"]["commit"]}, latest {latest_standard}')
  latest_wpt = latest_feed_commit(request(lock['wpt']['feedUrl']))
  if latest_wpt != lock['wpt']['commit']:
    errors.append('Compression WPT changed: '
                  f'reviewed {lock["wpt"]["commit"]}, latest {latest_wpt}')
  errors.extend(check_pinned(lock))
  return errors


def main() -> int:
  parser = argparse.ArgumentParser(
    description='Validate Compression Standard, WPT, and RFC source pins.')
  parser.add_argument('--run-pinned', action='store_true',
                      help='download and verify every pinned official source')
  parser.add_argument('--check-latest', action='store_true',
                      help='compare the standards and WPT feeds with the reviewed commits')
  args = parser.parse_args()
  try:
    lock = load_lock()
    print('Compression standards lock is valid: WHATWG '
          f'{lock["standard"]["commit"][:12]}, {len(lock["wpt"]["files"])} WPT files, '
          f'RFC {"/".join(lock["rfcs"])}, ZIP APPNOTE {lock["zip"]["version"]}.')
    errors = check_latest(lock) if args.check_latest else (
      check_pinned(lock) if args.run_pinned else []
    )
    if errors:
      print('Compression standards review failed:', file=sys.stderr)
      for error in errors:
        print(f'- {error}', file=sys.stderr)
      return 1
    if args.check_latest:
      print('Latest Compression Standard, WPT, RFC, and ZIP APPNOTE sources and errata are current.')
    elif args.run_pinned:
      print('All pinned Compression Standard, WPT, RFC, and ZIP APPNOTE sources and errata are intact.')
    return 0
  except (json.JSONDecodeError, KeyError, OSError, ValueError, urllib.error.URLError) as error:
    print(f'Compression standards audit failed: {error}', file=sys.stderr)
    return 1


if __name__ == '__main__':
  raise SystemExit(main())
