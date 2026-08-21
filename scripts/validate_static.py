#!/usr/bin/env python3
"""Validate W-Tools static assets and tool registrations without dependencies."""

from __future__ import annotations

import argparse
import base64
import hashlib
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
PLAYWRIGHT_CI_IMAGES = {
  '1.50.1': 'mcr.microsoft.com/playwright:v1.50.1-noble@sha256:'
            'ac7053180325ef75d31774c458d0bb9b55ac153ae1be3d104b80c6c1bb6a067c',
}
DEPENDENCY_REGISTRY_PATTERN = re.compile(
  r'globalThis\.WTOOLS_DEPENDENCIES = (\{.*?\});\n\nObject\.freeze',
  re.DOTALL,
)
SRI_PATTERN = re.compile(r'sha384-[A-Za-z0-9+/]{64}')
VERSIONED_URL_PATTERN = re.compile(r'(?:@|/)\d+\.\d+\.\d+(?:[./+-]|$)')
EXTERNAL_EXECUTABLE_CALL = re.compile(
  r'(?:loadScript|loadCss|loadModule|import|importScripts|new\s+Worker)'
  r'\s*\(\s*["\'](https?://[^"\']+)',
)
SCRIPT_TAG_PATTERN = re.compile(r'<script\b([^>]*)>', re.IGNORECASE)
HTML_ATTR_PATTERN = re.compile(r'([\w-]+)=["\']([^"\']*)["\']')


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
  tool_specs = set((ROOT / 'tests/tools').glob('*.spec.js'))
  expected_specs = {
    ROOT / 'tests/tools' / f'{path.stem}.spec.js'
    for path in tool_modules
  }

  for missing in sorted(tool_modules - imported_modules):
    validation.error(f'js/main.js: tool module is not imported: {missing.relative_to(ROOT)}')
  for extra in sorted(imported_modules - tool_modules):
    validation.error(f'js/main.js: imported tool module is missing: {extra.relative_to(ROOT)}')
  for missing in sorted(expected_specs - tool_specs):
    module = ROOT / 'js/tools' / f'{missing.name.removesuffix(".spec.js")}.js'
    validation.error(
      f'{module.relative_to(ROOT)}: missing test spec: {missing.relative_to(ROOT)}'
    )
  for extra in sorted(tool_specs - expected_specs):
    validation.error(
      f'{extra.relative_to(ROOT)}: no matching tool module; '
      f'spec filename must match js/tools/<module>.js'
    )

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
  print(
    f'Validated {len(ids)} unique tool registrations and '
    f'{len(tool_specs)} matching specs across {len(tool_modules)} modules.'
  )


def validate_imports(validation: Validation) -> None:
  for path in sorted((ROOT / 'js').rglob('*.js')):
    source = path.read_text(encoding='utf-8')
    for ref in IMPORT_REF.findall(source):
      if not ref.startswith('.'):
        continue
      target = local_path(ref, path.parent)
      if target:
        validation.require_file(target, str(path.relative_to(ROOT)))


def sha384(data: bytes) -> str:
  digest = hashlib.sha384(data).digest()
  return 'sha384-' + base64.b64encode(digest).decode('ascii')


def load_dependencies(validation: Validation) -> dict:
  path = ROOT / 'js' / 'dependencies.js'
  try:
    source = path.read_text(encoding='utf-8')
  except OSError as error:
    validation.error(f'js/dependencies.js: {error}')
    return {'cdn': {}, 'vendored': {}}
  match = DEPENDENCY_REGISTRY_PATTERN.search(source)
  if not match:
    validation.error('js/dependencies.js: dependency registry not found')
    return {'cdn': {}, 'vendored': {}}
  try:
    dependencies = json.loads(match.group(1))
  except json.JSONDecodeError as error:
    validation.error(f'js/dependencies.js: invalid dependency registry: {error}')
    return {'cdn': {}, 'vendored': {}}
  if set(dependencies) != {'cdn', 'vendored', 'reviewed'}:
    validation.error('js/dependencies.js: registry must contain cdn, vendored, and reviewed')
  reviewed = dependencies.get('reviewed')
  try:
    time.strptime(reviewed, '%Y-%m-%d')
  except (TypeError, ValueError):
    validation.error('js/dependencies.js: reviewed must be an ISO date (YYYY-MM-DD)')
  return dependencies


def validate_dependencies(validation: Validation) -> set[Path]:
  dependencies = load_dependencies(validation)
  cdn = dependencies.get('cdn', {})
  vendored = dependencies.get('vendored', {})
  urls: set[str] = set()
  paths: set[Path] = set()

  for asset_id, entry in cdn.items():
    source = f'js/dependencies.js cdn.{asset_id}'
    if set(entry) != {'url', 'integrity', 'license', 'kind', 'tools'}:
      validation.error(f'{source}: fields must be url, integrity, license, kind, tools')
      continue
    url = entry['url']
    if url in urls:
      validation.error(f'{source}: duplicate URL: {url}')
    urls.add(url)
    if not VERSIONED_URL_PATTERN.search(url):
      validation.error(f'{source}: URL does not pin a semantic version: {url}')
    if not SRI_PATTERN.fullmatch(entry['integrity']):
      validation.error(f'{source}: invalid SHA-384 integrity')
    if entry['kind'] not in {'script', 'style'}:
      validation.error(f'{source}: kind must be script or style')
    if not entry['license'] or not entry['tools']:
      validation.error(f'{source}: license and tools are required')
    for tool_path in entry['tools']:
      validation.require_file(ROOT / tool_path, source)

  for asset_id, entry in vendored.items():
    source = f'js/dependencies.js vendored.{asset_id}'
    required = {'path', 'integrity', 'source', 'sourceIntegrity', 'license', 'tools'}
    if set(entry) != required:
      validation.error(f'{source}: fields must be {", ".join(sorted(required))}')
      continue
    if entry['source'] in urls:
      validation.error(f'{source}: duplicate source URL: {entry["source"]}')
    urls.add(entry['source'])
    if not VERSIONED_URL_PATTERN.search(entry['source']):
      validation.error(f'{source}: source URL does not pin a semantic version')
    if not SRI_PATTERN.fullmatch(entry['integrity']) or not SRI_PATTERN.fullmatch(entry['sourceIntegrity']):
      validation.error(f'{source}: invalid SHA-384 integrity')
    if not entry['license'] or not entry['tools']:
      validation.error(f'{source}: license and tools are required')
    relative = Path(entry['path'])
    if relative.is_absolute() or '..' in relative.parts or relative.parts[:2] != ('assets', 'vendor'):
      validation.error(f'{source}: path must stay under assets/vendor: {relative}')
      continue
    path = (ROOT / relative).resolve()
    if path in paths:
      validation.error(f'{source}: duplicate local path: {relative}')
    paths.add(path)
    validation.require_file(path, source)
    if path.is_file() and sha384(path.read_bytes()) != entry['integrity']:
      validation.error(f'{source}: local SHA-384 mismatch: {relative}')
    if path.is_file() and path.suffix == '.mjs':
      module_source = path.read_text(encoding='utf-8')
      if re.search(
        r'''(?:\bfrom|\bimport\s*\(|new\s+URL\s*\()\s*["'](?:https?://|/)''',
        module_source,
      ):
        validation.error(f'{source}: vendored module contains an absolute executable subresource')
      for ref in re.findall(
        r'''(?:\bfrom|new\s+URL\s*\()\s*["'](\./[^"']+)["']''',
        module_source,
      ):
        target = (path.parent / ref).resolve()
        if target not in paths and target not in {
          (ROOT / item['path']).resolve() for item in vendored.values()
        }:
          validation.error(f'{source}: unregistered local subresource: {ref}')
    for tool_path in entry['tools']:
      validation.require_file(ROOT / tool_path, source)

  index = (ROOT / 'index.html').read_text(encoding='utf-8')
  cdn_by_url = {entry['url']: entry for entry in cdn.values()}
  for tag in SCRIPT_TAG_PATTERN.findall(index):
    attrs = dict(HTML_ATTR_PATTERN.findall(tag))
    src = attrs.get('src', '')
    if not src.startswith(('https://', 'http://')):
      continue
    entry = cdn_by_url.get(src)
    if not entry:
      validation.error(f'index.html: external script bypasses dependency registry: {src}')
      continue
    if attrs.get('integrity') != entry['integrity']:
      validation.error(f'index.html: integrity does not match registry: {src}')
    if attrs.get('crossorigin') != 'anonymous':
      validation.error(f'index.html: external SRI script requires crossorigin="anonymous": {src}')

  for path in sorted((ROOT / 'js').rglob('*.js')):
    if path.name == 'dependencies.js':
      continue
    source = path.read_text(encoding='utf-8')
    for url in EXTERNAL_EXECUTABLE_CALL.findall(source):
      validation.error(
        f'{path.relative_to(ROOT)}: external executable URL bypasses local vendoring: {url}'
      )
    for asset_id in re.findall(r"vendorUrl\(\s*'([^']+)'\s*\)", source):
      if asset_id not in vendored:
        validation.error(f'{path.relative_to(ROOT)}: unknown vendored dependency: {asset_id}')
    for asset_id in re.findall(r'\bLIB\.([A-Za-z0-9]+)', source):
      if asset_id not in cdn:
        validation.error(f'{path.relative_to(ROOT)}: unknown CDN dependency: {asset_id}')

  core = (ROOT / 'js' / 'core.js').read_text(encoding='utf-8')
  worker = (ROOT / 'sw.js').read_text(encoding='utf-8')
  if "import './dependencies.js';" not in core:
    validation.error('js/core.js: dependency registry import is required')
  if "importScripts('./js/dependencies.js');" not in worker:
    validation.error('sw.js: dependency registry import is required')
  if "importScripts('./js/sw-integrity.js');" not in worker:
    validation.error('sw.js: shared integrity helper import is required')

  print(f'Validated {len(cdn)} CDN assets and {len(vendored)} vendored assets with SHA-384.')
  return paths


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


def validate_node_versions(validation: Validation) -> None:
  def read_version(path: Path) -> str:
    try:
      return path.read_text(encoding='utf-8').strip()
    except OSError as error:
      validation.error(f'{path.relative_to(ROOT)}: {error}')
      return ''

  root_version = read_version(ROOT / '.node-version')
  test_version = read_version(ROOT / 'tests' / '.node-version')
  if not root_version or not test_version:
    return
  if root_version != test_version:
    validation.error(
      f'Node.js version mismatch: .node-version={root_version}, '
      f'tests/.node-version={test_version}'
    )
  try:
    package = json.loads((ROOT / 'tests' / 'package.json').read_text(encoding='utf-8'))
    expected_range = f'>={root_version.split(".")[0]} <{int(root_version.split(".")[0]) + 1}'
    if package.get('engines', {}).get('node') != expected_range:
      validation.error(
        f'tests/package.json: engines.node must be {expected_range!r} '
        f'to match .node-version'
      )
  except (json.JSONDecodeError, OSError, ValueError) as error:
    validation.error(f'tests/package.json Node.js version policy: {error}')


def validate_playwright_ci(validation: Validation) -> None:
  try:
    package = json.loads((ROOT / 'tests' / 'package.json').read_text(encoding='utf-8'))
    lock = json.loads((ROOT / 'tests' / 'package-lock.json').read_text(encoding='utf-8'))
    versions = {
      'tests/package.json': package['devDependencies']['@playwright/test'],
      'tests/package-lock.json root': lock['packages']['']['devDependencies']['@playwright/test'],
      'tests/package-lock.json package': lock['packages']['node_modules/@playwright/test']['version'],
    }
  except (KeyError, json.JSONDecodeError, OSError) as error:
    validation.error(f'Playwright CI version policy: {error}')
    return

  if len(set(versions.values())) != 1:
    details = ', '.join(f'{source}={version}' for source, version in versions.items())
    validation.error(f'Playwright versions do not match: {details}')
    return

  version = next(iter(versions.values()))
  expected_image = PLAYWRIGHT_CI_IMAGES.get(version)
  if not expected_image:
    validation.error(
      f'Playwright {version}: add a reviewed, digest-pinned CI image to '
      'PLAYWRIGHT_CI_IMAGES'
    )
    return

  for relative_path in ('.github/workflows/validate.yml', '.github/workflows/nightly.yml'):
    path = ROOT / relative_path
    try:
      source = path.read_text(encoding='utf-8')
    except OSError as error:
      validation.error(f'{relative_path}: {error}')
      continue
    images = re.findall(r'^\s*image:\s*(mcr\.microsoft\.com/playwright:\S+)\s*$', source, re.MULTILINE)
    if images != [expected_image]:
      validation.error(
        f'{relative_path}: expected one Playwright CI image {expected_image!r}, got {images!r}'
      )
    if re.search(r'\bplaywright\s+install\b', source):
      validation.error(
        f'{relative_path}: Playwright browsers must come from the pinned CI image, '
        'not a runtime install'
      )
    if relative_path == '.github/workflows/validate.yml' and not re.search(
      r'^  browser-smoke:\s*$', source, re.MULTILINE
    ):
      validation.error(
        f'{relative_path}: browser-smoke job id is required by the main branch ruleset'
      )


def validate_app_shell(validation: Validation, vendored_paths: set[Path]) -> list[str]:
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
    *vendored_paths,
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
  vendored_paths = validate_dependencies(validation)
  validate_node_versions(validation)
  validate_playwright_ci(validation)
  refs = validate_app_shell(validation, vendored_paths)
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
