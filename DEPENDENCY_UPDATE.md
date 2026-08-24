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

Unicode Emoji and CLDR search data use `scripts/emoji-data-lock.json` instead of the runtime dependency
registry. The monthly workflow regenerates the lock, local asset, and service-worker revision from the
latest stable official sources. When they change, it force-with-lease updates one automation branch and
creates or refreshes a review PR; it never merges that PR automatically. A removed emoji sequence,
unknown group, unexpected missing annotation, source format change, or size-budget violation stops the
update for manual review. A normal stagger where a new Unicode release precedes matching CLDR annotations
keeps the current compatible data without failing the monthly workflow.
