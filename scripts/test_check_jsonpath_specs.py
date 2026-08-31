import copy
import json
import unittest
from unittest import mock

import check_jsonpath_specs as jsonpath_specs


class JsonPathSpecLockTests(unittest.TestCase):
  def test_standard_commit_hash_and_supported_inventory_are_pinned(self):
    lock = jsonpath_specs.load_lock()
    self.assertEqual(lock['standard'], 'RFC 9535')
    self.assertEqual(lock['suiteRepository'], 'jsonpath-standard/jsonpath-compliance-test-suite')
    self.assertEqual(lock['totalCases'], 703)
    self.assertEqual(lock['supportedCases'], 647)
    self.assertEqual(lock['excludedTags'], ['match', 'search'])
    self.assertEqual(lock['ianaFunctions'], ['length', 'count', 'match', 'search', 'value'])
    self.assertEqual([item['id'] for item in lock['errata']], [8343, 8352, 8353, 8354, 8779])
    self.assertTrue(jsonpath_specs.sha384_sri(b'jsonpath').startswith('sha384-'))

  def test_changed_supported_inventory_is_rejected(self):
    lock = copy.deepcopy(jsonpath_specs.load_lock())
    lock['supportedCases'] += 1
    with self.assertRaisesRegex(ValueError, 'inventory'):
      jsonpath_specs.validate_lock(lock)

  @mock.patch.object(jsonpath_specs, 'request')
  def test_branch_commit_uses_the_returned_sha(self, request):
    request.return_value = json.dumps({'sha': 'a' * 40}).encode()
    self.assertEqual(jsonpath_specs.branch_commit('owner/repo', 'main'), 'a' * 40)

  def test_iana_csv_and_rfc_errata_are_parsed(self):
    registry = (
      'Function Name,Brief Description,Parameters,Result,Change Controller,Reference\n'
      'length,length,ValueType,ValueType,IETF,RFC9535\n'
      'value,value,NodesType,ValueType,IETF,RFC9535\n'
    ).encode()
    self.assertEqual(jsonpath_specs.current_iana_functions(registry), ['length', 'value'])
    errata = (
      '<h4>Errata-ID: <a href="/eid8343/">8343</a></h4>'
      '<dt>Status:</dt><span class="badge bg-info">Held for Document Update</span>'
    ).encode()
    self.assertEqual(jsonpath_specs.current_errata(errata), [
      {'id': 8343, 'status': 'Held for Document Update'},
    ])

  def test_stale_review_date_is_rejected(self):
    lock = copy.deepcopy(jsonpath_specs.load_lock())
    lock['reviewed'] = '2020-01-01'
    with self.assertRaisesRegex(ValueError, 'stale'):
      jsonpath_specs.validate_lock(lock)


if __name__ == '__main__':
  unittest.main()
