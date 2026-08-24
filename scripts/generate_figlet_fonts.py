#!/usr/bin/env python3
"""Build the supported ASCII-only FIGfont assets from pinned upstream font data."""

from __future__ import annotations

import base64
import hashlib
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets' / 'data' / 'figlet'
BASE_URL = 'https://cdn.jsdelivr.net/npm/figlet@1.7.0/fonts'
SOURCES = {
  'Standard': 'sha384-igIF/OIvfS8Ev5qGCANjfoLkDNVhIXvdxim2rF7Ftx1vA1zca//3C87Lu5Jl3pPy',
  'Big': 'sha384-QRj2L0aEGMcGYSl5DGtYihSKBltbYtxlABh7gD/afTIAAoRj+YWYnPTphVIeQK0v',
  'Small': 'sha384-bfmUxl5FQMc+E6pIIvoG/Rq1Y+9CcCbE9uZ74i0TUCmaK+MHNwDPOWhBnJ4+/Y0d',
  'Slant': 'sha384-3R3WRo+4J+CrvvYIrMP+jB4ftQ7SHPMl7SwMk950kEQbpqs/mR2bR4zT7NRbk9vD',
  'Banner': 'sha384-EWZ36aQeWY0jDhicp8G18OY9cKXOvjT8qLzGahNhcR/9rUGqgn+A/uKhBH8E6Dzv',
  'Block': 'sha384-PUxxN/LE5BrgGVt+tpXAjKpt3cjpqxwA05ZlUef1vtO8V0e0+JIOzF+8eQnWtG1O',
  'Doom': 'sha384-R9wlh68KD7J/NKEMQZAyEYigSkt8NahA5zRkRPZcuXMBULKPnXOYoXzoag/ATxOm',
  'Ghost': 'sha384-hgnnJFKRmvpHRaL97puHybT7UL8boLRCM+EyVh/P9wWR06QmbxE9HoiuhJo2Vdwd',
  'Shadow': 'sha384-tcRJXZ0QhyX1EGa3ZzIn0WWobT15pw8JTJX+hsp+LAoBo1mUmW+3kBa6LVIulstr',
  'Speed': 'sha384-e4RlpOTR1UilAUvbGdn35q1NK/7J1jjs9bEBHlV+mm05IrmtivQ027aScliYxv8/',
}


def sha384(data: bytes) -> str:
  return 'sha384-' + base64.b64encode(hashlib.sha384(data).digest()).decode('ascii')


def ascii_subset(name: str, data: bytes) -> str:
  # FIGfont files predate UTF-8 and some contain Latin-1 bytes outside the
  # printable ASCII subset retained below.
  text = data.decode('latin-1').replace('\r\n', '\n').replace('\r', '\n')
  lines = text.split('\n')
  header = lines[0].split()
  if not header or not header[0].startswith('flf2a') or len(header) < 6:
    raise ValueError(f'{name}: invalid FIGfont header')
  height = int(header[1])
  comments = int(header[5])
  glyph_start = 1 + comments
  glyph_end = glyph_start + height * 95
  if glyph_end > len(lines):
    raise ValueError(f'{name}: missing required ASCII glyph rows')

  # The UI promises English letters and digits. Keep the complete printable ASCII
  # range so punctuation remains compatible, while dropping unrelated legacy glyphs.
  header[5] = '1'
  header = header[:8]
  notice = f'ASCII subset adapted by W-Tools; see THIRD_PARTY_NOTICES.md ({name}).'
  return ' '.join(header) + '\n' + notice + '\n' + '\n'.join(lines[glyph_start:glyph_end]) + '\n'


def main() -> int:
  OUTPUT.mkdir(parents=True, exist_ok=True)
  for name, integrity in SOURCES.items():
    url = f'{BASE_URL}/{name}.flf'
    with urllib.request.urlopen(url, timeout=30) as response:
      data = response.read()
    actual = sha384(data)
    if actual != integrity:
      raise ValueError(f'{name}: source integrity mismatch ({actual})')
    target = OUTPUT / f'{name}.flf'
    target.write_text(ascii_subset(name, data), encoding='utf-8', newline='\n')
    print(f'Wrote {target.relative_to(ROOT)}')
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
