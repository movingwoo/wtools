import copy
import json
import unittest
from unittest import mock

import check_jmespath_specs as jmespath_specs


class JmesPathSpecLockTests(unittest.TestCase):
  def test_specification_suite_hashes_and_inventory_are_pinned(self):
    lock = jmespath_specs.load_lock()
    self.assertEqual(lock['standard'], 'JMESPath 1.0')
    self.assertEqual(lock['suiteRepository'], 'jmespath/jmespath.test')
    self.assertEqual(lock['jepRepository'], 'jmespath/jmespath.jep')
    self.assertEqual(lock['totalCases'], 892)
    self.assertEqual(lock['resultCases'], 742)
    self.assertEqual(lock['errorCases'], 150)
    self.assertEqual(lock['benchmarkCases'], 16)
    self.assertEqual(len(lock['supportedFunctions']), 26)
    self.assertTrue(jmespath_specs.sha384_sri(b'jmespath').startswith('sha384-'))

  def test_changed_case_inventory_is_rejected(self):
    lock = copy.deepcopy(jmespath_specs.load_lock())
    lock['resultCases'] += 1
    with self.assertRaisesRegex(ValueError, 'inventory'):
      jmespath_specs.validate_lock(lock)

  def test_changed_jep_metadata_is_rejected(self):
    lock = copy.deepcopy(jmespath_specs.load_lock())
    lock['jepBranch'] = 'master'
    with self.assertRaisesRegex(ValueError, 'JEP'):
      jmespath_specs.validate_lock(lock)

  @mock.patch.object(jmespath_specs, 'request')
  def test_branch_commit_uses_the_returned_sha(self, request):
    request.return_value = json.dumps({'sha': 'a' * 40}).encode()
    self.assertEqual(jmespath_specs.branch_commit('owner/repo', 'master'), 'a' * 40)

  def test_stale_review_date_is_rejected(self):
    lock = copy.deepcopy(jmespath_specs.load_lock())
    lock['reviewed'] = '2020-01-01'
    with self.assertRaisesRegex(ValueError, 'stale'):
      jmespath_specs.validate_lock(lock)


if __name__ == '__main__':
  unittest.main()
