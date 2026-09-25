# Brotli decoder review

Reviewed on 2026-09-10. `brotli-decode.js` replaces the vendored `brotli 1.3.3`
decoder with an independent JavaScript implementation of
[RFC 7932](https://www.rfc-editor.org/rfc/rfc7932). The old decoder is not a
production fallback. Its source was retained only outside the repository for
local differential checks before removal.

## Contract and format

`decompress(Uint8Array, { dictionary, maxOutputLength = 128 MiB,
maxExpansionRatio = 200 })` returns a new Uint8Array. Input may be a view with a
nonzero offset and is not modified. Input is capped at 256 MiB; callers may lower
the output and ratio limits but cannot raise either. A zero output limit accepts
an encoded empty stream. Errors contain a Korean explanation and bit position.

The implementation supports the ordinary RFC 7932 stream: windows 10–24,
compressed/stored/metadata meta-blocks, simple and complex canonical Huffman
trees, all three block categories, all four literal context modes, zero-run and
inverse move-to-front context maps, short/direct/postfix distances, overlapping
copies across meta-blocks, and the complete static dictionary and 121 transforms.
Dictionary byte operations follow the RFC, including its non-Unicode casing
algorithm; they do not use locale-sensitive JavaScript casing.

Header lengths must use their minimal representation. Truncation, reserved bits,
invalid trees/repeats, invalid distances/dictionary references, commands exceeding
the declared output, nonzero alignment bits, and trailing bytes are rejected.
The tool accepts one stream. Node's decoder tolerates some nonzero padding and
trailing data; those differences are deliberate and covered by mutation tests.
Brotli has no checksum, so structurally valid mutations can change output without
being detected. RFC 9841 shared dictionaries, framing, and extended windows remain
outside the existing tool contract.

The distance cache survives meta-block boundaries, while block types and counts
reset. An implicit distance does not consume a distance symbol or block count,
following RFC 7932 section 10 and the clarification in reported erratum 6977.
A hand-authored regression exhausts a distance block, emits an implicit distance,
then switches blocks at the next explicit distance; Node independently verifies it.

## Output allocation bound

The retained decoder used to allocate/grow its output before the Worker could
check the final length. The replacement checks `produced + MLEN` against
`min(maxOutputLength, floor(input.length * maxExpansionRatio))` immediately after
reading each meta-block length, before reading entropy trees or allocating output.
Every literal, copy, and transformed dictionary word must fit that checked block.

Output uses pages of at most 64 KiB, allocated only as bytes are produced. The
last page is clipped to the remaining absolute budget. The sum of page capacities
cannot exceed the output limit; the WBITS field does not allocate a ring buffer.
Backreferences read prior output pages. No length in a malformed header can cause
an output allocation above the configured budget.

The final contiguous return value is a second allocation of the checked actual
output length. Input, output pages, the final copy, text conversion/Blob storage,
and garbage collection timing are additional live memory. This resolves the P1
unbounded intermediate **output** allocation; 128 MiB is not a cap on total browser
process memory. Entropy structures have bounded alphabet/tree counts (at most 256
trees in each category, at most 704 symbols per tree). An eight-bit lookup table
with a canonical fallback avoids allocating a 32,768-entry table for every tree.
Dictionary transformations allocate only small, format-bounded temporary words.

Browser regression instrumentation observes no numeric Uint8Array allocation
when a 64 KiB expansion bomb or false 16 MiB output declaration is rejected. With
two four-byte blocks and a six-byte output cap, it observes only the first
six-byte page before the second block is rejected. Exact limits, a zero limit,
invalid options, lower ratios, and input ownership are also covered. A local
256 MiB + 1 input was rejected at the API boundary.

## Normative data, Worker, and offline use

`scripts/generate_brotli_data.py` extracts the RFC's dictionary (122,784 bytes),
three literal context tables, word-count bits, and transform triples. It verifies
the pinned RFC SHA-384, the published dictionary CRC-32 `5136cb04`, the three
context CRCs, and the transform serialization's 648-byte length/CRC `3d965f81`.
`brotli-tables.js` is generated normative data, not copied decoder code. The data
is attributed under the IETF Trust BSD terms in `THIRD_PARTY_NOTICES.md`, which is
included in the static release ZIP.

The compression standards gate checks fixed local dictionary/table SHA-256 hashes
offline on each PR. `generate_brotli_data.py --check` reproduces them from the
source without changing files. These tables define the format and do not need
periodic data updates. The existing monthly RFC/errata, WPT, Google release-note,
and security-advisory checks remain in place; changes require an applicability
review rather than automatic regeneration.

Only a decompression action imports the decoder/tables and fetches the local
dictionary in the module Worker. The request has a fixed SHA-384 integrity value;
no user bytes enter a URL or network body. The library itself has no network or
DOM dependency. Decoder and dictionary failures produce separate Korean retry
messages. A retry creates a new Worker. Completion, failure, cancellation, and
route exit terminate it; text conversion and the bounded preview/full-download
contract are unchanged. The Worker transfers byte output without an extra UI copy.

The old asset, registry entry, UI loader URL, vendor rewrite, and service-worker
entry are removed together. Decoder, tables, and dictionary are precached by the
existing shell. Both JS modules are below 64 KiB and the data asset is below
256 KiB, so this change does not trigger the planned cache split. An offline
regression removes both obsolete Brotli assets and verifies a dictionary reference
without network access. No new CSP origin is needed.

## Validation

- Browser corpus: Node-generated streams across all quality groups, windows,
  modes, postfix/direct settings, binary/Unicode data, large and cross-block
  copies; the pinned WPT vector; stored/metadata blocks and implicit-distance
  block switching. Excessive expansions must fail the same output policy.
- 5,082 hand-authored dictionary streams: all 21 word lengths, all 121 transforms,
  first/last dictionary entries (including non-ASCII words), and all postfix
  settings. Node independently decodes every expected output.
- Full payload single-bit mutations, all 60 truncated prefixes of a sample,
  malformed headers/trees/dictionary references, output-allocation instrumentation,
  load retry, dictionary corruption/SRI rejection, downloads, and offline use.
- Local differential corpus: 1,344 successful encodings from Node and the existing
  first-party encoder, plus 24 expected expansion-limit rejections. Another 2,400
  generated cases passed (2,393 outputs, seven expected limit rejections), with
  240 normal cases compared to the unchanged legacy decoder. Both decoders rejected
  all 60 truncated prefixes. Of 4,800 single-bit generated mutations, 775 were
  rejected and 4,025 accepted outputs agreed with Node; deliberate strict padding
  and trailing-data rejection was accounted for.
- Google Brotli v1.2.0 public `tests/testdata` compressed files were downloaded only
  to a temporary directory: 41 outputs matched Node and four excessive expansions
  were rejected. No third-party binary test corpus is committed.

The complete Chromium suite passed 909 cases and Python validation passed 87
tests. Firefox and WebKit each passed 90 smoke tests. The minimum-browser entry
point passed all six cases on the three installed current engines. The final
focused Chromium run passed 24 Brotli cases, including the explicit block-switch
regression added after the full run. JavaScript syntax, the 62-file minimum-browser
static scan, three compatibility checker unit tests, static assets, source
regeneration, and deterministic release ZIP/HTTP verification passed. Historical
engine images remain a scheduled CI gate.

The first WebKit run had a `WebKitBlobResource error 1` console error in the
unchanged image-convert invalid-crop test, also seen before this replacement.
That case passed three isolated repetitions and the full WebKit rerun without
source changes or error suppression. This is a remaining intermittent test issue,
not evidence of a Brotli decoding failure.

## Size and local timing

Raw bytes without HTTP compression:

| Asset / measurement | Before | After |
| --- | ---: | ---: |
| Vendored decoder (including compressed dictionary) | 91,203 | 0 |
| First-party decoder | 0 | 17,388 |
| Normative context/transform tables | 0 | 5,257 |
| Normative dictionary data | 0 | 122,784 |
| Archive Worker | 4,995 | 5,117 |
| Shared text adapter | 3,230 | 3,230 |
| First text decompression action graph | 99,428 | 153,776 |
| Static ZIP, identical v1.4.1 version/root | 1,228,234 | 1,234,116 |

The cold action graph assumes an empty HTTP cache and disabled service worker;
existing app-shell modules (including common Base64) are excluded equally. The
dictionary is stored as normative bytes rather than compressed executable source,
so this action fetches 54,348 more raw bytes. The ZIP increases by 5,882 bytes.
Initial local JavaScript decreases to 130,220 bytes, below the 140 KiB budget.
Opening the home page or tool does not directly import the decoder; background
service-worker installation retains the existing precache contract.

Warm Node 22 medians of five measured runs after two warm-ups were:

| Sample | Old decoder | New decoder |
| --- | ---: | ---: |
| 152,089-byte Alice text | 2.38 ms | 4.38 ms |
| 122,784-byte dictionary bytes | 1.78 ms | 5.68 ms |
| 1 MiB stored noise | 1.60 ms | 0.18 ms |
| 2,097,229-byte mixed blocks | 16.74 ms | 19.62 ms |

These local observations include slower compressed-text paths; they are not
browser performance guarantees. Work remains off the UI thread and cancelable.
The priority of this replacement is enforcing allocation bounds while preserving
ordinary `.br` interoperability.

## Upstream review during validation

The live audit detected the 2026-09-09 XZ 5.8.4 / GHSA-5qpq-xqfv-j9pg notice.
Its native decoder reinitialization-after-allocation-failure sequence does not
exist in the first-party LZMA implementation, which creates fresh local state on
each call. The applicability assessment and reviewed page pin are recorded in
`DEPENDENCY_UPDATE.md`; the full Chromium run included the LZMA vectors.
After the deliberate pin update, the live standards, errata, WPT, upstream release,
and security snapshot audit passed.
