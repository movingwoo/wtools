#!/usr/bin/env python3
"""Validate and periodically review the browser and CI baseline policy."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / 'scripts' / 'ci-baseline-lock.json'
WORKFLOW_ROOT = ROOT / '.github' / 'workflows'
USER_AGENT = 'W-Tools CI baseline audit (https://github.com/movingwoo/wtools)'


def load_policy() -> dict:
  return json.loads(LOCK_PATH.read_text(encoding='utf-8'))


def workflow_sources() -> dict[str, str]:
  return {
    path.name: path.read_text(encoding='utf-8')
    for path in sorted(WORKFLOW_ROOT.glob('*.yml'))
  }


def workflow_images_match(images: list[str], expected_image: str | None) -> bool:
  return bool(images) and all(image == expected_image for image in images)


def validate_local(policy: dict) -> list[str]:
  errors: list[str] = []
  if policy.get('schema') != 1:
    errors.append('CI baseline schema must be 1')
  try:
    date.fromisoformat(policy['reviewed'])
  except (KeyError, TypeError, ValueError):
    errors.append('CI baseline reviewed must be an ISO date')
  if not isinstance(policy.get('reviewIntervalDays'), int) or policy['reviewIntervalDays'] < 80:
    errors.append('CI baseline reviewIntervalDays must define a quarterly interval')

  node_major = policy.get('node', {}).get('major')
  for path in (ROOT / '.node-version', ROOT / 'tests' / '.node-version'):
    if path.read_text(encoding='utf-8').strip() != node_major:
      errors.append(f'{path.relative_to(ROOT)} does not match CI baseline Node.js {node_major}')

  package = json.loads((ROOT / 'tests' / 'package.json').read_text(encoding='utf-8'))
  current = policy.get('playwright', {}).get('current', {})
  minimum = policy.get('playwright', {}).get('minimum', {})
  if package.get('devDependencies', {}).get('@playwright/test') != current.get('version'):
    errors.append('tests/package.json Playwright does not match current baseline policy')

  workflows = workflow_sources()
  images = re.findall(
    r'^\s*image:\s*(mcr\.microsoft\.com/playwright:\S+)\s*$',
    workflows['validate.yml'], re.MULTILINE,
  )
  if not workflow_images_match(images, current.get('image')):
    errors.append('validate.yml does not use the current digest-pinned Playwright image')
  compatibility = workflows['compatibility.yml']
  images = re.findall(r'^\s*image:\s*(mcr\.microsoft\.com/playwright:\S+)\s*$', compatibility, re.MULTILINE)
  if not workflow_images_match(images, minimum.get('image')):
    errors.append('compatibility.yml does not use the minimum digest-pinned Playwright image')
  if f'@playwright/test@{minimum.get("version")}' not in compatibility:
    errors.append('compatibility.yml legacy driver does not match the minimum Playwright version')

  seen_actions: set[str] = set()
  expected_actions = policy.get('githubActions', {})
  for workflow, source in workflows.items():
    for action, major in re.findall(r'^\s*uses:\s*([^\s@]+)@v(\d+)\s*$', source, re.MULTILINE):
      if action not in expected_actions:
        continue
      seen_actions.add(action)
      if int(major) != expected_actions[action]:
        errors.append(f'{workflow}: {action}@v{major} differs from the CI baseline lock')
  missing_actions = set(expected_actions) - seen_actions
  if missing_actions:
    errors.append(f'CI baseline actions are unused: {sorted(missing_actions)}')

  release_source = workflows['release.yml']
  if 'python3 scripts/check_workflow_freshness.py' not in release_source:
    errors.append('release.yml must enforce the recent compatibility workflow gate')
  return errors


def request_json(url: str, token: str = ''):
  headers = {'Accept': 'application/json', 'User-Agent': USER_AGENT}
  if token:
    headers['Authorization'] = f'Bearer {token}'
  with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
    return json.load(response)


def image_digest(image: str) -> tuple[str, str]:
  pinned, expected_digest = image.split('@', 1)
  repository, tag = pinned.removeprefix('mcr.microsoft.com/').split(':', 1)
  url = f'https://mcr.microsoft.com/v2/{repository}/manifests/{urllib.parse.quote(tag)}'
  request = urllib.request.Request(url, headers={
    'Accept': 'application/vnd.docker.distribution.manifest.list.v2+json',
    'User-Agent': USER_AGENT,
  })
  with urllib.request.urlopen(request, timeout=30) as response:
    response.read()
    return expected_digest, response.headers.get('Docker-Content-Digest', '')


def check_latest(policy: dict) -> tuple[list[str], list[str]]:
  errors: list[str] = []
  notes: list[str] = []
  reviewed = date.fromisoformat(policy['reviewed'])
  age = (date.today() - reviewed).days
  if age < 0 or age > policy['reviewIntervalDays']:
    errors.append(f'CI baseline review is {age} days old')

  schedule = request_json(policy['node']['source'])
  major = policy['node']['major']
  node_entry = schedule.get(f'v{major}', {})
  if not node_entry.get('end') or date.fromisoformat(node_entry['end']) < date.today():
    errors.append(f'Node.js {major} is outside the official support schedule')
  supported_lts = [
    int(key[1:])
    for key, entry in schedule.items()
    if key[1:].isdigit() and entry.get('lts')
    and date.fromisoformat(entry['lts']) <= date.today() <= date.fromisoformat(entry['end'])
  ]
  notes.append(
    f'Node.js {major} 지원 종료 {node_entry.get("end")}; 최신 지원 LTS 메이저 {max(supported_lts)}'
  )

  current = policy['playwright']['current']
  latest_playwright = request_json('https://registry.npmjs.org/%40playwright%2Ftest/latest')['version']
  if latest_playwright == current['version']:
    notes.append(f'Playwright {current["version"]}은 npm latest와 일치')
  else:
    notes.append(f'Playwright 갱신 검토: {current["version"]} → {latest_playwright}')
  for name in ('current', 'minimum'):
    expected, actual = image_digest(policy['playwright'][name]['image'])
    if expected != actual:
      errors.append(f'Playwright {name} image digest differs: {expected} != {actual}')
    else:
      notes.append(f'Playwright {name} image digest 확인: {actual}')

  token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN', '')
  for action, pinned_major in policy['githubActions'].items():
    latest = request_json(f'https://api.github.com/repos/{action}/releases/latest', token)['tag_name']
    match = re.match(r'v(\d+)', latest)
    if not match:
      errors.append(f'{action}: latest release tag is not a major tag: {latest}')
    elif int(match.group(1)) != pinned_major:
      errors.append(f'{action}: pinned v{pinned_major}, latest {latest}')
    else:
      notes.append(f'{action}@v{pinned_major} 최신 메이저 확인 ({latest})')
  return errors, notes


def main() -> int:
  parser = argparse.ArgumentParser(description='브라우저·Node.js·Playwright·Actions 기준선을 감사합니다.')
  parser.add_argument('--check-latest', action='store_true', help='공식 최신 지원 정보와 원격 핀도 확인합니다.')
  args = parser.parse_args()
  try:
    policy = load_policy()
    errors = validate_local(policy)
    notes: list[str] = []
    if args.check_latest and not errors:
      remote_errors, notes = check_latest(policy)
      errors.extend(remote_errors)
  except (KeyError, OSError, ValueError, urllib.error.URLError) as error:
    print(f'CI 기준선 감사 실패: {error}', file=sys.stderr)
    return 1
  print('## 브라우저·CI 기준선')
  print()
  print(f'- 마지막 분기 검토: {policy.get("reviewed", "?")}')
  for browser, entry in policy.get('browsers', {}).items():
    print(f'- {browser}: 최소 {entry["minimum"]}, 정기 검사 {entry["closestEngine"]}')
  for note in notes:
    print(f'- {note}')
  if errors:
    print()
    print('### 조치 필요')
    print()
    for error in errors:
      print(f'- {error}')
    return 1
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
