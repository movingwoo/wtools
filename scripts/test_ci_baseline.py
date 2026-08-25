import unittest
from datetime import datetime, timezone

import audit_ci_baseline as baseline
import check_workflow_freshness as freshness


class CiBaselineTests(unittest.TestCase):
  def test_current_policy_matches_local_workflows(self):
    self.assertEqual(baseline.validate_local(baseline.load_policy()), [])

  def test_recent_successful_compatibility_run_passes(self):
    payload = {'workflow_runs': [{
      'conclusion': 'success',
      'head_branch': 'main',
      'created_at': '2026-08-24T00:00:00Z',
      'html_url': 'https://example.test/run/1',
    }]}
    passed, message = freshness.evaluate_runs(
      payload, branch='main', max_age_days=8,
      now=datetime(2026, 8, 25, tzinfo=timezone.utc),
    )
    self.assertTrue(passed)
    self.assertIn('https://example.test/run/1', message)

  def test_stale_or_missing_run_fails(self):
    passed, _ = freshness.evaluate_runs(
      {'workflow_runs': []}, branch='main', max_age_days=8,
      now=datetime(2026, 8, 25, tzinfo=timezone.utc),
    )
    self.assertFalse(passed)
    payload = {'workflow_runs': [{
      'conclusion': 'success', 'head_branch': 'main',
      'created_at': '2026-08-01T00:00:00Z',
    }]}
    passed, message = freshness.evaluate_runs(
      payload, branch='main', max_age_days=8,
      now=datetime(2026, 8, 25, tzinfo=timezone.utc),
    )
    self.assertFalse(passed)
    self.assertIn('제한을 넘었습니다', message)


if __name__ == '__main__':
  unittest.main()
