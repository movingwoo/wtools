# LZMA codec review

Reviewed on 2026-09-07. This is first-party JavaScript implementing the LZMA1 range
coder, probability models, literal/match state machine, and dictionary references.
No SDK implementation or compiled third-party codec is shipped.

## Format and API

- [LZMA Specification draft, 2015-06-14](https://www.7-zip.org/a/lzma-specification.7z)
  defines the bitstream and includes the seven published example streams used in
  `tests/fixtures.js`. The complete bundle is SHA-384 pinned in
  `scripts/compression-spec-lock.json` and checked by the monthly standards audit.
- [XZ Utils' container description](https://github.com/tukaani-project/xz/blob/master/doc/lzma-file-format.txt)
  clarifies known-size streams with optional EOS markers.
- `compress(Uint8Array, { level = 5 })` returns an Alone stream with a 13-byte
  header, known input size, and EOS, preserving the previous tool's container.
  UI levels 1/5/9 preserve dictionaries of 64 KiB/2 MiB/32 MiB. All integer levels
  1–9 are accepted by the engine. Encoding uses lc=3, lp=0, pb=2.
- `decompress(Uint8Array, { maxOutputLength = 128 MiB, maxRatio = 200 })` supports
  lc=0–8, lp=0–4, pb=0–4, arbitrary dictionary headers (minimum effective size
  4 KiB), known sizes with or without EOS, and unknown sizes with mandatory EOS.
- The engine output is raw bytes. Text conversion belongs to the Worker adapter; invalid UTF-8 and
  NUL bytes remain intact in Base64 and Hex modes. Inputs are not modified.
- XZ, raw LZMA without a header, and LZMA2 are outside the existing tool contract.
  Extra bytes or concatenated Alone streams are rejected. Header, reference,
  length, and final range-state failures are reported with Korean errors and
  input offsets. Alone has no checksum, so these checks cannot detect all damage.

## Resource and Worker contract

Input is capped at 256 MiB before processing. Decoding checks a known output size
before allocation and checks every literal/match before growing or writing the
output. Both the caller's byte limit and the compressed-size ratio apply during
decoding. A dictionary header never determines an allocation: the bounded output
buffer also serves as the dictionary. Literal probability models occupy at most
6 MiB, even for lc=8/lp=4. Unknown-size output grows geometrically within its cap;
growth temporarily holds old and new buffers, plus a final trimmed copy if needed.

The encoder uses bounded greedy hash chains (8–128 candidates), four repeat
distances, matched literals, and short repeats. Chains use four bytes per entry,
capped at the smaller of input and dictionary size, plus two 256 KiB hash tables.
Input, encoded output, and copies made during output growth also occupy memory.
This is not the SDK's optimal parser: compressed bytes and ratios may differ.

The UI sends `{ codec: 'lzma', action, level, presentation: { text, ifmt, ofmt } }`
to the module Worker in `js/workers/archive-codec.js`. The Worker lazily imports
the engine and `lzma-io.js`, validates the decoded byte length before allocation,
and performs input decoding, compression/decompression, and output formatting off
the main thread. The adapter formats in 24 KiB byte chunks into Blob parts, with
streaming UTF-8 decoding and Base64 boundaries divisible by three. It returns
`{ presentation: { preview, characters, truncated, blob, inputLength, outputLength } }`.
Only the first 32,768 UTF-16 code units (without splitting a surrogate pair) enter
the textarea. The UI warns that copying copies only this preview; a full download
retains the selected format without the compression-ratio comment. Text downloads
contain decoded UTF-8, including CR/CRLF that an HTML textarea normalizes to LF;
Base64 and Hex preserve arbitrary binary data. Blob parts and the raw output still
consume memory proportional to the bounded result, but no full-size formatted
string or byte-to-Hex array is allocated on the main thread.

The raw-byte contract `{ codec: 'lzma', action, bytes, level, maxOutputLength }`
remains available to regression/minimum-engine tests: input `ArrayBuffer` ownership
is transferred and the Worker transfers `{ output: Uint8Array }` back. Failures in
either contract send `{ error: string }`. The UI uses its existing busy status; there are no
percentage progress messages. Completion, errors, explicit cancellation, and
route exit terminate the Worker and release its buffers. A new task creates a
new Worker, allowing a failed module load to be retried. The main thread never
loads the engine. A new task or route exit drops the previous download Blob;
download object URLs use the shared helper's five-second revocation. There is no
fallback to the removed CDN.

## Compatibility and regression evidence

Before cutover the four existing LZMA browser cases passed against lzma 2.3.2.
The replacement is checked against the four valid and three invalid published
examples, plus Python's independent `lzma`/liblzma implementation in both
directions. The runtime-generated corpus covers empty and one-byte inputs, all
byte values, NUL/Unicode, random data, references beyond 64 KiB, and 1 MiB inputs.
Python generates four presets and 45 lc/lp/pb combinations. Empty streams exercise
all 225 legal property bytes, including contexts larger than liblzma supports.
Tests also cover every truncated prefix of the official valid streams, every
single-bit payload mutation (currently 448 unique cases, with an explicit
uniqueness assertion), bad headers/end states/trailing bytes, huge
declared sizes, compression bombs, and exact output limits.

Integration tests cover input-buffer transfer, empty Worker output, cancellation,
route exit, retry after import failure, direct URL reload, narrow light/dark UI,
offline execution, and removal of the old external cache. The LZMA UI runs in
Chromium, Firefox, and WebKit smoke tests, and the scheduled minimum-engine test
also exercises compression and decompression in the Worker.
The minimum-engine test additionally exercises the presentation contract and
reads the returned Blob, so the new text adapter is covered by that scheduled gate.

Local validation: Chromium 891/891 passed on 2026-09-07, with a further 30/30
Chromium smoke/offline cases after adding download and adapter-cache assertions.
Firefox/WebKit 178/178 passed on 2026-09-08. The first cross-browser run had one
`WebKitBlobResource error 1` console failure in the unchanged image-convert test;
that case passed three standalone repetitions and the complete rerun without
code changes or error suppression. JavaScript syntax, minimum-browser static
checks, 79 Python tests, three compatibility-checker tests, and the live upstream
compression audit also passed. The release ZIP was verified against source, and
all 87 app-shell URLs were served successfully from the extracted ZIP.
These local checks use installed current engines; the actual historical engine
images and remote release CI remain scheduled/release gates.
The updated minimum-browser suite passed all six cases across current Chromium,
Firefox, and WebKit, including the Worker-side preview and full Blob result.

The monthly browser filter explicitly includes both `lzma` and `LZMA` test titles;
a Python regression guards against dropping them. The monthly standards audit
checks the pinned bundle plus full-document hashes for the SDK/specification-link
page, 7-Zip release/security history, current XZ Alone container description, and
XZ's page containing security notices. Any upstream edit or request failure asks
for manual review, not automatic codec changes. See `DEPENDENCY_UPDATE.md` for the
review procedure and native SDK/XZ applicability boundaries.

An additional local differential check ran levels 1/5/9 against the cached,
unchanged lzma 2.3.2 oracle on 500/200,000-byte random and 350,000-byte repetitive
inputs. Python read every new stream; the new decoder read every old stream.
For the 200,000-byte random input, outputs were 202,956–203,059 bytes versus
202,777 previously; the repetitive input produced 177 bytes in both. On Node
22.23.2, this check measured 38–61 ms versus 1,584–1,957 ms on the random input,
and 2–11 ms versus 130–3,810 ms on the repetitive input. These are local
observations, not performance guarantees or browser benchmarks.

A follow-up Chromium UI check decoded 4 MiB from a 67,118-byte Alone stream, then
formatted Hex. The textarea held 32,768 characters; the 8,388,608-character
download exactly matched the original bytes. No main-thread long task (at least
50 ms) was observed during that run. The earlier reviewed implementation had a
618 ms long task on a comparable 4 MiB case. This is a local observation, not a
CI timing assertion or guarantee on other devices. Tests assert output limits,
Worker message shape, UTF-8/chunk boundaries, and full download equality instead.

## Transfer and release size

Raw source bytes, without HTTP compression:

| Asset / measurement | Before | After |
| --- | ---: | ---: |
| LZMA CDN script | 34,972 | 0 |
| First-party LZMA engine | 0 | 17,590 |
| Worker-side LZMA text adapter | 0 | 3,182 |
| Shared archive Worker | 2,117 | 3,169 |
| First LZMA action dependency graph | 34,972 | 24,841 |
| Static release ZIP, identical version/root name | 2,029,486 | 2,037,254 |

The action graph includes the 900-byte shared Base64 module, whose URL was already
loaded by the app shell and can be served from the browser cache.

No new WASM, data, vendored asset, or initial engine request is introduced.
The post-change initial local JavaScript total is 131,196 bytes, below 140 KiB.
The engine is below the 64 KiB threshold requiring the planned shell/runtime
cache split, so it joins the current precache and remains available offline.
The CDN registration/global allowance and old external cache are removed;
jsDelivr remains in CSP because other registered dependencies still use it.
