#!/usr/bin/env python3
"""Audit every npm-backed W-Tools dependency against npm, OSV, and GitHub."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / 'js' / 'dependencies.js'
REGISTRY_PATTERN = re.compile(
  r'globalThis\.WTOOLS_DEPENDENCIES = (\{.*?\});\n\nObject\.freeze',
  re.DOTALL,
)
USER_AGENT = 'W-Tools dependency audit (https://github.com/movingwoo/wtools)'


@dataclass(frozen=True)
class PackagePin:
  package: str
  version: str
  uses: tuple[str, ...]


def load_registry(path: Path = REGISTRY) -> dict:
  match = REGISTRY_PATTERN.search(path.read_text(encoding='utf-8'))
  if not match:
    raise ValueError(f'{path}: dependency registry not found')
  return json.loads(match.group(1))


def collect_pins(registry: dict) -> list[PackagePin]:
  grouped: dict[tuple[str, str], list[str]] = {}
  for section in ('cdn', 'vendored', 'tests'):
    for asset_id, entry in registry.get(section, {}).items():
      package = entry.get('package')
      version = entry.get('version')
      if not isinstance(package, str) or not isinstance(version, str):
        raise ValueError(f'{section}.{asset_id}: package and version are required')
      grouped.setdefault((package, version), []).append(f'{section}.{asset_id}')
  return [
    PackagePin(package, version, tuple(sorted(uses)))
    for (package, version), uses in sorted(grouped.items())
  ]


def request_json(url: str, *, data: dict | None = None, token: str = ''):
  headers = {'Accept': 'application/json', 'User-Agent': USER_AGENT}
  body = None
  if data is not None:
    body = json.dumps(data).encode()
    headers['Content-Type'] = 'application/json'
  if token:
    headers['Authorization'] = f'Bearer {token}'
  request = urllib.request.Request(url, data=body, headers=headers)
  with urllib.request.urlopen(request, timeout=30) as response:
    return json.load(response)


def npm_latest(package: str) -> dict:
  encoded = urllib.parse.quote(package, safe='')
  return request_json(f'https://registry.npmjs.org/{encoded}/latest')


def osv_queries(pairs: list[tuple[str, str]]) -> dict[tuple[str, str], list[dict]]:
  payload = {
    'queries': [
      {'package': {'ecosystem': 'npm', 'name': package}, 'version': version}
      for package, version in pairs
    ],
  }
  response = request_json('https://api.osv.dev/v1/querybatch', data=payload)
  results = response.get('results', [])
  if len(results) != len(pairs):
    raise ValueError('OSV querybatch response length differs from the request')
  return {
    pair: result.get('vulns', [])
    for pair, result in zip(pairs, results)
  }


def github_advisories(package: str, version: str, token: str = '') -> list[dict]:
  query = urllib.parse.urlencode({
    'ecosystem': 'npm',
    'affects': f'{package}@{version}',
    'per_page': 100,
  })
  url = f'https://api.github.com/advisories?{query}'
  headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': USER_AGENT,
  }
  if token:
    headers['Authorization'] = f'Bearer {token}'
  with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
    data = json.load(response)
  if not isinstance(data, list):
    raise ValueError(f'GitHub Advisory response for {package}@{version} is not a list')
  return data


def advisory_labels(osv: list[dict], github: list[dict]) -> list[str]:
  labels = {item.get('id') for item in osv if item.get('id')}
  for item in github:
    label = item.get('ghsa_id') or item.get('cve_id')
    if label:
      labels.add(label)
  return sorted(labels)


def render_report(pins: list[PackagePin], latest: dict[str, dict],
                  osv: dict[tuple[str, str], list[dict]],
                  github: dict[tuple[str, str], list[dict]]) -> tuple[str, bool]:
  current_vulnerabilities: list[str] = []
  deprecated: list[str] = []
  updates: list[tuple[str, str, str, str]] = []
  unchanged = 0

  for pin in pins:
    current_pair = (pin.package, pin.version)
    current_labels = advisory_labels(osv.get(current_pair, []), github.get(current_pair, []))
    if current_labels:
      current_vulnerabilities.append(
        f'- `{pin.package}@{pin.version}`: {", ".join(current_labels)}'
      )
    metadata = latest[pin.package]
    latest_version = metadata['version']
    if metadata.get('deprecated'):
      deprecated.append(f'- `{pin.package}`: {metadata["deprecated"]}')
    if latest_version == pin.version:
      unchanged += 1
      continue
    latest_pair = (pin.package, latest_version)
    latest_labels = advisory_labels(osv.get(latest_pair, []), github.get(latest_pair, []))
    status = ', '.join(latest_labels) if latest_labels else '알려진 취약점 없음'
    updates.append((pin.package, pin.version, latest_version, status))

  lines = [
    '## 런타임·테스트 의존성 감사',
    '',
    f'- 감사일: {date.today().isoformat()}',
    f'- npm 패키지 핀: {len(pins)}개 (최신 유지 {unchanged}개, 갱신 후보 {len(updates)}개)',
    '- 취약점 출처: OSV와 GitHub Global Security Advisory',
    '',
    '### 현재 고정 버전 취약점',
    '',
    *(current_vulnerabilities or ['- 알려진 취약점이 없습니다.']),
    '',
    '### npm 최신판 검토 후보',
    '',
  ]
  if updates:
    lines.extend([
      '| 패키지 | 현재 | npm latest | 최신판 알려진 취약점 |',
      '|---|---:|---:|---|',
      *(f'| `{package}` | {current} | {newest} | {status} |'
        for package, current, newest, status in updates),
    ])
  else:
    lines.append('- 모든 핀이 npm latest와 같습니다.')
  lines.extend(['', '### 유지보수 중단·폐기 공지', ''])
  lines.extend(deprecated or ['- npm의 폐기 공지가 없습니다.'])
  lines.extend([
    '',
    '> “알려진 취약점 없음”은 두 등록부의 현재 조회 결과이며 안전성을 보증하지 않습니다. '
    '메이저 갱신은 호환성·표준 벡터 검토 후 별도 변경으로 진행합니다.',
    '',
  ])
  return '\n'.join(lines), bool(current_vulnerabilities)


def audit() -> tuple[str, bool]:
  pins = collect_pins(load_registry())
  latest = {pin.package: npm_latest(pin.package) for pin in pins}
  pairs = sorted({
    (pin.package, version)
    for pin in pins
    for version in (pin.version, latest[pin.package]['version'])
  })
  osv = osv_queries(pairs)
  token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN', '')
  github = {
    pair: github_advisories(*pair, token=token)
    for pair in pairs
  }
  return render_report(pins, latest, osv, github)


def main() -> int:
  parser = argparse.ArgumentParser(description='npm·OSV·GitHub Advisory 의존성 감사를 실행합니다.')
  parser.add_argument('--output', type=Path, help='Markdown 요약을 저장할 경로')
  parser.add_argument(
    '--fail-on-vulnerability', action='store_true',
    help='현재 고정 버전에 알려진 취약점이 있으면 실패합니다.',
  )
  args = parser.parse_args()
  try:
    report, vulnerable = audit()
    if args.output:
      args.output.write_text(report, encoding='utf-8')
    else:
      print(report, end='')
    return 1 if vulnerable and args.fail_on_vulnerability else 0
  except (KeyError, OSError, ValueError, urllib.error.URLError) as error:
    print(f'의존성 감사 실패: {error}', file=sys.stderr)
    return 1


if __name__ == '__main__':
  raise SystemExit(main())
