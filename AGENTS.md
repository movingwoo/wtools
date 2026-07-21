# AGENTS.md

## Scope

This file applies to the entire repository.

## Project Overview

W-Tools is a collection of developer utilities that runs as a pure static site. It uses HTML, CSS, and vanilla JavaScript ES modules; there is no build step, package manager, bundler, linter, or automated test suite.

- Keep processing in the browser whenever possible. Do not introduce a backend or send user input to a server unless a feature inherently requires a network request and the UI makes that behavior clear.
- Keep all user-facing text in Korean.
- Preserve direct static hosting compatibility.
- Treat `FEATURES.md` as the feature inventory and update it whenever a tool is added, removed, or materially changed.

## Repository Layout

```text
index.html          Page shell, global libraries, and the `js/main.js` entry point
css/style.css       Shared responsive and light/dark theme styles
js/core.js          Tool registry, shared UI builders, byte helpers, and lazy loaders
js/main.js          Tool imports, hash router, sidebar, search, and generated home page
js/tools/*.js       Category modules; each module registers multiple related tools
assets/             Static images and icons
FEATURES.md         Feature inventory grouped by category
README.md           User-facing project documentation
```

## Running and Validation

Run the site through an HTTP server because ES modules do not work correctly when `index.html` is opened with `file://`:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` and validate changes manually. There are no repository-provided test or lint commands.

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
- `loadScript`, `loadCss`, and `LIB` for lazy-loaded third-party dependencies.

`makeIO` has an important input convention:

- With one input, `process` receives the input string directly: `process(text, opts, actionId)`.
- With multiple inputs, `process` receives an object keyed by input ID: `process(inputs, opts, actionId)`.
- Thrown errors are displayed in the output area, and `process` may return a Promise.
- Input changes run automatically by default. Use `autorun: false` for expensive or explicitly triggered work, and `runOnLoad: true` only when an initial result is useful.
- Use `outputHTML: true` only when returning trusted DOM nodes built by the application. Do not insert untrusted input with `innerHTML`.

## Implementation Conventions

- Follow the style of the surrounding module: ES modules, two-space indentation, semicolons, single-quoted strings, and concise browser-native code.
- Make focused changes. Do not add a framework, build tooling, or package dependency for a small feature.
- Prefer Web APIs and existing helpers. If a substantial library is necessary, load it lazily only when the relevant tool opens; pin its version and add it to `LIB` when it is reusable.
- Keep only `CryptoJS` and `jsyaml` as eagerly loaded globals unless the site architecture is intentionally revised.
- Validate input and throw `Error` objects with clear Korean messages. Avoid silent failures and unexplained coercion.
- Preserve responsiveness, keyboard access, semantic labels, and the existing automatic light/dark theme.
- Revoke object URLs and stop timers or workers when their lifetime ends. Avoid blocking the main thread for large inputs when a chunked or asynchronous approach is practical.
- For algorithms not reasonably covered by a suitable dependency, a small self-contained implementation in the category module is acceptable; match existing implementations such as archive encoders and legacy hashes.
- Never commit secrets, private keys, generated user data, or local machine artifacts.

## Adding or Changing a Tool

1. Locate the matching category module under `js/tools/`; create a new module only when no existing category fits.
2. Register the tool with `tool(...)` and reuse `makeIO` or the shared DOM/helpers where appropriate.
3. Confirm the category string exists in `js/core.js` and the tool ID is not already registered.
4. If a new module was created, import it from `js/main.js`.
5. Update the corresponding category in `FEATURES.md`. Update `README.md` as well if the public overview, setup, or architecture changed.
6. Run the syntax check and perform relevant browser validation.

## Change Discipline

- Preserve unrelated user changes in the working tree.
- Do not edit minified third-party code into the repository when a pinned CDN dependency is sufficient.
- Keep commits and patches limited to the requested behavior; avoid opportunistic large refactors.
- When browser support or a CDN is required, handle failure with a useful Korean message rather than leaving the tool in a broken state.
