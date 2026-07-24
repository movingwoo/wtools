#!/usr/bin/env python3
"""Validate W-Tools static assets and tool registrations without dependencies."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCAL_REF = re.compile(r"""(?:src|href)=["']([^"'#]+)["']""")
IMPORT_REF = re.compile(r"""^\s*import(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"];?""", re.MULTILINE)
TOOL_REF = re.compile(r"""(?:tool|symTool|pakoTool)\(\s*\{\s*id:\s*'([^']+)'""")
CAT_REF = re.compile(r"""const CAT = '([^']+)';""")


class Validation:
  def __init__(self) -> None:
    self.errors: list[str] = []
    self.checked_files: set[Path] = set()

  def error(self, message: str) -> None:
    self.errors.append(message)

  def require_file(self, path: Path, source: str) -> None:
    path = path.resolve()
    try:
      path.relative_to(ROOT)
    except ValueError:
      self.error(f'{source}: path escapes the repository: {path}')
      return
    if not path.is_file():
      self.error(f'{source}: missing file: {path.relative_to(ROOT)}')
    else:
      self.checked_files.add(path)


def local_path(ref: str, parent: Path) -> Path | None:
  parsed = urllib.parse.urlparse(ref)
  if parsed.scheme or parsed.netloc or ref.startswith(('data:', '#')):
    return None
  return (parent / urllib.parse.unquote(parsed.path)).resolve()


def parse_categories(validation: Validation) -> set[str]:
  source = (ROOT / 'js/core.js').read_text(encoding='utf-8')
  match = re.search(r'export const categories = \[(.*?)\];', source, re.DOTALL)
  if not match:
    validation.error('js/core.js: categories registry not found')
    return set()
  return set(re.findall(r"'([^']+)'", match.group(1)))


def validate_tools(validation: Validation) -> None:
  categories = parse_categories(validation)
  main = (ROOT / 'js/main.js').read_text(encoding='utf-8')
  imported_modules = {
    (ROOT / 'js' / ref).resolve()
    for ref in re.findall(r"""import ['"](\./tools/[^'"]+\.js)['"];""", main)
  }
  tool_modules = set((ROOT / 'js/tools').glob('*.js'))

  for missing in sorted(tool_modules - imported_modules):
    validation.error(f'js/main.js: tool module is not imported: {missing.relative_to(ROOT)}')
  for extra in sorted(imported_modules - tool_modules):
    validation.error(f'js/main.js: imported tool module is missing: {extra.relative_to(ROOT)}')

  ids: list[str] = []
  for path in sorted(tool_modules):
    source = path.read_text(encoding='utf-8')
    match = CAT_REF.search(source)
    if not match:
      validation.error(f'{path.relative_to(ROOT)}: CAT declaration not found')
    elif match.group(1) not in categories:
      validation.error(f'{path.relative_to(ROOT)}: unknown category: {match.group(1)}')

    module_ids = TOOL_REF.findall(source)
    if not module_ids:
      validation.error(f'{path.relative_to(ROOT)}: no tool registrations found')
    for tool_id in module_ids:
      if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', tool_id):
        validation.error(f'{path.relative_to(ROOT)}: invalid tool ID: {tool_id}')
    ids.extend(module_ids)

  for tool_id, count in Counter(ids).items():
    if count > 1:
      validation.error(f'duplicate tool ID: {tool_id} ({count} registrations)')
  print(f'Validated {len(ids)} unique tool registrations across {len(tool_modules)} modules.')


def validate_imports(validation: Validation) -> None:
  for path in sorted((ROOT / 'js').rglob('*.js')):
    source = path.read_text(encoding='utf-8')
    for ref in IMPORT_REF.findall(source):
      if not ref.startswith('.'):
        continue
      target = local_path(ref, path.parent)
      if target:
        validation.require_file(target, str(path.relative_to(ROOT)))


def validate_document_assets(validation: Validation) -> set[Path]:
  index = ROOT / 'index.html'
  for ref in LOCAL_REF.findall(index.read_text(encoding='utf-8')):
    target = local_path(ref, ROOT)
    if target:
      validation.require_file(target, 'index.html')

  manifest_path = ROOT / 'manifest.json'
  try:
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
  except (json.JSONDecodeError, OSError) as error:
    validation.error(f'manifest.json: {error}')
    return set()
  for icon in manifest.get('icons', []):
    target = local_path(icon.get('src', ''), ROOT)
    if target:
      validation.require_file(target, 'manifest.json')
  return validation.checked_files


def validate_app_shell(validation: Validation) -> list[str]:
  source = (ROOT / 'sw.js').read_text(encoding='utf-8')
  match = re.search(r'const APP_SHELL = \[(.*?)\];', source, re.DOTALL)
  if not match:
    validation.error('sw.js: APP_SHELL not found')
    return []

  refs = re.findall(r"'([^']+)'", match.group(1))
  normalized: set[Path] = set()
  for ref in refs:
    if ref == './':
      continue
    target = local_path(ref, ROOT)
    if target:
      validation.require_file(target, 'sw.js APP_SHELL')
      normalized.add(target)

  required = {
    ROOT / 'index.html',
    ROOT / 'manifest.json',
    ROOT / 'sw.js',
    *validation.checked_files,
    *(ROOT / 'js').rglob('*.js'),
  }
  for path in sorted(required - normalized):
    validation.error(f'sw.js APP_SHELL: required local asset is not cached: {path.relative_to(ROOT)}')
  return refs


def validate_http(validation: Validation, base_url: str, refs: list[str]) -> None:
  for ref in refs:
    url = urllib.parse.urljoin(base_url.rstrip('/') + '/', ref.removeprefix('./'))
    for attempt in range(5):
      try:
        with urllib.request.urlopen(url, timeout=5) as response:
          response.read()
          if response.status != 200:
            validation.error(f'HTTP {response.status}: {url}')
        break
      except (urllib.error.URLError, TimeoutError) as error:
        if attempt == 4:
          validation.error(f'HTTP request failed for {url}: {error}')
        else:
          time.sleep(0.2)
  print(f'Checked {len(refs)} app-shell URLs at {base_url}.')


def main() -> int:
  parser = argparse.ArgumentParser()
  parser.add_argument('--base-url', help='Also verify app-shell URLs from a running local server.')
  args = parser.parse_args()

  validation = Validation()
  validate_tools(validation)
  validate_imports(validation)
  validate_document_assets(validation)
  refs = validate_app_shell(validation)
  if args.base_url:
    validate_http(validation, args.base_url, refs)

  if validation.errors:
    print('\nValidation failed:', file=sys.stderr)
    for error in validation.errors:
      print(f'- {error}', file=sys.stderr)
    return 1
  print('Static validation passed.')
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
