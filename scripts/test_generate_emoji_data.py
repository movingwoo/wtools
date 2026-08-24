import unittest

import generate_emoji_data as emoji_data


class EmojiDataTest(unittest.TestCase):
  def test_version_parsers(self):
    self.assertEqual(
      emoji_data.parse_ucd_version('data for Version 17.0.0 of the Unicode Standard.'),
      '17.0',
    )
    self.assertEqual(emoji_data.parse_cldr_version({'tag_name': 'release-48-2'}), '48.2')
    self.assertEqual(emoji_data.parse_cldr_version({'tag_name': 'release-49'}), '49')
    self.assertEqual(emoji_data.parse_cldr_version({'tag_name': 'release-49-1-2'}), '49.1.2')

  def test_version_parsers_reject_unknown_formats(self):
    with self.assertRaises(ValueError):
      emoji_data.parse_ucd_version('Unicode latest')
    with self.assertRaises(ValueError):
      emoji_data.parse_cldr_version({'tag_name': 'v48.2'})

  def test_search_terms_remove_label_and_other_duplicates(self):
    self.assertEqual(
      emoji_data.search_terms('로켓', ['로켓', '발사'], ['rocket', 'launch', 'rocket']),
      '발사 rocket launch',
    )


if __name__ == '__main__':
  unittest.main()
