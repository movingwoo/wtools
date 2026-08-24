import copy
import json
import unittest
from unittest import mock

import generate_emoji_data as emoji_data


class EmojiDataTest(unittest.TestCase):
  def test_version_parsers(self):
    self.assertEqual(
      emoji_data.parse_ucd_version('data for Version 17.0.0 of the Unicode Standard.'),
      '17.0.0',
    )
    self.assertEqual(emoji_data.parse_cldr_tag({'tag_name': 'release-48-2'}), 'release-48-2')
    self.assertEqual(emoji_data.cldr_version('release-49'), '49')
    self.assertEqual(emoji_data.cldr_version('release-49-1-2'), '49.1.2')

  def test_version_parsers_reject_unknown_formats(self):
    with self.assertRaises(ValueError):
      emoji_data.parse_ucd_version('Unicode latest')
    with self.assertRaises(ValueError):
      emoji_data.parse_cldr_tag({'tag_name': 'v48.2'})

  def test_search_terms_remove_label_and_other_duplicates(self):
    self.assertEqual(
      emoji_data.search_terms('로켓', ['로켓', '발사'], ['rocket', 'launch', 'rocket']),
      '발사 rocket launch',
    )

  def test_source_urls_only_use_versioned_official_sources(self):
    self.assertEqual(
      emoji_data.source_urls('17.0.0', 'release-48-2'),
      {
        'emoji': 'https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt',
        'ko': 'https://raw.githubusercontent.com/unicode-org/cldr/release-48-2/common/annotations/ko.xml',
        'koDerived': 'https://raw.githubusercontent.com/unicode-org/cldr/release-48-2/common/annotationsDerived/ko.xml',
        'en': 'https://raw.githubusercontent.com/unicode-org/cldr/release-48-2/common/annotations/en.xml',
        'enDerived': 'https://raw.githubusercontent.com/unicode-org/cldr/release-48-2/common/annotationsDerived/en.xml',
      },
    )

  def test_lock_is_valid_and_canonical(self):
    lock = emoji_data.load_lock()
    self.assertEqual(emoji_data.lock_bytes(lock), emoji_data.LOCK_PATH.read_bytes())

  def test_lock_rejects_non_official_source_url(self):
    lock = copy.deepcopy(emoji_data.load_lock())
    lock['sources']['emoji']['url'] = 'https://example.com/emoji-test.txt'
    with self.assertRaisesRegex(ValueError, 'invalid emoji source pin'):
      emoji_data.validate_lock(lock)

  def test_update_rejects_removed_emoji(self):
    current = json.dumps({'emoji': [['😀', 0, '웃는 얼굴', 'grinning']]}).encode()
    updated = json.dumps({'emoji': [['🚀', 5, '로켓', 'rocket']]}).encode()
    with self.assertRaisesRegex(ValueError, 'removes 1 emoji'):
      emoji_data.ensure_no_removals(current, updated)

  def test_update_waits_for_cldr_after_a_new_unicode_release(self):
    current = emoji_data.load_lock()
    updated = copy.deepcopy(current)
    updated['unicodeVersion'] = '18.0.0'
    with (
      mock.patch.object(emoji_data, 'latest_lock', return_value=(updated, {})),
      mock.patch.object(
        emoji_data,
        'build',
        side_effect=emoji_data.MissingAnnotationsError('missing annotations'),
      ),
    ):
      self.assertEqual(emoji_data.update(), 0)


if __name__ == '__main__':
  unittest.main()
