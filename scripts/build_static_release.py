#!/usr/bin/env python3
"""Build and verify a deterministic static-hosting release archive."""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
APP_SHELL_PATTERN = re.compile(r"const APP_SHELL = \[(.*?)\];", re.DOTALL)
APP_SHELL_REF_PATTERN = re.compile(r"'([^']+)'")
VERSION_PATTERN = re.compile(
  r'v\d+\.\d+\.\d+'
  r'(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?'
  r'(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?'
)
DOCUMENTS = (
  Path('README.md'),
  Path('STATIC_HOSTING.md'),
  Path('LICENSE'),
  Path('THIRD_PARTY_NOTICES.md'),
)
ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def app_shell_files() -> list[Path]:
  source = (ROOT / 'sw.js').read_text(encoding='utf-8')
  match = APP_SHELL_PATTERN.search(source)
  if not match:
    raise ValueError('sw.js에서 APP_SHELL 목록을 찾지 못했습니다.')

  files: set[Path] = set()
  for ref in APP_SHELL_REF_PATTERN.findall(match.group(1)):
    if ref == './':
      continue
    if not ref.startswith('./'):
      raise ValueError(f'APP_SHELL의 로컬 경로 형식이 올바르지 않습니다: {ref}')
    relative = Path(ref.removeprefix('./'))
    target = (ROOT / relative).resolve()
    try:
      target.relative_to(ROOT)
    except ValueError as error:
      raise ValueError(f'APP_SHELL 경로가 저장소 밖을 가리킵니다: {ref}') from error
    if not target.is_file():
      raise FileNotFoundError(f'릴리즈에 포함할 파일이 없습니다: {relative}')
    files.add(relative)
  return sorted(files, key=lambda path: path.as_posix())


def release_files() -> list[Path]:
  files = set(app_shell_files())
  for relative in DOCUMENTS:
    if not (ROOT / relative).is_file():
      raise FileNotFoundError(f'릴리즈에 포함할 문서가 없습니다: {relative}')
    files.add(relative)
  return sorted(files, key=lambda path: path.as_posix())


def zip_info(name: str) -> zipfile.ZipInfo:
  info = zipfile.ZipInfo(name, ZIP_TIMESTAMP)
  info.compress_type = zipfile.ZIP_DEFLATED
  info.create_system = 3
  info.external_attr = 0o100644 << 16
  return info


def verify_archive(archive: Path, root_name: str, files: list[Path]) -> None:
  expected = [f'{root_name}/{relative.as_posix()}' for relative in files]
  with zipfile.ZipFile(archive) as bundle:
    names = bundle.namelist()
    if names != expected:
      raise ValueError('ZIP 파일 목록이나 정렬 순서가 예상과 다릅니다.')
    for info, relative in zip(bundle.infolist(), files, strict=True):
      path = PurePosixPath(info.filename)
      if path.is_absolute() or '..' in path.parts:
        raise ValueError(f'ZIP에 안전하지 않은 경로가 있습니다: {info.filename}')
      if info.date_time != ZIP_TIMESTAMP:
        raise ValueError(f'ZIP 타임스탬프가 고정되지 않았습니다: {info.filename}')
      if bundle.read(info) != (ROOT / relative).read_bytes():
        raise ValueError(f'ZIP 내용이 원본과 다릅니다: {relative}')


def build(version: str, output_dir: Path) -> tuple[Path, Path]:
  if not VERSION_PATTERN.fullmatch(version):
    raise ValueError('버전은 v1.2.3 또는 v1.2.3-rc.1 형식이어야 합니다.')

  output_dir.mkdir(parents=True, exist_ok=True)
  root_name = f'wtools-{version}'
  archive = output_dir / f'{root_name}-static.zip'
  checksum = archive.with_suffix(archive.suffix + '.sha256')
  files = release_files()

  with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for relative in files:
      name = f'{root_name}/{relative.as_posix()}'
      bundle.writestr(zip_info(name), (ROOT / relative).read_bytes(), compresslevel=9)

  verify_archive(archive, root_name, files)
  digest = hashlib.sha256(archive.read_bytes()).hexdigest()
  checksum.write_text(f'{digest}  {archive.name}\n', encoding='ascii')
  return archive, checksum


def main() -> int:
  parser = argparse.ArgumentParser(description='정적 호스팅용 W-Tools 릴리즈 ZIP을 생성합니다.')
  parser.add_argument('--version', required=True, help='릴리즈 태그(예: v1.2.2)')
  parser.add_argument('--output-dir', type=Path, default=ROOT / 'dist', help='산출물 디렉터리')
  args = parser.parse_args()

  try:
    archive, checksum = build(args.version, args.output_dir.resolve())
  except (OSError, ValueError, zipfile.BadZipFile) as error:
    print(f'릴리즈 ZIP 생성 실패: {error}', file=sys.stderr)
    return 1

  print(f'정적 호스팅 ZIP: {archive}')
  print(f'SHA-256 체크섬: {checksum}')
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
