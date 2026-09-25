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

Brotli uses the first-party `js/lib/archive/brotli-encode.js` and `brotli-decode.js`.
The monthly filter includes
`brotli`/`Brotli` tests for the pinned public WPT vector, Node interoperability, block boundaries,
generated input, cancellation, and offline use. RFC 7932 erratum 5948 is editorial; 6977 concerns
implicit distances during distance block switches. The decoder follows section 10: an
implicit distance consumes neither a distance symbol nor a distance block count.
Compression levels retain their numeric API but control this encoder's bounded match search;
compressed bytes and ratios are deliberately not matched to Google's quality implementation.

The Brotli prefix/length tables, static dictionary, context tables, and 121 transformations are
fixed format definitions, not a periodically refreshed dataset. `scripts/generate_brotli_data.py`
extracts normative data from the pinned RFC, checks its published lengths/CRCs, and reproduces
`assets/data/brotli-dictionary.bin` and `js/lib/archive/brotli-tables.js`. Run it with `--check`
to compare against the source without writing. Every PR validates their fixed SHA-256 hashes
offline through the compression gate; Worker dictionary requests use a fixed SHA-384 SRI pin.
The RFC-derived data is attributed and licensed in `THIRD_PARTY_NOTICES.md`.
The monthly review also checks RFC 7932 JSON relationship metadata (new updates or obsoleting
RFCs), RFC 9841 and its errata, all public Google Brotli release notes, and public repository security
advisories. The JSON snapshots keep security-relevant release fields and bodies, including old releases,
but exclude download counters and other volatile statistics. Malformed/empty release responses and a
100-item page require review rather than silently truncating the inventory. These three requests use
public endpoints; a request error fails the audit.

RFC 9841 adds shared dictionaries, a large-window extension, and framing. It does not require replacing
our ordinary RFC 7932 output; those optional formats remain outside the tool contract. The reviewed
Google v1.2.0 release discusses output limits in its Python wrapper. Native/Python defects are not
automatically defects in this JavaScript encoder, but the class of risk applies to decoder review.
The npm `brotli` runtime dependency has been removed. Its previously documented P1 intermediate
output-allocation risk is addressed by checking each declared meta-block against the remaining
128 MiB / 200:1 budget before reading its trees or allocating output pages. Header window sizes
never cause an output allocation, and output page capacity stays within the configured budget.
The final contiguous output copy and input are additional live memory; the bound is an output
budget, not a guarantee about total browser process memory. See `js/lib/archive/brotli-decode.md`.
Do not respond to upstream notices by automatically copying or updating a native encoder.

The 2026-09-10 live audit detected XZ Utils 5.8.4 and the 2026-09-09
[GHSA-5qpq-xqfv-j9pg advisory](https://tukaani.org/xz/invalid-write-after-reinit.html).
It affects native `.lzma`/`.lz`/MicroLZMA decoder reinitialization after an allocation
failure. W-Tools ships no liblzma, and `lzma.js` creates a new range decoder, model,
and output for each invocation; Workers are discarded after completion or failure.
The native stale-state sequence therefore does not apply to this implementation.
The LZMA cases passed in the full Chromium run before the reviewed XZ page hash was
updated. This is an applicability assessment, not a blanket claim about all decoder bugs.

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

## First-party Zstandard, Bzip2 and LZ4

The phase-3 runtime packages `@bokuweb/zstd-wasm`, `fzstd`, `seek-bzip` and `lz4js`
are removed. Their format readers/writers live under `js/lib/archive/` and execute
through `js/workers/archive-codec.js`. See `js/lib/archive/phase3-codecs.md` for
contracts, format references, implementation choices, resource bounds and measurements.
Run `tests/tools/archive.spec.js` with `-g 'zstd|bzip2|lz4'`, the service-worker tests,
and the minimum-engine suite when updating these codecs. Python's `bz2`, system
`liblz4` and `libzstd`, and Node 22's zlib provide independent test oracles. The official
Ubuntu Playwright image includes `liblz4-1` and `libzstd1`; on macOS install the
Homebrew `lz4` and `zstd` formulae to run these tests. None is a site dependency.
The Bzip2 randomisation numbers and RFC Zstandard tables are fixed format data;
retain the attribution in `THIRD_PARTY_NOTICES.md` when regenerating or moving them.

The monthly `check_compression_specs.py --check-latest` audit also monitors RFC
8878 and RFC 9659 text, errata IDs/statuses and complete errata pages, and both
RFC metadata records (`updated_by`/`obsoleted_by`). RFC 9659's 8 MiB window
requirement applies to HTTP content coding, not this standalone file interface;
monitoring it does not silently impose a new file-size limit.

`phase3Upstream` pins all published Zstandard/LZ4 GitHub release bodies and public
security advisories, their development changelogs, and the official Bzip2 download
page and CHANGES. Release download counters are excluded; old release-body edits
are included. A full 100-entry GitHub response fails for pagination review rather
than quietly losing older notices. Bzip2 has no equivalent upstream GitHub advisory
feed: its official `bzip2-devel` index and every linked quarterly plain-text mailbox
are combined into a snapshot. This detects new/removed quarters and edits to old
messages. The audit rejects malformed/empty archives, network failures, more than
128 archives, more than 4 MiB per archive or 16 MiB total. It never filters messages
by CVE keywords or limits review to a moving time window.

Reviewed 2026-09-25: RFC 8878 has verified errata 6441/6442/7297 and reported
7567/8085/8195/8668; corrected table construction, repeat offsets and the six-literal
minimum for four Huffman streams are already reflected in the implementation.
RFC 9659 has no reported errata. Bzip2 remains released as 1.0.8; discussion of
1.0.9 is not a release. The public
[CVE-2026-42250 notice](https://sourceware.org/pipermail/bzip2-devel/2026q2/000284.html)
concerns `bzip2recover` block arrays, and its
[follow-up](https://sourceware.org/pipermail/bzip2-devel/2026q2/000293.html)
concerns recovery/filesystem handling, neither shipped here. The
[selector-count correction](https://sourceware.org/pipermail/bzip2-devel/2024q4/000223.html)
is compatible with this decoder's full 15-bit selector count and checked indices.
Zstandard 1.5.7's reused native compression-context issue and LZ4's native pointer,
partial-decoding and external-dictionary changes do not match the fresh-call JS
interfaces. These assessments do not imply that future decoder bugs are inapplicable.

Fixed entropy/randomisation tables need no scheduled replacement. Review changed
notices for matching format or validation paths, add applicable regressions, then
deliberately update snapshots. Preserve the global `reviewed` date unless every
compression source has been reviewed. When Node, Python, native liblz4/libzstd or
the pinned Playwright images change, rerun the codec differential and browser
suites, including the LZ4 multi-block memory regression. Ordinary static validation
remains offline; no audit automatically changes runtime code or dependencies.
