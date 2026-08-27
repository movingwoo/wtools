# Dependency Update Checklist

When upgrading an external library or test runner, complete the following items in the same change:

- Update the npm package name, pinned version, license, review date, and SRI or local SHA-384 in
  `js/dependencies.js`.
- Update the SRI and CSP origins in `index.html`, the cache key in `tests/cdn-cache.js`, and the app shell in `sw.js`.
- For locally pinned assets, verify the upstream and transformed hashes with
  `python3 scripts/vendor_dependencies.py --check`.
- For Playwright, update `tests/package*.json`, the digest-pinned official container, and the
  `validate_static.py` allowlist together.
- Run `npm audit --audit-level=high`, the complete Chromium suite, Firefox/WebKit smoke tests, and the live-CDN nightly check.
- Confirm that the relevant published standard vectors and minimum-browser baseline remain valid.
- Run `python3 scripts/audit_dependencies.py --fail-on-vulnerability` to compare every runtime,
  vendored, and test pin with npm latest, OSV, and GitHub Global Security Advisories. Treat the
  generated update list as a review queue; “no known advisories” is not a security guarantee.
- Update `THIRD_PARTY_NOTICES.md` if the license changed.

The monthly `.github/workflows/maintenance.yml` review summarizes the security audit, available versions,
pinned assets, browser baseline, and representative published vectors.

The same workflow verifies that each registry `tools` list exactly matches its actual `LIB`, global,
or `vendorUrl` consumers. Quarterly metadata lives in `tests/fixtures/user-agents.json`,
`assets/data/network-reference.json`, and `scripts/ci-baseline-lock.json`; the monthly job fails when
one of those reviews becomes older than 100 days. A release archive is published only after
`scripts/check_workflow_freshness.py` finds a successful `compatibility.yml` run from the last eight days.

The syntax highlighter and code formatter keep their language and standard baselines, official source URLs, and review date
in `scripts/syntax-language-lock.json`. The monthly workflow compares actively released language families
with their official current-version pages and fails when the full manual grammar review becomes older than
100 days. Release detection opens a review; it never rewrites keyword or tokenizer rules automatically.

## 2026-08-27 review record

- OSV and GitHub Global Security Advisories reported no known vulnerability for the 23 distinct pinned
  runtime, vendored, and test package versions.
- npm latest matched 12 pins. The review queue contains axe-core 4.13.0, bcryptjs 3.0.3,
  brotli-compress 2.2.2, fflate 0.8.3, js-yaml 5.4.1,
  jsonpath-plus 10.4.0, openpgp 6.3.1, pako 3.0.1, smol-toml 1.8.0,
  sql-formatter 15.8.2, and z-schema 12.4.3. These are review candidates, not automatically approved
  upgrades; major releases and format-sensitive patches require their tool vectors and minimum browsers.
- npm marks crypto-js 4.2.0 and jsrsasign 11.1.5 as no longer maintained. Their pinned versions have no
  known advisory in the two queried databases, and their first-party replacement work remains tracked in
  `TODO.md` rather than being hidden by an unrelated package swap.
- Node.js 22 remains supported through 2027-04-30; Node.js 24 is the newest supported LTS major. Playwright
  1.62.1 is npm latest, both current and minimum container digests resolve to their locked manifests, and
  every pinned official GitHub Action matches its latest major release.

Unicode Emoji and CLDR search data use `scripts/emoji-data-lock.json` instead of the runtime dependency
registry. The monthly workflow regenerates the lock, local asset, and service-worker revision from the
latest stable official sources. When they change, it force-with-lease updates one automation branch and
creates or refreshes a review PR; it never merges that PR automatically. A removed emoji sequence,
unknown group, unexpected missing annotation, source format change, or size-budget violation stops the
update for manual review. A normal stagger where a new Unicode release precedes matching CLDR annotations
keeps the current compatible data without failing the monthly workflow.
