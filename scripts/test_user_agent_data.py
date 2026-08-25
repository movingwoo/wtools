import unittest

import check_user_agent_data as user_agent


class UserAgentDataTests(unittest.TestCase):
  def test_corpus_matches_parser_metadata_and_required_scope(self):
    corpus, errors = user_agent.check(False)
    self.assertEqual(errors, [])
    self.assertGreaterEqual(len(corpus['cases']), 20)
    self.assertEqual({item['kind'] for item in corpus['cases']}, {'desktop', 'mobile', 'in-app'})


if __name__ == '__main__':
  unittest.main()
