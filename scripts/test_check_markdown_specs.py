import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_markdown_specs as markdown


class MarkdownSpecAuditTests(unittest.TestCase):
  def test_pinned_lock_is_valid(self):
    lock = markdown.load_lock()
    self.assertEqual(lock['commonmark']['version'], '0.31.2')
    self.assertEqual(lock['gfm']['releaseTag'], '0.29.0.gfm.13')

  def test_sha_and_example_counts(self):
    vectors = json.dumps([{'markdown': 'a'}, {'markdown': 'b'}]).encode()
    self.assertTrue(markdown.sha384_sri(vectors).startswith('sha384-'))
    self.assertEqual(markdown.count_examples(vectors, 'json'), 2)
    cmark = (b'`' * 32 + b' example\na\n.\n<p>a</p>\n' + b'`' * 32 + b'\n') * 3
    self.assertEqual(markdown.count_examples(cmark, 'cmark'), 3)

  def test_github_token_is_only_sent_to_the_api(self):
    api = markdown.request_headers('https://api.github.com/repos/commonmark/commonmark-spec/releases/latest', 'secret')
    spec = markdown.request_headers('https://spec.commonmark.org/0.31.2/spec.json', 'secret')
    raw = markdown.request_headers('https://raw.githubusercontent.com/github/cmark-gfm/tag/test/extensions.txt', 'secret')
    self.assertEqual(api['Authorization'], 'Bearer secret')
    self.assertNotIn('Authorization', spec)
    self.assertNotIn('Authorization', raw)

  def test_invalid_lock_is_rejected(self):
    lock = markdown.load_lock()
    lock['commonmark']['vectorsSha384'] = 'sha384-invalid'
    with tempfile.TemporaryDirectory() as directory:
      path = Path(directory) / 'lock.json'
      path.write_text(json.dumps(lock), encoding='utf-8')
      with self.assertRaisesRegex(ValueError, 'SHA-384'):
        markdown.load_lock(path)


if __name__ == '__main__':
  unittest.main()
