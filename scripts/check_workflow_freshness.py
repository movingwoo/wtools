#!/usr/bin/env python3
"""Require a recent successful compatibility run before publishing release assets."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POLICY_PATH = ROOT / 'scripts' / 'ci-baseline-lock.json'
USER_AGENT = 'W-Tools release compatibility gate (https://github.com/movingwoo/wtools)'


def parse_time(value: str) -> datetime:
  return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)


def evaluate_runs(payload: dict, *, branch: str, max_age_days: int,
                  now: datetime | None = None) -> tuple[bool, str]:
  now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
  runs = payload.get('workflow_runs', [])
  if not runs:
    return False, '최근 성공한 최소 브라우저 호환성 워크플로가 없습니다.'
  run = runs[0]
  if run.get('conclusion') != 'success' or run.get('head_branch') != branch:
    return False, '조회된 호환성 워크플로가 대상 브랜치의 성공 실행이 아닙니다.'
  created = parse_time(run['created_at'])
  age = now - created
  if age.total_seconds() < 0 or age.total_seconds() > max_age_days * 86400:
    return False, f'최근 호환성 성공 실행이 {age.days}일 전이라 {max_age_days}일 제한을 넘었습니다.'
  return True, f'최소 브라우저 호환성 성공 실행을 확인했습니다: {run.get("html_url", created.isoformat())}'


def fetch_runs(repository: str, workflow: str, branch: str, token: str) -> dict:
  workflow_name = urllib.parse.quote(workflow, safe='')
  query = urllib.parse.urlencode({'branch': branch, 'status': 'success', 'per_page': 1})
  url = f'https://api.github.com/repos/{repository}/actions/workflows/{workflow_name}/runs?{query}'
  headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Authorization': f'Bearer {token}',
    'User-Agent': USER_AGENT,
  }
  with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
    return json.load(response)


def main() -> int:
  parser = argparse.ArgumentParser(description='최근 최소 브라우저 호환성 성공 이력을 확인합니다.')
  parser.add_argument('--runs-file', type=Path, help='테스트용 GitHub workflow runs JSON')
  args = parser.parse_args()
  try:
    policy = json.loads(POLICY_PATH.read_text(encoding='utf-8'))['releaseGate']
    if args.runs_file:
      payload = json.loads(args.runs_file.read_text(encoding='utf-8'))
    else:
      repository = os.environ.get('GITHUB_REPOSITORY', '')
      token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN', '')
      if not repository or not token:
        raise ValueError('GITHUB_REPOSITORY와 GITHUB_TOKEN이 필요합니다.')
      payload = fetch_runs(repository, policy['workflow'], policy['branch'], token)
    passed, message = evaluate_runs(
      payload, branch=policy['branch'], max_age_days=policy['maxAgeDays'],
    )
  except (KeyError, OSError, ValueError, urllib.error.URLError) as error:
    print(f'릴리즈 호환성 게이트 실패: {error}', file=sys.stderr)
    return 1
  print(message)
  return 0 if passed else 1


if __name__ == '__main__':
  raise SystemExit(main())
