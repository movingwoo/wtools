# W-Tools Development and Release Guide

This guide applies to the long-term effort to replace external runtime dependencies with first-party
implementations and to subsequent general development. Its purpose is to keep the static-site, lazy-loading,
offline, and minimum-browser contracts intact without accumulating UI and algorithm code in the existing
tool modules, and to ship the work in small increments.

## 1. Core principles

- Preserve the current architecture: pure static hosting, vanilla JavaScript ES modules, and no build step.
- Write technical and developer-only documentation in English. Keep the README, TODO, and documents intended
  for end users in Korean. Korean may appear in technical code examples only when it demonstrates required
  user-facing copy.
- Replacing one runtime package with another package does not count as a first-party implementation.
- Prefer standard Web APIs. When Chrome/Edge 110, Firefox 115, or Safari 16.4 lacks a required API,
  document the reduced scope or provide a first-party fallback.
- Do not silently change documented inputs, outputs, file formats, or interoperability while replacing a
  dependency. Treat any necessary reduction in support as a separate product change.
- Limit each change to one external component or a small set that must be replaced together. Do not hold
  completed work for a big-bang migration at the end of a phase.

## 2. Code placement and dependency direction

Use the following boundaries for new first-party implementations:

```text
js/tools/*.js             Tool registration, input validation, options, DOM, and Korean error messages
js/lib/common/            DOM-independent byte, stream, and math primitives
js/lib/<domain>/          Pure parser, format, media, archive, crypto, and PKI implementations
js/workers/               Worker entry points plus message and cancellation adapters
assets/data/              First-party static tables, fonts, and search data
tests/tools/*.spec.js     Tool contracts and browser integration regressions
tests/fixtures.js         Binary, key, and certificate material generated at test time
```

The allowed dependency direction is `tools → lib` and `workers → lib`. Code under `lib` must not import
tool modules, DOM UI, the router, or all of `core.js`. Move generally useful pure byte helpers to
`js/lib/common/` over time and re-export them from `core.js` where the UI layer still needs them.

### Tool modules

- Keep `js/tools/*.js` focused on registration, UI adapters, and short input conversions.
- A simple implementation used by only one tool may remain in its tool module when it is no larger than
  roughly 8 KiB. Move larger, shared, standard-sensitive, or independently tested implementations to
  `js/lib/`.
- When a first-party module exceeds 16 KiB or is needed only after a specific user action, load it with
  `import()` immediately before that action instead of using a static import. Cache the Promise at module
  scope to prevent duplicate requests, but clear the cache after a load failure so the user can retry.
- Do not create barrel modules that re-export every engine and cause one tool route to load unrelated code.

### First-party implementation modules

- Prefer deterministic functions that accept and return `Uint8Array`, strings, or plain objects.
- Do not access the DOM, `localStorage`, routing, user notifications, or arbitrary network resources.
- Use named exports and do not add symbols to global objects. Avoid hidden singleton state and circular
  imports.
- Design APIs so callers can validate parser input length, depth, and item counts; decompression output size
  and ratio; and cryptographic key and parameter limits before expensive work begins.
- Preserve the cause and location in internal errors. The tool adapter must turn them into clear Korean
  messages for users and must not treat unknown errors as success or empty output.

### Workers

- Default to a Worker for operations that may take about 50 ms or longer or scan inputs of 1 MiB or more.
- New code must use a separate module entry point such as `new Worker(new URL(...), { type: 'module' })`
  instead of duplicating the entire Worker implementation in a source string.
- Define contracts for `AbortSignal` cancellation, Worker termination, transferable `ArrayBuffer` ownership,
  progress, and errors.
- The UI thread and Worker must import the same algorithm implementation instead of keeping copies.

## 3. Size and loading budgets

Measure file sizes as UTF-8 source bytes in the repository, not as bundled output because the site has no
build step.

| Target | Budget |
|---|---:|
| Total initial local JavaScript | At most 140 KiB, the existing CI limit |
| One `js/tools/*.js` file | At most 80 KiB |
| One `js/lib/**/*.js` or `js/workers/**/*.js` file | Target 64 KiB, hard limit 128 KiB |
| One new WASM or data asset | Review splitting, alternatives, and transfer size above 256 KiB |

- Do not add first-party algorithms to initial-load files. Keep only small, stable UI or byte contracts used
  by at least three tools in `core.js`.
- When changing an existing tool module near 80 KiB, extract the relevant implementation to `js/lib/`
  before adding functionality.
- Every replacement PR must show before-and-after raw sizes for removed CDN or local third-party assets and
  new JS, WASM, or data; the static release ZIP size; and bytes fetched on the first execution of the tool.
- Readable source may be larger than minified third-party code, but it must not increase the initial load or
  make unrelated tools download more code.

The service worker currently precaches every tool and large third-party asset as part of the app shell.
Before merging the first first-party engine larger than 64 KiB, split the cache into two tiers:

1. `shell`: precache only the home page, router, theme, CSS, icons, and tool metadata at installation time.
2. `runtime`: cache tool UI, first-party engines, Workers, and large data after the first successful use.

The core application will then remain available offline immediately after installation, while a heavy tool
will become available offline after it has been opened once online. If an uncached engine is requested while
offline, show a data-free Korean explanation and a retry action. Update the README offline contract and
service-worker regression tests when this architecture changes.

## 4. External dependency replacement procedure

1. **Freeze the contract:** Record the currently supported options, formats, errors, and known boundaries
   in tests before implementing the replacement.
2. **Implement independently:** Build a UI-independent API under `js/lib/` and verify it directly with
   published standard vectors.
3. **Run differential tests:** Feed normal, boundary, and malformed inputs to both the old library and the
   new implementation. Round trips alone are not evidence of correctness.
4. **Connect the tool:** Dynamically import the code only for the relevant action. Connect Worker execution,
   cancellation, and progress for large inputs.
5. **Cut over atomically:** In the change that makes the new implementation the default, also remove the old
   loader calls, registry entries, local third-party files, service-worker entries, and obsolete CSP origins.
6. **Document the result:** Update `FEATURES.md`, user guidance, and the Unreleased section of
   `CHANGELOG.md` whenever behavior or support scope changes.

Do not silently fall back to the old CDN implementation after an error in production. Such a fallback hides
defects, breaks the offline contract, and makes the external dependency permanent. Use the old implementation
only as a test oracle before cutover.

## 5. Verification requirements

Every replacement must pass the following checks:

- Published standard vectors and the project's existing browser contract tests
- Cross-checks against an available independent oracle such as a Node.js or Python standard library,
  OpenSSL, or an unrelated implementation
- Empty input, maximum boundaries, truncated input, invalid lengths, checksums, and tags, excessive nesting,
  and memory-exhaustion attempts
- Cancellation of large Worker tasks, route-exit cleanup, `ArrayBuffer` ownership, and object URL revocation
- The full Chromium suite, relevant Firefox and WebKit smoke tests, and static or scheduled minimum-browser
  compatibility checks
- Home-page initial loading, direct tool URL reloads, first-load failure, and offline operation after caching

Cryptography and PKI replacements also require checks for known attacks and misuse, key-format
interoperability, secure randomness, constant-time comparison, parameter limits, and accidental exposure of
sensitive values in errors, logs, or URLs. Compression and archive replacements also require compression-bomb,
path-traversal, CRC or checksum, and bidirectional interoperability tests with independently generated files.

## 6. Stable release checklist

1. Confirm that the candidate has no out-of-scope behavior changes or incomplete feature flags.
2. Record user-visible changes, security notes, and tests in the Unreleased section of `CHANGELOG.md`.
3. Run `node scripts/generate_tool_manifest.mjs` when tool metadata changed.
4. Run `python3 scripts/update_cache_version.py`, then pass `python3 scripts/validate_static.py`.
5. Pass the full Chromium suite and Firefox/WebKit smoke tests, plus risk-specific gates.
6. Move Unreleased entries to a versioned and dated section, and ensure the `vX.Y.Z` tag points to the
   tested `main` commit.
7. Verify that GitHub Release produced the static ZIP and SHA-256 file, and verify the Pages home page,
   direct tool URL, service-worker update, and offline recovery.

Do not overwrite a tag or release artifact when a post-release problem appears. Revert the causal change or
apply a forward fix on `main`, then publish a new PATCH version. For data-format or cryptographic compatibility
issues, identify the affected input and version in the changelog.
