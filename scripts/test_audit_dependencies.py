import unittest

import audit_dependencies as audit


class DependencyAuditTests(unittest.TestCase):
  def test_collect_pins_deduplicates_assets_for_the_same_package_version(self):
    pins = audit.collect_pins({
      'cdn': {
        'script': {'package': 'example', 'version': '1.0.0'},
        'style': {'package': 'example', 'version': '1.0.0'},
      },
      'vendored': {},
      'tests': {},
    })
    self.assertEqual(pins, [audit.PackagePin(
      'example', '1.0.0', ('cdn.script', 'cdn.style'),
    )])

  def test_report_lists_updates_and_current_vulnerabilities(self):
    pins = [audit.PackagePin('example', '1.0.0', ('cdn.example',))]
    latest = {'example': {'version': '2.0.0', 'deprecated': 'maintenance ended'}}
    osv = {('example', '1.0.0'): [{'id': 'OSV-1'}], ('example', '2.0.0'): []}
    github = {('example', '1.0.0'): [], ('example', '2.0.0'): []}
    report, vulnerable = audit.render_report(pins, latest, osv, github)
    self.assertTrue(vulnerable)
    self.assertIn('`example@1.0.0`: OSV-1', report)
    self.assertIn('| `example` | 1.0.0 | 2.0.0 | 알려진 취약점 없음 |', report)
    self.assertIn('maintenance ended', report)

  def test_advisory_labels_merge_both_sources(self):
    labels = audit.advisory_labels(
      [{'id': 'GHSA-one'}],
      [{'ghsa_id': 'GHSA-two'}, {'cve_id': 'CVE-2026-1'}],
    )
    self.assertEqual(labels, ['CVE-2026-1', 'GHSA-one', 'GHSA-two'])


if __name__ == '__main__':
  unittest.main()
