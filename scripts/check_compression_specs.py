#!/usr/bin/env python3
"""Validate compression sources and detect upstream documentation/security changes."""

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
from generate_brotli_data import validate_local as validate_brotli_data


ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / 'scripts' / 'compression-spec-lock.json'
USER_AGENT = 'W-Tools compression standards audit (https://github.com/movingwoo/wtools)'
SRI_PATTERN = re.compile(r'^sha384-[A-Za-z0-9+/]{64}$')
COMMIT_PATTERN = re.compile(r'^[0-9a-f]{40}$')
MAX_REVIEW_AGE = timedelta(days=120)
FORMATS = ['brotli', 'deflate', 'deflate-raw', 'gzip']
RFC_FORMATS = {'1950': 'zlib', '1951': 'deflate', '1952': 'gzip', '7932': 'brotli',
               '9841': 'shared-brotli', '8878': 'zstd', '9659': 'zstd-http'}
ZSTD_RFCS = {'8878', '9659'}
BROTLI_UPSTREAM_URLS = {
  'rfcMetadata': 'https://www.rfc-editor.org/rfc/rfc7932.json',
  'releases': 'https://api.github.com/repos/google/brotli/releases?per_page=100',
  'advisories': 'https://api.github.com/repos/google/brotli/security-advisories?per_page=100',
}
ZIP_SPEC_URL = 'https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT'
ZIP_FEATURES = ['stored', 'deflate', 'data-descriptor', 'utf-8', 'unicode-path-extra-field']
LZMA_SPEC_URL = 'https://www.7-zip.org/a/lzma-specification.7z'
LZMA_FEATURES = ['lzma-alone', 'known-size', 'end-marker', 'lc-0-8', 'lp-0-4', 'pb-0-4']
LZMA_UPSTREAM_URLS = {
  'sdkPage': 'https://www.7-zip.org/sdk.html',
  'releaseHistory': 'https://www.7-zip.org/history.txt',
  'containerDescription': 'https://raw.githubusercontent.com/tukaani-project/xz/master/doc/lzma-file-format.txt',
  'xzSecurity': 'https://tukaani.org/xz/',
}
PHASE3_SOURCE_URLS = {
  'zstd': 'https://www.rfc-editor.org/rfc/rfc8878.txt',
  'lz4Frame': 'https://raw.githubusercontent.com/lz4/lz4/dev/doc/lz4_Frame_format.md',
  'lz4Block': 'https://raw.githubusercontent.com/lz4/lz4/dev/doc/lz4_Block_format.md',
  'bzip2': 'https://sourceware.org/bzip2/manual/manual.html',
  'bzip2Random': 'https://raw.githubusercontent.com/libarchive/bzip2/bzip2-1.0.8/randtable.c',
}
PHASE3_METADATA_RFCS = {'zstdRfcMetadata': '8878', 'zstdHttpRfcMetadata': '9659'}
PHASE3_UPSTREAM_URLS = {
  'zstdRfcMetadata': 'https://www.rfc-editor.org/rfc/rfc8878.json',
  'zstdHttpRfcMetadata': 'https://www.rfc-editor.org/rfc/rfc9659.json',
  'zstdReleases': 'https://api.github.com/repos/facebook/zstd/releases?per_page=100',
  'zstdAdvisories': 'https://api.github.com/repos/facebook/zstd/security-advisories?per_page=100',
  'zstdChanges': 'https://raw.githubusercontent.com/facebook/zstd/dev/CHANGELOG',
  'lz4Releases': 'https://api.github.com/repos/lz4/lz4/releases?per_page=100',
  'lz4Advisories': 'https://api.github.com/repos/lz4/lz4/security-advisories?per_page=100',
  'lz4Changes': 'https://raw.githubusercontent.com/lz4/lz4/dev/NEWS',
  'bzip2Downloads': 'https://sourceware.org/bzip2/downloads.html',
  'bzip2Changes': 'https://sourceware.org/cgit/bzip2/plain/CHANGES',
  'bzip2Announcements': 'https://sourceware.org/pipermail/bzip2-devel/',
}
MAX_BZIP2_ARCHIVES = 128
MAX_BZIP2_ARCHIVE_BYTES = 4 * 1024 * 1024
MAX_BZIP2_TOTAL_BYTES = 16 * 1024 * 1024


def load_lock(path: Path = LOCK_PATH) -> dict:
  data = json.loads(path.read_text(encoding='utf-8'))
  validate_lock(data)
  return data


def validate_lock(data: dict) -> None:
  if set(data) != {'standard', 'wpt', 'rfcs', 'zip', 'lzma', 'brotli', 'phase3',
                   'phase3Upstream', 'reviewed'}:
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
    fields = {'format', 'url', 'sha384', 'errataUrl', 'errata'}
    if number in ZSTD_RFCS:
      fields.add('errataSha384')
    if set(entry) != fields \
        or entry['format'] != expected_format \
        or entry['url'] != f'https://www.rfc-editor.org/rfc/rfc{number}.txt' \
        or entry['errataUrl'] != f'https://www.rfc-editor.org/errata/rfc{number}' \
        or not SRI_PATTERN.fullmatch(entry['sha384']) \
        or not isinstance(entry['errata'], list):
      raise ValueError(f'RFC {number} source inventory is invalid')
    if number in ZSTD_RFCS and not SRI_PATTERN.fullmatch(entry['errataSha384']):
      raise ValueError(f'RFC {number} full errata snapshot is invalid')
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

  lzma_spec = data['lzma']
  if set(lzma_spec) != {'version', 'url', 'sha384', 'supported', 'upstream'} \
      or lzma_spec['version'] != '2015-06-14' or lzma_spec['url'] != LZMA_SPEC_URL \
      or not SRI_PATTERN.fullmatch(lzma_spec['sha384']) \
      or lzma_spec['supported'] != LZMA_FEATURES:
    raise ValueError('LZMA specification source inventory is invalid')
  if not isinstance(lzma_spec['upstream'], dict) or set(lzma_spec['upstream']) != set(LZMA_UPSTREAM_URLS):
    raise ValueError('LZMA upstream source inventory is invalid')
  for name, url in LZMA_UPSTREAM_URLS.items():
    source = lzma_spec['upstream'][name]
    if set(source) != {'url', 'sha384'} or source['url'] != url \
        or not SRI_PATTERN.fullmatch(source['sha384']):
      raise ValueError(f'LZMA upstream {name} source pin is invalid')

  brotli = data['brotli']
  if set(brotli) != {'supported', 'upstream'} or brotli['supported'] != ['rfc7932'] \
      or not isinstance(brotli['upstream'], dict) or set(brotli['upstream']) != set(BROTLI_UPSTREAM_URLS):
    raise ValueError('Brotli upstream source inventory or supported scope is invalid')
  for name, url in BROTLI_UPSTREAM_URLS.items():
    source = brotli['upstream'][name]
    if set(source) != {'url', 'sha384'} or source['url'] != url \
        or not SRI_PATTERN.fullmatch(source['sha384']):
      raise ValueError(f'Brotli upstream {name} source pin is invalid')

  if not isinstance(data['phase3'], dict) or set(data['phase3']) != set(PHASE3_SOURCE_URLS):
    raise ValueError('Phase 3 compression source inventory is invalid')
  for name, url in PHASE3_SOURCE_URLS.items():
    source = data['phase3'][name]
    if not isinstance(source, dict) or set(source) != {'url', 'sha384'} \
        or source['url'] != url or not isinstance(source['sha384'], str) \
        or not SRI_PATTERN.fullmatch(source['sha384']):
      raise ValueError(f'Phase 3 compression {name} source pin is invalid')

  if not isinstance(data['phase3Upstream'], dict) or set(data['phase3Upstream']) != set(PHASE3_UPSTREAM_URLS):
    raise ValueError('Phase 3 upstream source inventory is invalid')
  for name, url in PHASE3_UPSTREAM_URLS.items():
    source = data['phase3Upstream'][name]
    if not isinstance(source, dict) or set(source) != {'url', 'sha384'} \
        or source['url'] != url or not isinstance(source['sha384'], str) \
        or not SRI_PATTERN.fullmatch(source['sha384']):
      raise ValueError(f'Phase 3 upstream {name} source pin is invalid')

  try:
    reviewed = date.fromisoformat(data['reviewed'])
  except (TypeError, ValueError):
    raise ValueError('compression review date must use YYYY-MM-DD') from None
  today = date.today()
  if reviewed > today or today - reviewed > MAX_REVIEW_AGE:
    raise ValueError('compression standards review date is stale')


def request(url: str, max_bytes: int | None = None) -> bytes:
  headers = {'User-Agent': USER_AGENT}
  with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
    data = response.read() if max_bytes is None else response.read(max_bytes + 1)
    if max_bytes is not None and len(data) > max_bytes:
      raise ValueError(f'Official source exceeds {max_bytes} bytes: {url}')
    return data


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
    errata_source = request(entry['errataUrl'])
    errata = parse_errata(errata_source, number)
    if errata != entry['errata']:
      errors.append(f'RFC {number} errata changed: reviewed {entry["errata"]}, received {errata}')
    if number in ZSTD_RFCS and sha384_sri(errata_source) != entry['errataSha384']:
      errors.append(f'RFC {number} full errata text changed; review corrections before updating the pin')
  if sha384_sri(request(lock['zip']['url'])) != lock['zip']['sha384']:
    errors.append('ZIP APPNOTE source SHA-384 changed')
  if sha384_sri(request(lock['lzma']['url'])) != lock['lzma']['sha384']:
    errors.append('LZMA specification bundle SHA-384 changed')
  errors.extend(check_phase3_sources(lock))
  return errors


def check_phase3_sources(lock: dict) -> list[str]:
  # Hash full official documents, including mutable LZ4/bzip2 documentation.
  # Changes require applicability review before replacing a reviewed source pin.
  errors = []
  for name, source in lock['phase3'].items():
    if sha384_sri(request(source['url'])) != source['sha384']:
      errors.append(f'Phase 3 compression {name} source SHA-384 changed: {source["url"]}; '
                    'review format applicability and rerun codec vectors before updating the pin')
  return errors


def check_lzma_upstream(lock: dict) -> list[str]:
  # Hash complete, mutable official documents: this also detects edited advisories,
  # new specification URLs, and removed content without depending on HTML structure.
  # A mismatch is a human review gate, never evidence that our JS codec is affected.
  errors = []
  for name, source in lock['lzma']['upstream'].items():
    if sha384_sri(request(source['url'])) != source['sha384']:
      errors.append(f'LZMA upstream {name} changed: {source["url"]}; '
                    'review format/security applicability and rerun LZMA vectors before updating the pin')
  return errors


def upstream_snapshot(name: str, raw: bytes, rfc: str) -> bytes:
  """Normalize official metadata without hashing volatile download counters."""
  data = json.loads(raw)
  if name == 'rfcMetadata':
    if not isinstance(data, dict) or data.get('doc_id') != f'RFC{rfc}' \
        or any(not isinstance(data.get(field), list) for field in ('updated_by', 'obsoleted_by')):
      raise ValueError(f'RFC {rfc} metadata structure changed')
  elif name in {'releases', 'advisories'}:
    if not isinstance(data, list) or len(data) >= 100:
      raise ValueError(f'Upstream {name} response is invalid or needs pagination review')
    if name == 'releases':
      fields = ['id', 'tag_name', 'name', 'published_at', 'updated_at', 'prerelease', 'body']
      if not data or any(not isinstance(item, dict) or not set(fields) <= set(item) for item in data):
        raise ValueError('Upstream release metadata structure changed')
      # Include old release bodies: security corrections can edit an older notice.
      data = sorted(({field: item[field] for field in fields} for item in data), key=lambda item: item['id'])
    else:
      if any(not isinstance(item, dict) or not isinstance(item.get('ghsa_id'), str) for item in data):
        raise ValueError('Upstream security advisory structure changed')
      data = sorted(data, key=lambda item: item['ghsa_id'])
  else:
    raise ValueError(f'Unknown upstream snapshot: {name}')
  return json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def brotli_snapshot(name: str, raw: bytes) -> bytes:
  return upstream_snapshot(name, raw, '7932')


def bzip2_announcements_snapshot(raw: bytes) -> bytes:
  """Include old public notices, not only the index or the current quarter."""
  text = raw.decode('utf-8')
  archives = re.findall(r'href=["\']([^"\']+\.txt(?:\.gz)?)["\']', text, re.IGNORECASE)
  if 'bzip2-devel' not in text or not archives or len(archives) > MAX_BZIP2_ARCHIVES \
      or any(not re.fullmatch(r'\d{4}q[1-4]\.txt\.gz', name) for name in archives) \
      or len(set(archives)) != len(archives):
    raise ValueError('Bzip2 announcement archive index changed or needs pagination review')
  digest = hashlib.sha384()
  # Preserve the index too: a newly introduced archive-link format must trigger
  # review even while older, recognized quarter links remain on the page.
  digest.update(raw + b'\0')
  total = 0
  for name in sorted(archives):
    # The plain-text counterpart has identical messages without gzip timestamps.
    path = name.removesuffix('.gz')
    content = request(PHASE3_UPSTREAM_URLS['bzip2Announcements'] + path,
                      max_bytes=min(MAX_BZIP2_ARCHIVE_BYTES, MAX_BZIP2_TOTAL_BYTES - total))
    total += len(content)
    if not content.startswith(b'From ') or b'\nSubject:' not in content:
      raise ValueError(f'Bzip2 announcement archive is empty or not a mailbox: {path}')
    digest.update(path.encode('ascii') + b'\0' + content + b'\0')
  return digest.digest()


def phase3_snapshot(name: str, raw: bytes) -> bytes:
  if name in PHASE3_METADATA_RFCS:
    return upstream_snapshot('rfcMetadata', raw, PHASE3_METADATA_RFCS[name])
  if name.endswith('Releases'):
    return upstream_snapshot('releases', raw, '')
  if name.endswith('Advisories'):
    return upstream_snapshot('advisories', raw, '')
  if name in {'bzip2Downloads', 'bzip2Changes', 'zstdChanges', 'lz4Changes'}:
    return raw
  if name == 'bzip2Announcements':
    return bzip2_announcements_snapshot(raw)
  raise ValueError(f'Unknown Phase 3 upstream snapshot: {name}')


def check_phase3_upstream(lock: dict) -> list[str]:
  errors = []
  for name, source in lock['phase3Upstream'].items():
    snapshot = phase3_snapshot(name, request(source['url']))
    if sha384_sri(snapshot) != source['sha384']:
      errors.append(f'Phase 3 upstream {name} changed: {source["url"]}; '
                    'review RFC/format/security applicability and rerun codec vectors before updating the pin')
  return errors


def check_brotli_upstream(lock: dict) -> list[str]:
  errors = []
  for name, source in lock['brotli']['upstream'].items():
    snapshot = brotli_snapshot(name, request(source['url']))
    if sha384_sri(snapshot) != source['sha384']:
      errors.append(f'Brotli upstream {name} changed: {source["url"]}; '
                    'review RFC/encoder/decoder applicability and rerun Brotli vectors before updating the pin')
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
  errors.extend(check_lzma_upstream(lock))
  errors.extend(check_brotli_upstream(lock))
  errors.extend(check_phase3_upstream(lock))
  return errors


def main() -> int:
  parser = argparse.ArgumentParser(
    description='Validate Compression Standard, WPT, RFC, ZIP, LZMA, Zstd, bzip2, and LZ4 source pins.')
  parser.add_argument('--run-pinned', action='store_true',
                      help='download and verify every pinned official source')
  parser.add_argument('--check-latest', action='store_true',
                      help='compare standards/WPT commits and codec RFC/release/security snapshots')
  args = parser.parse_args()
  try:
    lock = load_lock()
    validate_brotli_data()
    print('Compression standards lock is valid: WHATWG '
          f'{lock["standard"]["commit"][:12]}, {len(lock["wpt"]["files"])} WPT files, '
          f'RFC {"/".join(lock["rfcs"])}, ZIP APPNOTE {lock["zip"]["version"]}, '
          f'LZMA {lock["lzma"]["version"]}, {len(lock["phase3"])} Zstd/bzip2/LZ4 sources.')
    errors = check_latest(lock) if args.check_latest else (
      check_pinned(lock) if args.run_pinned else []
    )
    if errors:
      print('Compression standards review failed:', file=sys.stderr)
      for error in errors:
        print(f'- {error}', file=sys.stderr)
      return 1
    if args.check_latest:
      print('Latest Compression Standard, WPT, RFC, ZIP APPNOTE, LZMA, Zstd, bzip2, and LZ4 sources are current; '
            'LZMA/XZ, Brotli, and Zstd/bzip2/LZ4 RFC/release/security snapshots are unchanged.')
    elif args.run_pinned:
      print('All pinned Compression Standard, WPT, RFC, ZIP APPNOTE, LZMA, Zstd, bzip2, and LZ4 sources and errata are intact.')
    return 0
  except (json.JSONDecodeError, KeyError, OSError, ValueError, urllib.error.URLError) as error:
    print(f'Compression standards audit failed: {error}', file=sys.stderr)
    return 1


if __name__ == '__main__':
  raise SystemExit(main())
