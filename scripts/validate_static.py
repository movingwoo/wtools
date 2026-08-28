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
MODULE_REF = re.compile(
  r"""(?:^\s*import(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\))""",
  re.MULTILINE,
)
TOOL_REF = re.compile(r"""(?:tool|symTool|pakoTool)\(\s*\{\s*id:\s*'([^']+)'""")
CAT_REF = re.compile(r"""const CAT = '([^']+)';""")
PLAYWRIGHT_CI_IMAGES = {
  '1.62.1': 'mcr.microsoft.com/playwright:v1.62.1-noble@sha256:'
            'dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e',
}
DEPENDENCY_REGISTRY_PATTERN = re.compile(
  r'globalThis\.WTOOLS_DEPENDENCIES = (\{.*?\});\n\nObject\.freeze',
  re.DOTALL,
)
SRI_PATTERN = re.compile(r'sha384-[A-Za-z0-9+/]{64}')
VERSIONED_URL_PATTERN = re.compile(r'(?:@|/)\d+\.\d+\.\d+(?:[./+-]|$)')
SEMVER_PATTERN = re.compile(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?')
WORKFLOW_PLAIN_VALUE = re.compile(r'^\s*[A-Za-z_][\w-]*:\s+(.+?)\s*$')
EXTERNAL_EXECUTABLE_CALL = re.compile(
  r'(?:loadScript|loadCss|loadModule|import|importScripts|new\s+Worker)'
  r'\s*\(\s*["\'](https?://[^"\']+)',
)
SCRIPT_TAG_PATTERN = re.compile(r'<script\b([^>]*)>', re.IGNORECASE)
HTML_ATTR_PATTERN = re.compile(r'([\w-]+)=["\']([^"\']*)["\']')
DEPENDENCY_GLOBALS = {
  'cryptoJs': ('CryptoJS',),
  'jsyaml': ('jsyaml',),
  'jsrsasign': ('ASN1HEX', 'KEYUTIL', 'KJUR', 'X509', 'X509CRL', 'hextopem', 'pemtohex'),
  'pako': ('pako',),
  'fflate': ('fflate',),
  'lzma': ('LZMA',),
  'jsonpath': ('JSONPath',),
  'jmespath': ('jmespath',),
  'zSchema': ('ZSchema',),
  'bcrypt': ('bcrypt',),
  'hashWasm': ('hashwasm',),
  'tweetnacl': ('nacl',),
  'cryptoJsWorker': ('CryptoJS',),
}


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


def module_refs(source: str) -> list[str]:
  return [static or dynamic for static, dynamic in MODULE_REF.findall(source)]


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
  manifest_path = ROOT / 'js/tool-manifest.js'
  try:
    manifest = manifest_path.read_text(encoding='utf-8')
  except OSError as error:
    validation.error(f'js/tool-manifest.js: {error}')
    manifest = ''
  imported_modules = {
    (ROOT / 'js' / ref).resolve()
    for ref in re.findall(r'"module": "(\./tools/[^\"]+\.js)"', manifest)
  }
  tool_modules = set((ROOT / 'js/tools').glob('*.js'))
  tool_specs = set((ROOT / 'tests/tools').glob('*.spec.js'))
  expected_specs = {
    ROOT / 'tests/tools' / f'{path.stem}.spec.js'
    for path in tool_modules
  }

  for missing in sorted(tool_modules - imported_modules):
    validation.error(f'js/tool-manifest.js: tool module is not mapped: {missing.relative_to(ROOT)}')
  for extra in sorted(imported_modules - tool_modules):
    validation.error(f'js/tool-manifest.js: mapped tool module is missing: {extra.relative_to(ROOT)}')
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

  manifest_ids = re.findall(r'^    "id": "([a-z0-9-]+)",$', manifest, re.MULTILINE)
  if Counter(manifest_ids) != Counter(ids):
    missing = sorted(set(ids) - set(manifest_ids))
    extra = sorted(set(manifest_ids) - set(ids))
    validation.error(
      f'js/tool-manifest.js: metadata IDs differ from implementations '
      f'(missing={missing}, extra={extra})'
    )
  if "import { TOOL_MANIFESTS } from './tool-manifest.js';" not in main:
    validation.error('js/main.js: tool manifest import is required')
  if 'registerToolManifests(TOOL_MANIFESTS);' not in main:
    validation.error('js/main.js: tool metadata must be registered before routing')

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
    for ref in module_refs(source):
      if not ref.startswith('.'):
        continue
      target = local_path(ref, path.parent)
      if target:
        validation.require_file(target, str(path.relative_to(ROOT)))


def validate_architecture_boundaries(validation: Validation) -> None:
  lib_root = (ROOT / 'js' / 'lib').resolve()
  worker_root = (ROOT / 'js' / 'workers').resolve()
  tool_root = ROOT / 'js' / 'tools'

  def under(path: Path, parent: Path) -> bool:
    try:
      path.resolve().relative_to(parent)
      return True
    except ValueError:
      return False

  if lib_root.is_dir():
    for path in sorted(lib_root.rglob('*.js')):
      source = path.read_text(encoding='utf-8')
      for ref in module_refs(source):
        target = local_path(ref, path.parent)
        if target and not under(target, lib_root):
          validation.error(
            f'{path.relative_to(ROOT)}: first-party implementation modules may only import js/lib modules'
          )

  if worker_root.is_dir():
    for path in sorted(worker_root.rglob('*.js')):
      source = path.read_text(encoding='utf-8')
      for ref in module_refs(source):
        target = local_path(ref, path.parent)
        if target and not under(target, lib_root):
          validation.error(
            f'{path.relative_to(ROOT)}: Worker modules may only import js/lib modules'
          )

  for path in sorted(tool_root.glob('*.js')):
    source = path.read_text(encoding='utf-8')
    has_inline_worker = (
      re.search(r'\b[A-Za-z0-9_]*WORKER_SOURCE\s*=', source)
      or re.search(
        r'''new\s+Blob\s*\([\s\S]*?type\s*:\s*['"](?:text|application)/javascript['"]''',
        source,
      )
    )
    if has_inline_worker:
      validation.error(
        f'{path.relative_to(ROOT)}: inline Worker source is not allowed; use a js/workers entry point'
      )


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
  if set(dependencies) != {'cdn', 'vendored', 'tests', 'reviewed'}:
    validation.error('js/dependencies.js: registry must contain cdn, vendored, tests, and reviewed')
  reviewed = dependencies.get('reviewed')
  try:
    time.strptime(reviewed, '%Y-%m-%d')
  except (TypeError, ValueError):
    validation.error('js/dependencies.js: reviewed must be an ISO date (YYYY-MM-DD)')
  return dependencies


def dependency_actual_uses(cdn: dict, vendored: dict) -> dict[str, set[str]]:
  uses = {asset_id: set() for asset_id in (*cdn, *vendored)}
  providers: dict[str, list[str]] = {}
  for asset_id, names in DEPENDENCY_GLOBALS.items():
    for name in names:
      providers.setdefault(name, []).append(asset_id)

  for path in sorted((ROOT / 'js').rglob('*.js')):
    if path.name == 'dependencies.js':
      continue
    relative = path.relative_to(ROOT).as_posix()
    source = path.read_text(encoding='utf-8')
    for asset_id in re.findall(r"vendorUrl\(\s*'([^']+)'\s*\)", source):
      if asset_id in uses:
        uses[asset_id].add(relative)
    for asset_id in re.findall(r'\bLIB\.([A-Za-z0-9]+)', source):
      if asset_id in uses:
        uses[asset_id].add(relative)
    for name, asset_ids in providers.items():
      expression = rf'(?<![\w$]){re.escape(name)}\s*(?:\.|\[|\()'
      if not re.search(expression, source) and f'globalThis.{name}' not in source:
        continue
      if len(asset_ids) == 1:
        uses[asset_ids[0]].add(relative)
      elif relative.startswith('js/workers/'):
        vendored_provider = next((item for item in asset_ids if item in vendored), None)
        if vendored_provider:
          uses[vendored_provider].add(relative)
      else:
        cdn_provider = next((item for item in asset_ids if item in cdn), None)
        if cdn_provider:
          uses[cdn_provider].add(relative)

  vendored_by_path = {
    (ROOT / entry['path']).resolve(): asset_id
    for asset_id, entry in vendored.items()
    if isinstance(entry, dict) and isinstance(entry.get('path'), str)
  }
  for asset_id, entry in vendored.items():
    path = (ROOT / entry.get('path', '')).resolve()
    if not path.is_file() or path.suffix != '.mjs':
      continue
    source = path.read_text(encoding='utf-8')
    for ref in re.findall(r'''(?:\bfrom|new\s+URL\s*\()\s*["'](\./[^"']+)["']''', source):
      child_id = vendored_by_path.get((path.parent / ref).resolve())
      if child_id:
        uses[child_id].update(uses[asset_id])
  return uses


def dependency_url_matches(url: str, package: str, version: str) -> bool:
  decoded = urllib.parse.unquote(url)
  return any(marker in decoded for marker in (
    f'/npm/{package}@{version}',
    f'/{package}@{version}/',
    f'/ajax/libs/{package}/{version}/',
    f'registry.npmjs.org/{package}/-/',
  ))


def validate_dependencies(validation: Validation) -> set[Path]:
  dependencies = load_dependencies(validation)
  cdn = dependencies.get('cdn', {})
  vendored = dependencies.get('vendored', {})
  test_dependencies = dependencies.get('tests', {})
  urls: set[str] = set()
  paths: set[Path] = set()

  try:
    package = json.loads((ROOT / 'tests/package.json').read_text(encoding='utf-8'))
    lock = json.loads((ROOT / 'tests/package-lock.json').read_text(encoding='utf-8'))
  except (OSError, json.JSONDecodeError) as error:
    validation.error(f'test dependency registry: {error}')
    package, lock = {}, {'packages': {}}
  expected_tests = {
    'playwright': ('@playwright/test', 'node_modules/@playwright/test'),
    'axeCore': ('axe-core', 'node_modules/axe-core'),
  }
  if set(test_dependencies) != set(expected_tests):
    validation.error('js/dependencies.js: tests must register playwright and axeCore')
  for asset_id, (package_name, lock_path) in expected_tests.items():
    entry = test_dependencies.get(asset_id, {})
    source = f'js/dependencies.js tests.{asset_id}'
    if set(entry) != {'package', 'version', 'source', 'integrity', 'license', 'use'}:
      validation.error(f'{source}: fields must be package, version, source, integrity, license, use')
      continue
    if entry['package'] != package_name:
      validation.error(f'{source}: package must be {package_name}')
    if not dependency_url_matches(entry['source'], entry['package'], entry['version']):
      validation.error(f'{source}: source URL does not match package and version')
    locked = lock.get('packages', {}).get(lock_path, {})
    if package.get('devDependencies', {}).get(package_name) != entry['version']:
      validation.error(f'{source}: version differs from tests/package.json')
    for key in ('version', 'resolved', 'integrity', 'license'):
      registry_key = {'resolved': 'source'}.get(key, key)
      if locked.get(key) != entry.get(registry_key):
        validation.error(f'{source}: {registry_key} differs from tests/package-lock.json')

  for asset_id, entry in cdn.items():
    source = f'js/dependencies.js cdn.{asset_id}'
    required = {'package', 'version', 'url', 'integrity', 'license', 'kind', 'tools'}
    if set(entry) != required:
      validation.error(f'{source}: fields must be {", ".join(sorted(required))}')
      continue
    url = entry['url']
    if url in urls:
      validation.error(f'{source}: duplicate URL: {url}')
    urls.add(url)
    if not VERSIONED_URL_PATTERN.search(url):
      validation.error(f'{source}: URL does not pin a semantic version: {url}')
    if not SEMVER_PATTERN.fullmatch(entry['version']) or entry['version'] not in url:
      validation.error(f'{source}: version must be semantic and match the URL')
    if not re.fullmatch(r'(?:@[a-z0-9._-]+/)?[a-z0-9._-]+', entry['package']):
      validation.error(f'{source}: invalid npm package name')
    if not dependency_url_matches(url, entry['package'], entry['version']):
      validation.error(f'{source}: URL does not match package and version')
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
    required = {'package', 'version', 'path', 'integrity', 'source', 'sourceIntegrity', 'license', 'tools'}
    if set(entry) != required:
      validation.error(f'{source}: fields must be {", ".join(sorted(required))}')
      continue
    if entry['source'] in urls:
      matching_cdn = next((item for item in cdn.values() if item['url'] == entry['source']), None)
      if not matching_cdn or matching_cdn['integrity'] != entry['sourceIntegrity']:
        validation.error(f'{source}: duplicate source URL has different integrity: {entry["source"]}')
    urls.add(entry['source'])
    if not VERSIONED_URL_PATTERN.search(entry['source']):
      validation.error(f'{source}: source URL does not pin a semantic version')
    if not SEMVER_PATTERN.fullmatch(entry['version']) or entry['version'] not in entry['source']:
      validation.error(f'{source}: version must be semantic and match the source URL')
    if not re.fullmatch(r'(?:@[a-z0-9._-]+/)?[a-z0-9._-]+', entry['package']):
      validation.error(f'{source}: invalid npm package name')
    if not dependency_url_matches(entry['source'], entry['package'], entry['version']):
      validation.error(f'{source}: source URL does not match package and version')
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

  actual_uses = dependency_actual_uses(cdn, vendored)
  for section, entries in (('cdn', cdn), ('vendored', vendored)):
    for asset_id, entry in entries.items():
      registered = set(entry.get('tools', []))
      actual = actual_uses.get(asset_id, set())
      if registered != actual:
        missing = sorted(actual - registered)
        extra = sorted(registered - actual)
        validation.error(
          f'js/dependencies.js {section}.{asset_id}: tools differ from actual '
          f'LIB/global/vendorUrl use (missing={missing}, extra={extra})'
        )

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
  for key, expected in {'id': './', 'start_url': './', 'scope': './', 'display': 'standalone'}.items():
    if manifest.get(key) != expected:
      validation.error(f'manifest.json: {key} must be {expected!r}')
  for icon in manifest.get('icons', []):
    target = local_path(icon.get('src', ''), ROOT)
    if target:
      validation.require_file(target, 'manifest.json')
      if target.is_file() and icon.get('type') == 'image/png':
        data = target.read_bytes()
        if len(data) < 24 or data[:8] != b'\x89PNG\r\n\x1a\n':
          validation.error(f'manifest.json: icon is not a PNG: {target.relative_to(ROOT)}')
        else:
          dimensions = f'{int.from_bytes(data[16:20], "big")}x{int.from_bytes(data[20:24], "big")}'
          if dimensions != icon.get('sizes'):
            validation.error(
              f'manifest.json: {target.relative_to(ROOT)} is {dimensions}, '
              f'not declared {icon.get("sizes")}'
            )
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


def ambiguous_workflow_plain_values(source: str) -> list[int]:
  lines = []
  for line_number, line in enumerate(source.splitlines(), 1):
    match = WORKFLOW_PLAIN_VALUE.match(line)
    if not match:
      continue
    value = match.group(1)
    if value in {'|', '|-', '>', '>-'}:
      continue
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'\'', '"'}:
      continue
    if ': ' in value:
      lines.append(line_number)
  return lines


def validate_workflow_plain_values(validation: Validation) -> None:
  for path in sorted((ROOT / '.github' / 'workflows').glob('*.yml')):
    try:
      source = path.read_text(encoding='utf-8')
    except OSError as error:
      validation.error(f'{path.relative_to(ROOT)}: {error}')
      continue
    for line_number in ambiguous_workflow_plain_values(source):
      validation.error(
        f'{path.relative_to(ROOT)}:{line_number}: plain YAML value contains ": "; '
        'quote the whole value or use a block scalar'
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

  revision_match = re.search(r"const CACHE_REVISION = '([0-9a-f]{12})';", source)
  digest = hashlib.sha256()
  for ref in refs:
    if ref == './':
      continue
    relative = ref.removeprefix('./')
    path = ROOT / relative
    if not path.is_file():
      continue
    data = path.read_bytes()
    if path == ROOT / 'sw.js':
      data = re.sub(
        rb"const CACHE_REVISION = '[0-9a-f]{12}';",
        b"const CACHE_REVISION = '<revision>';",
        data,
      )
    digest.update(relative.encode())
    digest.update(b'\0')
    digest.update(data)
    digest.update(b'\0')
  expected_revision = digest.hexdigest()[:12]
  if not revision_match or revision_match.group(1) != expected_revision:
    validation.error(
      f'sw.js: CACHE_REVISION must be {expected_revision}; '
      'run python3 scripts/update_cache_version.py'
    )
  return refs


def validate_initial_load_budget(validation: Validation) -> None:
  initial_scripts = [
    ROOT / 'js/theme.js',
    ROOT / 'js/main.js',
    ROOT / 'js/core.js',
    ROOT / 'js/lib/common/base64.js',
    ROOT / 'js/tool-manifest.js',
    ROOT / 'js/dependencies.js',
  ]
  total = sum(path.stat().st_size for path in initial_scripts if path.is_file())
  budget = 140 * 1024
  if total > budget:
    validation.error(
      f'initial local JavaScript is {total} bytes; budget is {budget} bytes '
      '(theme, main, core and its eager common imports, manifest, dependencies)'
    )
  main_source = (ROOT / 'js/main.js').read_text(encoding='utf-8')
  if re.search(r"^import\s+['\"]\./tools/", main_source, re.MULTILINE):
    validation.error('js/main.js: tool implementations must stay dynamically imported')
  print(f'Initial local JavaScript budget: {total}/{budget} bytes.')


def validate_module_size_budgets(validation: Validation) -> None:
  tool_budget = 80 * 1024
  implementation_budget = 128 * 1024
  tool_paths = sorted((ROOT / 'js' / 'tools').glob('*.js'))
  lib_root = ROOT / 'js' / 'lib'
  worker_root = ROOT / 'js' / 'workers'
  implementation_paths = sorted(lib_root.rglob('*.js')) if lib_root.is_dir() else []
  worker_paths = sorted(worker_root.rglob('*.js')) if worker_root.is_dir() else []

  for path in tool_paths:
    size = path.stat().st_size
    if size > tool_budget:
      validation.error(
        f'{path.relative_to(ROOT)} is {size} bytes; tool module budget is {tool_budget} bytes '
        '(move substantial implementations to js/lib)'
      )
  for path in [*implementation_paths, *worker_paths]:
    size = path.stat().st_size
    if size > implementation_budget:
      validation.error(
        f'{path.relative_to(ROOT)} is {size} bytes; implementation module budget is '
        f'{implementation_budget} bytes (split independently loaded functionality)'
      )
  largest_tool = max((path.stat().st_size for path in tool_paths), default=0)
  print(
    f'Module size budgets: largest tool {largest_tool}/{tool_budget} bytes; '
    f'{len(implementation_paths) + len(worker_paths)} implementation/worker modules checked.'
  )


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
  validate_architecture_boundaries(validation)
  validate_document_assets(validation)
  vendored_paths = validate_dependencies(validation)
  validate_node_versions(validation)
  validate_playwright_ci(validation)
  validate_workflow_plain_values(validation)
  validate_initial_load_budget(validation)
  validate_module_size_budgets(validation)
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
