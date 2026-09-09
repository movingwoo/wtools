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
100 days. SQL checks track the ISO/IEC 9075-2 publication, its published corrigendum and next-edition stage,
plus the current PostgreSQL, MySQL, and SQLite documentation. Release detection opens a review; it never
rewrites keyword or tokenizer rules automatically.

The first-party gzip, zlib, and raw DEFLATE codec keeps its reviewed WHATWG Compression Standard,
the complete related Web Platform Tests subtree, RFC 1950/1951/1952/7932/9841 source hashes, and RFC Editor
errata inventory in `scripts/compression-spec-lock.json`. Pull-request validation checks the lock
shape without network access. The monthly workflow fetches every pinned source and compares the
latest standard and WPT path commits; a change fails the review for a deliberate implementation and
vector assessment rather than modifying the codec automatically.

Brotli compression uses `js/lib/archive/brotli-encode.js`; decompression still uses the
registered `brotli` dependency until its separate replacement. The monthly filter includes
`brotli`/`Brotli` tests for the pinned public WPT vector, Node interoperability, block boundaries,
generated input, cancellation, and offline use. RFC 7932 erratum 5948 is editorial; 6977 concerns
implicit distances during distance block switches, neither of which this encoder emits.
Compression levels retain their numeric API but control this encoder's bounded match search;
compressed bytes and ratios are deliberately not matched to Google's quality implementation.

The Brotli encoder's prefix/length tables are fixed format definitions, not a periodically refreshed
dataset. The monthly review also checks RFC 7932 JSON relationship metadata (new updates or obsoleting
RFCs), RFC 9841 and its errata, all public Google Brotli release notes, and public repository security
advisories. The JSON snapshots keep security-relevant release fields and bodies, including old releases,
but exclude download counters and other volatile statistics. Malformed/empty release responses and a
100-item page require review rather than silently truncating the inventory. These three requests use
public endpoints; a request error fails the audit.

RFC 9841 adds shared dictionaries, a large-window extension, and framing. It does not require replacing
our ordinary RFC 7932 output; those optional formats remain outside the tool contract. The reviewed
Google v1.2.0 release discusses output limits in its Python wrapper. Native/Python defects are not
automatically defects in this JavaScript encoder, but the class of risk applies to decoder review.
The retained npm `brotli` decoder is independently covered by the existing npm/OSV/GitHub dependency
audit. The 2026-09-08 check found npm latest 1.3.3 and no registered advisory for that pin. This does
not establish a streaming memory bound: the decoder still expands its output allocation before the
Worker can reject the final result. The next decoder replacement must enforce limits before growth.
Do not respond to upstream notices by automatically copying or updating a native encoder.

ZIP creation and extraction use the first-party classic ZIP implementation in `js/lib/archive/zip.js`.
It shares the first-party DEFLATE codec, runs through a module Worker, and rejects ZIP64, encrypted entries,
unsafe paths, overlapping local records, checksum mismatches, and configured expansion limits. The same
monthly standards audit pins the official PKWARE APPNOTE 6.3.10 source and fails if that stable URL changes.
ZIP format changes are reviewed against the source, Python's `zipfile` implementation, and the browser
regression fixtures; they are never applied automatically.

LZMA uses the first-party Alone codec in `js/lib/archive/lzma.js`, not an installed SDK or liblzma.
The compression lock pins the 2015-06-14 specification bundle and four mutable upstream documents:
the official SDK page (including its specification link), 7-Zip's release/security history, XZ's
`doc/lzma-file-format.txt` on the current upstream branch, and the XZ home page with its security notices.
`python3 scripts/check_compression_specs.py --check-latest` compares full-document SHA-384 snapshots.
Even a corrected advisory, new specification URL, removed content, or non-security page edit requests
human review. Network failures also fail the audit; no parser can silently treat a changed page as empty.
Monthly Chromium vectors explicitly include every `lzma`/`LZMA` case, including Python differential
tests, unique single-bit mutations, bounded previews, full downloads, and offline execution.

When a snapshot changes, read the official diff and assess whether it changes the Alone bitstream or a
corresponding JavaScript validation path. An SDK/XZ notice does not by itself establish that this codec
is affected: native memory bugs, XZ/LZMA2, archive filesystem extraction, and Mark-of-the-Web behavior
are not shipped here. Add a regression for applicable cases, run the LZMA and browser/release gates,
then deliberately update the reviewed hashes/date. Do not automatically import new SDK code or bump
runtime dependencies. The 2026-09-07 snapshot includes SDK 26.03, the 7-Zip 26.03/26.02 notices, and
the XZ security section; future changes remain review items, not automatic vulnerability conclusions.

## 2026-09-04 security update

- Upgraded the CDN pin from fflate 0.8.2 to 0.8.3 for GHSA-px8p-9vwx-vf98, including a freshly computed
  SHA-384 pin and a new external service-worker cache generation as an interim mitigation. The runtime pin
  was subsequently removed when ZIP creation and extraction moved to the first-party implementation.
- The ZIP tool's directory preflight already rejects ZIP64 before fflate runs. A regression fixture now
  covers the advisory shape: a ZIP64 central entry whose compressed-size sentinel has no required ZIP64
  extra field.
- The remaining version candidates from the 2026-08-28 review are still compatibility review items and
  were not bundled into this security-only update.

## 2026-08-28 review record

- OSV and GitHub Global Security Advisories reported no known vulnerability for the 22 distinct pinned
  runtime, vendored, and test package versions.
- npm latest matched 12 pins. The review queue contains axe-core 4.13.0, bcryptjs 3.0.3,
  brotli-compress 2.2.2, fflate 0.8.3, js-yaml 5.4.1,
  jsonpath-plus 10.4.0, openpgp 6.3.1, pako 3.0.1, smol-toml 1.8.0,
  and z-schema 12.4.4. These are review candidates, not automatically approved
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
