# AGENTS.md

## Scope

This file applies to the entire repository.

## Project Overview

W-Tools is a collection of developer utilities that runs as a pure static site. It uses HTML, CSS, and vanilla JavaScript ES modules; the site itself has no build step, package manager, bundler, or linter. CI runs syntax/static validation and a Playwright browser suite (`tests/`, CI-only — never required for hosting or serving the site) that covers both rendering and per-tool input/output accuracy.

- Keep processing in the browser whenever possible. Do not introduce a backend or send user input to a server unless a feature inherently requires a network request and the UI makes that behavior clear.
- Keep all user-facing text in Korean.
- Preserve direct static hosting compatibility.
- Treat `FEATURES.md` as the feature inventory and update it whenever a tool is added, removed, or materially changed.

## Repository Layout

```text
index.html          Page shell, global libraries, and the `js/main.js` entry point
css/style.css       Shared responsive and light/dark theme styles
js/core.js          Tool registry, shared UI builders, byte helpers, and lazy loaders
js/main.js          Tool manifest registration, lazy module loader, hash router, sidebar, search, and generated home page
js/tool-manifest.js Generated search/home metadata and tool-to-module mapping
js/tools/*.js       Category modules; each module registers multiple related tools
js/lib/**           First-party, DOM-independent algorithms and format implementations
js/workers/**       Module Worker entry points for expensive first-party implementations
assets/             Static images and icons
manifest.json       PWA manifest (installability, icons, theme color)
sw.js               Service worker; precaches the app shell, then network-first for offline support
tests/              Playwright browser tests (CI-only; own package.json, not part of the site)
tests/tools/        Per-tool input/output cases, one spec per `js/tools/` module
tests/helpers.js    Shared UI driver and the table-driven `toolCases` runner
tests/fixtures.js   Test material built at run time (images, certificates, keys)
tests/cdn-cache.js  Fixture that serves lazily loaded CDN libraries from a local cache
scripts/            Dependency-free repository and static-site validation scripts
.github/workflows/  validate.yml on every PR and main push; nightly.yml once a day
FEATURES.md         Feature inventory grouped by category
README.md           User-facing project documentation
DEVELOPMENT_GUIDE.md Code boundaries, size budgets, dependency replacement, and release rules
```

## Running and Validation

Run the site through an HTTP server because ES modules do not work correctly when `index.html` is opened with `file://`:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` and validate changes manually.

CI (`.github/workflows/validate.yml`) checks JavaScript syntax, validates registrations and static assets, and runs the Playwright browser suite on every PR and every push to `main`. Nightly re-runs Chromium against the real CDN; scheduled compatibility and maintenance workflows cover the closest minimum engines and monthly dependency/standards review. CI uses digest-pinned official Playwright images, and `validate_static.py` keeps the primary image and package versions aligned. To run the browser tests locally, use the Node version pinned in both `.node-version` and `tests/.node-version` (22, the same major CI uses). The test package rejects other Node majors, and `validate_static.py` keeps the two version files aligned. With `fnm` or `nvm` installed, the version switches automatically on entering either the repository or `tests/`.

```bash
cd tests
npm ci
npm run test:collect -- --project=chromium  # quick runner startup and test collection check
npx playwright install chromium
npx playwright test --project=chromium
npx playwright install firefox webkit        # optional: add Firefox/WebKit smoke projects
npx playwright test                          # Chromium full + Firefox/WebKit smoke
npx playwright test --project=chromium tools/network.spec.js  # one module
npx playwright test --project=chromium -g "subnet"            # by case name
```

## Browser Tests

The suite has two layers:

- `smoke.spec.js` and `tools-render.spec.js` cover the app shell, routing, search, and that every registered tool renders without console errors.
- `tests/tools/<module>.spec.js` covers the output each tool produces, one spec per `js/tools/` module.
- Chromium runs the entire suite. Firefox and WebKit run `smoke.spec.js`, `tools-render.spec.js`, and `tools/media.spec.js` sequentially in the same containerized CI job. Use `--project=chromium` for the normal local fast path.

Follow these conventions when adding cases:

- Declare cases as a table and run them with `toolCases('<module>', cases)` from `tests/helpers.js`. Write a plain `test(...)` only when a case needs custom steps such as file upload, downloads, or a multi-step flow. The group name is what identifies the spec in failure output, because table-driven tests report `helpers.js` as their location.
- Verify time- or random-dependent tools by format (regex, length, range), never by exact value.
- Use published test vectors for anything backed by a standard (hash, cipher, fingerprint) and cross-check against a second implementation, such as a Node built-in, where practical.
- Build binary and secret material at run time in `tests/fixtures.js`. Do not commit images, archives, or private keys.
- Stub external network calls with `page.route` so a case never depends on a live service.
- Console errors fail every test. Allow an expected one with `test.use({ allowConsoleErrors: ['...'] })` and explain why in a comment.

CDN libraries loaded lazily by tools are cached on disk by `tests/cdn-cache.js`, so a CDN hiccup does not fail a run and repeat runs stay offline. The cache lives in `tests/.lib-cache` (gitignored; CI restores it with `actions/cache`), and the browser still validates every cached response against the SRI hash pinned in `js/core.js`. The same fixture disables service worker registration with an init script, because `sw.js` caches those same external hosts and a request a service worker handles is invisible to `page.route`. Do not replace this with Playwright's `serviceWorkers: 'block'` — that option injects an init script that reads `navigator.serviceWorker`, which is a `SecurityError` inside the empty-sandbox preview iframe the markdown tool builds, and the resulting `pageerror` fails the console guard. Browser tests do not touch the real CDN; `.github/workflows/nightly.yml` checks every registered CDN response, CORS header, and SRI pin once a day to catch a dead pin or a withdrawn package. It does not re-run the browser suite. A new browser test entry point must spread `cdnCache` into its `test.extend({ ... })`.

For a quick JavaScript syntax/module check on macOS, use:

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc --module-file=js/tools/<file>.js
```

An error such as `Can't find variable: TextEncoder` is expected when the parsed module reaches browser-only APIs. Other syntax or module errors must be fixed.

For UI changes, check at minimum:

- The home page and sidebar render without console errors.
- Search finds the tool by its name, ID, description, and keywords.
- Direct navigation to `#/tool/<id>` works, including a page reload.
- The changed tool handles valid, empty, and invalid input.
- Copy, download, file upload, and async behavior work when relevant.
- The layout remains usable on narrow screens and in light and dark color schemes.

## Architecture and Core APIs

Tools register themselves at module evaluation time:

```js
tool({
  id: 'my-tool',
  cat: '문자열 / 텍스트',
  name: '내 도구',
  desc: '도구 설명',
  keywords: '검색 키워드',
  render(root) {
    // Build the tool UI here.
  },
});
```

- Use a unique, stable, lowercase kebab-case `id`.
- Set `cat` to an exact value from `categories` in `js/core.js`.
- Add the category module import to `js/main.js` only when creating a new module. Registered tools automatically appear in routing, search, the sidebar, and the home page.
- Assume `render(root)` runs again each time the route opens. Keep state local to the render and clean up global listeners, timers, workers, and object URLs when necessary.

Prefer shared APIs from `js/core.js` instead of duplicating them:

- `makeIO(root, cfg)` for standard input, options, actions, and output UI.
- `h(tag, attrs, ...kids)` for custom DOM construction. Use it for file-oriented or otherwise nonstandard interfaces.
- `strToBytes`, `bytesToStr`, `bytesToHex`, `hexToBytes`, `bytesToB64`, `b64ToBytes`, `decodeInput`, and `encodeOutput` for byte conversions.
- `kvTable`, `copyBtn`, `download`, and `downloadZip` for common result actions.
- `loadScript`, `loadCss`, and `LIB` for lazy-loaded third-party dependencies; `loadModule(url)` for a dependency published only as an ES module.

`makeIO` has an important input convention:

- With one input, `process` receives the input string directly: `process(text, opts, actionId)`.
- With multiple inputs, `process` receives an object keyed by input ID: `process(inputs, opts, actionId)`.
- Thrown errors are displayed in the output area, and `process` may return a Promise. With `cancelable: true`, `process` receives an `AbortSignal` as its fourth argument and the UI gains a cancel button.
- Input changes run automatically by default. Use `autorun: false` for expensive or explicitly triggered work, and `runOnLoad: true` only when an initial result is useful.
- Use `outputHTML: true` only when returning trusted DOM nodes built by the application. Do not insert untrusted input with `innerHTML`.

## Implementation Conventions

- Write technical and developer-only documentation in English. Keep `README.md`, `TODO.md`, and documents intended for end users in Korean; Korean strings may also appear in technical code examples when they intentionally demonstrate required user-facing copy.
- Follow the style of the surrounding module: ES modules, two-space indentation, semicolons, single-quoted strings, and concise browser-native code.
- Make focused changes. Do not add a framework, build tooling, or package dependency for a small feature.
- Follow `DEVELOPMENT_GUIDE.md` for module boundaries, size budgets, Worker use, external-dependency replacements, and release gates.
- Prefer Web APIs and existing helpers. Do not replace an existing runtime dependency with another package and call it an internal implementation. If a new external runtime library is unavoidable for an unrelated feature, document the reason, load it lazily, pin it, and register it in `LIB`.
- Do not add eagerly loaded globals. `CryptoJS` is a temporary legacy exception only until its replacement work is complete.
- Stay within the browser baseline documented in `README.md` (Chrome/Edge 110, Firefox 115, Safari 16.4). Regex lookbehind, `structuredClone`, `findLast`, `toSorted`/`toReversed`/`with`, and import maps are available; `Intl.Segmenter` is not (Firefox 125) and stays behind a `typeof` guard. Tool implementations are dynamically imported, so a parse failure is isolated to that module, but the minimum syntax policy still applies to every module and is checked by `scripts/check_browser_compat.mjs` plus the scheduled baseline-engine job.
- Validate input and throw `Error` objects with clear Korean messages. Avoid silent failures and unexplained coercion.
- Preserve responsiveness, keyboard access, semantic labels, and the existing automatic light/dark theme.
- Revoke object URLs and stop timers or workers when their lifetime ends. Avoid blocking the main thread for large inputs when a chunked or asynchronous approach is practical.
- Keep only one-tool implementations of roughly 8 KiB or less in a category module. Put larger, shared, standard-sensitive, or Worker-backed first-party implementations under `js/lib/` and keep `js/tools/` focused on registration and UI adaptation.
- Never commit secrets, private keys, generated user data, or local machine artifacts.

## Adding or Changing a Tool

1. Locate the matching category module under `js/tools/`; create a new module only when no existing category fits.
2. Register the tool with `tool(...)` and reuse `makeIO` or the shared DOM/helpers where appropriate.
3. Confirm the category string exists in `js/core.js` and the tool ID is not already registered.
4. Run `node scripts/generate_tool_manifest.mjs` so the tool metadata and module mapping stay current.
5. Update the corresponding category in `FEATURES.md`. Update `README.md` as well if the public overview, setup, or architecture changed.
6. Add or update a case in `tests/tools/<module>.spec.js` that covers the new or changed behavior.
7. Run the syntax check and perform relevant browser validation.

## Change Discipline

- Preserve unrelated user changes in the working tree.
- Do not edit minified third-party code into the repository when a pinned CDN dependency is sufficient.
- Keep commits and patches limited to the requested behavior; avoid opportunistic large refactors.
- When browser support or a CDN is required, handle failure with a useful Korean message rather than leaving the tool in a broken state.
