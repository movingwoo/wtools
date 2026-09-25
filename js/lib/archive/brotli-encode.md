# Brotli encoder review

The encoder review below records the 2026-09-09 cutover. The separate
[decoder replacement review](brotli-decode.md) supersedes its retained-decoder
notes and resolves the P1 intermediate output-allocation risk described below.

Reviewed on 2026-09-09. `brotli-encode.js` is first-party JavaScript implementing
LZ77 parsing, canonical Huffman codes, and Brotli meta-block serialization. No
third-party encoder source, compiled core, dictionary, or WASM is shipped.

## Format and implementation

[RFC 7932](https://www.rfc-editor.org/rfc/rfc7932) sections 3–5 and 9 define the
codes and stream format. The RFC source and [errata](https://www.rfc-editor.org/errata/rfc7932)
are pinned in `scripts/compression-spec-lock.json` and checked by the monthly audit.
Erratum 5948 corrects a spelling error; 6977 concerns implicit distances during
block switching, which this encoder does not emit.

`compress(Uint8Array, { quality = 6, maxInputLength = 256 MiB })` returns a Brotli
stream. All integer qualities 0–11 are accepted; the UI retains levels 1/6/11,
text/Base64/Hex input and output, and `.br` file downloads. Input arrays, including
views with non-zero offsets, are not modified. Errors use Korean messages.

The stream uses a 1 MiB minus 16-byte window and independent meta-blocks of at
most 1 MiB. Each block has one literal, command, and distance tree. A greedy
four-byte hash chain finds backward matches, including overlapping copies.
Quality controls 1–128 candidate probes and a comparison budget. The hash table
scales with the block to avoid long collision chains on incompressible input.
A successful long match can exceed the comparison budget, but consumes those
matched bytes in a single command. No references cross the start of a block.

Huffman construction raises the minimum symbol weight until the maximum depth
fits 15 bits (5 for code lengths), preserving a complete prefix tree. Small
alphabets use simple codes; larger ones encode their code lengths with explicit
run separators so adjacent repeat symbols cannot accidentally extend a run.
Distances are explicit with NPOSTFIX=NDIRECT=0. Streams end with an empty final
meta-block and zero padding. A payload cost check skips emission when compression
cannot beat storage; the complete encoded block is also compared against raw
storage before committing it.

These are encoder choices: arbitrary bytes remain supported and ordinary Brotli
decoders can read the output. Static dictionaries, context modeling, distance
cache shortcuts, and Google's optimal parsing heuristics are not used. Numeric
quality values control this implementation's search, so output bytes, sizes, and
quality tradeoffs can differ from the removed encoder. The UI explains this.
The registered `brotli 1.3.3` decoder remains a separate TODO item; this change
does not claim new malformed-stream checks or streaming expansion limits for it.

## Resources, Worker, and caching

Input is capped before encoder allocations at 256 MiB; callers can impose a lower
`maxInputLength`. Per-block live scratch allocations include up to 4 MiB each for
hash heads, predecessor links, and command words, plus a bit buffer of at most
5 MiB + 4 KiB and small Huffman tables. Input and the final output are additional:
the output reserves input length plus five bytes per block plus eight bytes,
and trimming can temporarily retain both the output allocation and its copy.
Garbage collection timing and UI format conversion also affect peak memory.

For files, the module Worker accepts `{ codec: 'brotli', action: 'comp', bytes,
level }`, dynamically imports only the encoder, and transfers a Uint8Array result
back without an extra UI-side copy. Input ownership is transferred. Text actions
send `presentation: { text, ifmt, ofmt }` instead of bytes. The shared
`codec-io.js` checks decoded input size, converts input, and creates the output
preview and Blob in the Worker. Its chunk size is 24 KiB, preserving UTF-8 and
Base64 boundaries. Only a 32,768-character preview (without splitting a surrogate
pair) enters the textarea; full text, Hex, or Base64 is available for download.
The LZMA adapter delegates to the same implementation while retaining its API.
The UI retains its busy/cancel status;
there are no percentage progress messages. Completion, errors, cancellation, and
route exit terminate the Worker. A retry creates a fresh Worker, including after
an import failure. The Korean load error supplies a retry instruction. Downloads
use the shared helper and its object URL revocation. New text actions and route
exit release the previous result Blob. No input leaves the browser.

The encoder is below the 64 KiB threshold that requires the planned shell/runtime
cache split. It replaces the removed asset in the current precache. The offline
regression seeds an old shell with the obsolete encoder, verifies its removal,
and performs compression and decompression after disabling network access.
The shared text adapter is also precached and exercised by the offline test.
No new origin or CSP allowance is needed; the removed local file had no exclusive
CSP origin. Existing CDN origins are still used by other dependencies.

## Validation and size

The browser corpus includes the published WPT `expected output` vector, empty and
single-byte inputs, all byte values, Unicode/NUL, seeded noise, 64 KiB and 1 MiB
boundaries, overlapping and long-distance copies, mixed raw/compressed blocks,
and multiple meta-blocks. It generates 432 encoded streams across 114 inputs;
Node Brotli independently decodes every result. The tests assert input ownership,
actual compression of repetitive input, bounded storage overhead, invalid option
and size rejection, load failure/retry, direct URLs, narrow light/dark layouts,
Worker cancellation, route cleanup, file download, and offline operation.

Before removal, a local differential run compared 54 input/quality combinations
against the unchanged `brotli-compress 1.3.3` oracle. Node decoded old and new
streams, and the retained JavaScript decoder decoded every new stream. A separate
1,200-case deterministic corpus exercised all twelve qualities against Node.
A local 256 MiB zero-filled input compressed successfully and Node decoded its
entire output; a 256 MiB + 1 input was rejected. These large expansion checks use
Node explicitly; the UI's existing 128 MiB/200:1 result policy still applies.

The initial implementation passed 899 Chromium tests and 180 Firefox/WebKit tests.
The review follow-up passed the expanded 902-test Chromium suite, 83 Python tests,
all JavaScript syntax checks, the 60-file static compatibility scan, asset validation,
and deterministic release ZIP verification. The browser tests now assert bounded
Worker presentations, complete downloads in each format, adapter load failure and
retry, and rejection of excessive decoded results before transfer/formatting.
Firefox and WebKit each passed all 90 smoke tests; the minimum-browser suite also
passed six cases on the three installed current engines, including the shared
adapter's preview and Blob. The first WebKit run reported a `WebKitBlobResource
error 1` console error in the unchanged image-convert invalid-crop test. That test
passed three isolated repetitions and the full WebKit rerun, without changes or
error suppression. Historical engine images and remote release CI remain scheduled gates.

A local warm Node 22.23.2 comparison at quality 6 measured 1 MiB noise at 24 ms
versus 17 ms previously, with the same 1,048,581-byte result. A 750,000-byte
long-distance sample took 34 ms versus 16 ms (400,110 versus 400,026 bytes), and
a 2,097,229-byte mixed-block sample took 38 ms versus 49 ms (1,048,673 versus
1,048,610 bytes). The 4,320-byte Unicode sample produced 65 versus 59 bytes.
These observations include cases that compress less efficiently or run slower;
they are not browser timing guarantees. Computation remains entirely in the
Worker, and first execution no longer loads the much larger third-party encoder.

Raw source bytes, without HTTP compression:

| Asset / measurement | Before | After |
| --- | ---: | ---: |
| Local third-party Brotli encoder | 1,866,277 | 0 |
| First-party Brotli encoder | 0 | 12,969 |
| Shared archive Worker | 3,169 | 4,995 |
| Shared text adapter (also used by LZMA) | 0 | 3,230 |
| First text compression action dependency graph | 1,869,446 | 21,194 |
| Static release ZIP, identical version/root | 2,035,094 | 1,228,234 |

The action graph counts the Worker, encoder, and text adapter with a cold HTTP cache and
service worker disabled. Existing app-shell modules are excluded equally on both
sides. The encoder is requested only on compression, never by the home page or
by simply opening the tool. The initial local JavaScript total falls to 130,702
bytes, below 140 KiB. No unrelated tool fetches the encoder.

## Security review follow-up

An additional 4,000 generated input cases, including skewed histograms and all
twelve qualities, passed Node decompression checks. No encoder correctness defect
was found in that corpus; this is not an exhaustive security proof.

The original UI converted a 4 MiB seeded ASCII input into a 6,985,628-character
Hex result on the main thread, producing observed long tasks of 304 and 595 ms.
With Worker-side formatting and bounded preview, the same Chromium probe observed
no main-thread task of at least 50 ms. Timing is a local observation; tests assert
the bounded message/download contract rather than hardware-dependent durations.

At the encoder cutover, the remaining P1 risk was the retained decoder's unbounded
intermediate output allocation. `BrotliDecompressBuffer` and its internal decoder grew their output
buffer according to meta-block lengths before returning to our code. Its optional
output-size argument is an initial capacity, not a cap. The Worker now rejects
results above 128 MiB or 200:1 before transferring or formatting them, and the UI
then described a post-decode check. That check did not prevent a decoder memory
exhaustion payload. The subsequent [decoder replacement](brotli-decode.md) now
enforces the bound before allocation/growth and removes the legacy decoder.

The monthly audit now includes RFC 7932 relationship metadata, the related RFC
9841 and errata, all public Google Brotli release notes, and repository security
advisories. It detects edited old notices while ignoring download counters and
fails on missing/malformed sources or a full page needing pagination. The live
audit passed against the reviewed snapshots. Fixed encoder tables do not need
periodic data refreshes. RFC 9841 extensions are monitored for applicability;
ordinary RFC 7932 output remains the supported format. See `DEPENDENCY_UPDATE.md`.
