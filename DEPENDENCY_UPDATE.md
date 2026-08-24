# Dependency Update Checklist

When upgrading an external library or test runner, complete the following items in the same change:

- Update the pinned version, license, review date, and SRI or local SHA-384 in `js/dependencies.js`.
- Update the SRI and CSP origins in `index.html`, the cache key in `tests/cdn-cache.js`, and the app shell in `sw.js`.
- For locally pinned assets, verify the upstream and transformed hashes with
  `python3 scripts/vendor_dependencies.py --check`.
- For Playwright, update `tests/package*.json`, the digest-pinned official container, and the
  `validate_static.py` allowlist together.
- Run `npm audit --audit-level=high`, the complete Chromium suite, Firefox/WebKit smoke tests, and the live-CDN nightly check.
- Confirm that the relevant published standard vectors and minimum-browser baseline remain valid.
- Update `THIRD_PARTY_NOTICES.md` if the license changed.

The monthly `.github/workflows/maintenance.yml` review summarizes the security audit, available versions,
pinned assets, browser baseline, and representative published vectors.
