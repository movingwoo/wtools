import copy
import datetime as dt
import unittest

import check_syntax_languages as syntax_languages


class SyntaxLanguageLockTests(unittest.TestCase):
  def setUp(self):
    self.lock = syntax_languages.load_lock()

  def test_repository_lock_is_valid(self):
    self.assertEqual(set(self.lock['profiles']), syntax_languages.SUPPORTED_LANGUAGES)
    self.assertEqual(syntax_languages.check_age(self.lock, dt.date(2026, 12, 6)), [])

  def test_stale_review_fails(self):
    errors = syntax_languages.check_age(self.lock, dt.date(2026, 12, 7))
    self.assertRegex(errors[0], r'reviewed \d+ days ago')

  def test_missing_profile_is_rejected(self):
    data = copy.deepcopy(self.lock)
    del data['profiles']['rust']
    with self.assertRaisesRegex(ValueError, 'profile mismatch'):
      syntax_languages.validate_lock(data)

  def test_extracts_first_and_max_versions(self):
    first = {'pattern': r'Version (\d+\.\d+)', 'selection': 'first'}
    maximum = {'pattern': r'Version (\d+\.\d+)', 'selection': 'max-version'}
    text = 'Version 3.3 Version 4.0 Version 3.4'
    self.assertEqual(syntax_languages.extract_version(text, first), '3.3')
    self.assertEqual(syntax_languages.extract_version(text, maximum), '4.0')

  def test_latest_check_reports_changed_release(self):
    lock = copy.deepcopy(self.lock)
    lock['releaseChecks'] = {
      'go': {
        'url': 'https://example.test/go', 'pattern': r'go(\d+\.\d+)',
        'expected': '1.27', 'selection': 'first',
      },
    }
    errors = syntax_languages.check_latest(lock, lambda _url: 'go1.28.0')
    self.assertEqual(errors, ['go: reviewed 1.27, current 1.28'])

  def test_release_check_labels_can_share_one_language_profile(self):
    lock = copy.deepcopy(self.lock)
    lock['releaseChecks'] = {
      'sql:vendor': {
        'url': 'https://example.test/sql', 'pattern': r'SQL (\d+)',
        'expected': '2023', 'selection': 'first',
      },
    }
    syntax_languages.validate_lock(lock)
    self.assertEqual(syntax_languages.check_latest(lock, lambda _url: 'SQL 2024'), [
      'sql:vendor: reviewed 2023, current 2024',
    ])


if __name__ == '__main__':
  unittest.main()
