# Phase 3 compression codecs

Reviewed 2026-09-25. These are independent first-party JavaScript implementations;
no compiled libzstd, repackaged decoder, or runtime package fallback is shipped.
The previous `@bokuweb/zstd-wasm`, `fzstd`, `seek-bzip`, and `lz4js` assets and
registry entries are removed together with their Worker/UI loaders and precache entries.

## Contracts and sources

- Zstandard follows [RFC 8878](https://www.rfc-editor.org/rfc/rfc8878).
  `zstd-encode.js` implements a bounded LZ hash-chain parser, Huffman literals
  (direct and FSE-compressed weights), and predefined FSE sequence encoding.
  Levels 1/3/10/19 adjust search depth; they are not libzstd's tuning presets and
  need not emit identical bytes or achieve identical ratios. Literal sections
  that do not save space stay raw; blocks that do not save space stay raw.
  `zstd-decode.js` reads raw, RLE and compressed blocks, all four literal modes,
  predefined/RLE/custom/repeated sequence tables, all repeat offsets, one/four
  Huffman streams, known/unknown content sizes, concatenated and skippable frames.
  Nonzero dictionary IDs and references requiring external history are rejected
  explicitly. Optional content checksums are verified using xxHash64's low 32 bits.
- Bzip2 follows the [bzip2 1.0.8 format implementation and manual](https://sourceware.org/bzip2/manual/manual.html).
  `bzip2.js` implements its bitstream, canonical Huffman groups, selector/byte MTF,
  zero-run representation, inverse BWT, legacy randomisation and RLE stages.
  Block sizes 1–9, multiple blocks, concatenated streams and empty streams are
  supported. Block CRC-32/BZIP2 and rotated stream CRC are verified. Nonzero
  final padding, trailing garbage and truncated data are rejected. Compression
  remains outside the existing tool's scope. The 512 randomisation numbers are
  fixed format data with their original license preserved in THIRD_PARTY_NOTICES.
- LZ4 follows the [frame specification 1.6.4](https://github.com/lz4/lz4/blob/dev/doc/lz4_Frame_format.md)
  and [block format](https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md).
  `lz4.js` writes independent 4 MiB blocks with a content checksum. It reads all
  four standard block-size codes, independent/linked blocks, concatenated and
  skippable frames, optional content sizes and block/content checksums. Header
  xxHash32 is always checked. Zero/invalid match distances, block overflow,
  invalid final sequences, truncation and trailing garbage fail in Korean.
  Raw blocks without a frame, the legacy frame magic, and external dictionaries
  are outside the supported interface. Some legacy lz4js outputs violate the
  required final-literal constraints and also fail the native decoder; these
  malformed streams are deliberately rejected rather than treated as valid data.

Each decoder exports `decompress(Uint8Array, { maxOutputLength })`; encoders
export `compress(Uint8Array, { level })` (LZ4 has no level option). Subarray bounds
are honored, inputs are not modified, and outputs are byte arrays. The default
output limit is `min(128 MiB, compressedBytes * 200)`. A supplied byte limit is
validated in 0–128 MiB and is intended for trusted callers/tests; the production
UI uses the default. Compression and decompression accept at most 256 MiB input.

Official format-source hashes are recorded in `scripts/compression-spec-lock.json`.
The monthly audit checks complete documents and requires review on change;
ordinary static validation requires no network. The monthly browser filter
includes all three codecs. Format data attribution is retained separately from
removed runtime package notices.

The follow-up audit also pins RFC 8878/9659 errata pages and metadata, complete
Zstandard/LZ4 release bodies, public advisories and development changelogs, and
Bzip2 downloads, CHANGES and every quarterly public development mailbox. Older
notice edits and new archive formats trigger review; network/format errors and
archive bounds fail closed. `DEPENDENCY_UPDATE.md` records source selection,
current notice applicability and deliberate update steps. These are format and
security review inputs, not automatic code updates. Fixed tables do not expire.
RFC 9659's 8 MiB window requirement concerns HTTP content coding; this standalone
file interface retains its documented 128 MiB decoding/window limit.

## Resource, lifecycle and offline behavior

Output limits are checked before allocating/growing decoded output, including
content-size headers and literal/sequence lengths. Zstandard windows are capped
at 128 MiB and decoded blocks at min(window, 128 KiB). FSE tables are at most 512
entries and Huffman tables 2048 entries. Encoder history is a 1 MiB ring plus
65,536 hash heads, approximately 4.25 MiB; working literals/sequences are bounded
by one 128 KiB block. Bzip2 uses at most 900,000 packed BWT entries (3.6 MB), six
bounded Huffman tables, and at most 32,767 selectors. LZ4 uses a 65,536-entry hash
index and one approximately 4.02 MiB scratch buffer for each active 4 MiB input
block. Completed compressed blocks retain exact-size copies; stored blocks share
the input. Output growth can temporarily retain
both the old and new buffers; return trimming, input and Blob results also consume
memory. These byte limits are not guarantees on total browser-process memory.

All three codecs and text/Base64/Hex transformations execute in the shared module
Worker. The raw byte contract transfers input ownership and transfers output back.
The presentation contract returns only a 32,768-character preview and a full Blob;
conversion uses the existing chunked `codec-io.js`. Copy copies the preview; the
UI explains how to download the full selected format. UTF-8 text is lossy for
arbitrary binary data; Base64/Hex preserve bytes. New requests discard old Blobs.
The shared download helper revokes temporary object URLs.

Completion, failure, cancellation and route exit terminate the Worker. Import
failures produce a Korean retry instruction; retry creates a fresh Worker. There
is no external network request carrying input and no runtime package fallback.
The engines remain below the 64 KiB cache-split threshold and join the existing
precache. Existing tool URLs, Zstandard file names, Bzip2 file download/preview,
manual actions, levels and output format options remain available. LZ4 gains
cancellation and a bounded preview/full download while keeping the frame format.
CSP's CDN/WASM permissions still serve unrelated cryptographic dependencies.

## Verification evidence

`tests/tools/archive.spec.js` checks both directions against native liblz4 and
Node's libzstd, and decoding against Python bz2. Fixtures are generated at runtime.
The corpus includes empty/one-byte/Unicode/NUL/full-byte-alphabet inputs, seeded
noise, low/high-byte alphabets, repeated data, cross-block history, 64 KiB/100 KB/
128 KiB/900 KB boundaries and inputs over 1 MiB. Tests cover all four LZ4 block
sizes and checksum/independence/content-size combinations, Zstandard levels
1/3/10/19 and unknown content size, and Bzip2 block sizes 1/9. A 600,000-byte
randomised Bzip2 block traverses the entire legacy randomisation table twice;
Python independently verifies the generated stream.

Malformed cases include every truncated prefix, CRC changes, false lengths,
reserved fields, dictionaries, cumulative output limits, compression bombs,
invalid options, subarrays and Worker allocation/transfer behavior. Zstandard's
single-bit mutations are compared with strict native `ZSTD_decompress`: Node's
streaming wrapper accepts some truncated inputs, so it is not used as the
malformed-input oracle. Additional development checks covered 16,354 malformed
Zstandard cases, 960 native entropy cases, 18 zero-bit/window cases, 1,080
high-byte/skew/header cases and 4,140 xxHash64 comparisons. The final decoder
optimization passed another 2,310 native/round-trip cases, 64,000 bit-reader
comparisons and 7,956 malformed variants with unchanged acceptance and output.
No new decoder-only acceptance or differing accepted output appeared
in the strict differential corpus. Native libzstd tolerates some unused literal
bits that both this decoder and old fzstd reject; strict stream consumption is
preserved.

The bit-mutation regression also asserts the sequence-header reserved-bit rule
from RFC 8878 section 3.1.1.3.2.1 independently of the native oracle: libzstd 1.5.5
accepts nonzero reserved bits, whereas 1.5.7 rejects them. Both bits individually
and together must produce the reserved-bit error. All other mutations still
require exact agreement with the native decoder, followed by a valid frame to
check recovery. This avoids making expected rejection depend on the CI host's
native library version.

Browser regressions cover deferred engine loading, failed load/retry, direct URL
reload, narrow/light/dark layouts, full downloads, cancellation, navigation
cleanup, buffer detachment and absent vendor requests. Service-worker tests
exercise removal of obsolete cached assets and offline direct navigation and
codec operation. The minimum-engine suite runs all three codecs through the same
Worker contract. Native oracle libraries are CI/test dependencies only, supplied
by the Ubuntu Playwright image or Homebrew on macOS.

## Size and performance

The removed raw assets total 306,840 bytes: Zstandard wrapper 8,010 + WASM 251,806,
fzstd 8,573, seek-bzip 32,762 and lz4js 5,689. New source totals 59,506 bytes:

| First-party source | Bytes |
|---|---:|
| `lz4.js` | 9,046 |
| `xxhash32.js` | 1,388 |
| `bzip2.js` | 9,127 |
| `bzip2-random.js` | 2,823 |
| `zstd-encode.js` | 14,144 |
| `zstd-decode.js` | 13,820 |
| `zstd-entropy.js` | 5,230 |
| `xxhash64.js` | 3,928 |

Observed first-action requests with service-worker interception disabled, raw source
bytes (including Worker, presentation adapter and shared Base64 module; a previously
loaded Base64 module can be cached):
LZ4 20,439; Bzip2 21,955; Zstandard compression 33,307; decompression 32,983.
No engine is imported by the home page or merely opening its tool. Total initial
local JavaScript is 128,104 bytes, below the existing 140 KiB gate. These are transfer-graph
sizes, not HTTP-compressed payload estimates.

Initial-cutover warm Node 22 measurements on the development Mac are illustrative, not a timing
gate. Zstandard compression compares the removed 0.0.27 WASM directly with the new
encoder; Zstandard decoding compares removed fzstd with the new decoder. Inputs
are 2 MiB and compression figures are medians of three runs after warm-up:

| Operation and input | Previous ms | First-party ms |
|---|---:|---:|
| Zstandard compression, level 1, 16-symbol alphabet | 3.7 | 33.4 |
| Zstandard compression, level 3, random bytes | 3.6 | 19.5 |
| Zstandard compression, level 3, 16-symbol alphabet | 15.2 | 32.4 |
| Zstandard compression, level 3, repeated text | 1.0 | 6.2 |
| Zstandard compression, level 19, 16-symbol alphabet | 680.3 | 208.7 |
| Zstandard decoding, 16-symbol alphabet, no checksum | 20.1 | 19.2 |
| Zstandard decoding, repeated text | 2.4 | 4.2 |
| Bzip2 decoding, random bytes | 256 | 110 |
| Bzip2 decoding, repeated text | 25 | 27 |

The JavaScript encoder has higher CPU cost than WASM at low levels; high levels
use a bounded, different search strategy. These are not equivalent libzstd presets.
The 16-symbol level-3 output was 1,051,893 bytes versus 1,088,667 before; level 19
was 1,100,584 versus 1,051,048. Higher levels do not guarantee smaller output.
LZ4 compression of 16 MiB random/repeated data measured 33/20 ms before and
11/30 ms after. All workloads remain cancellable in a Worker. Manual browser
checks of 4 MiB LZ4/Bzip2/Zstandard decoding to Hex observed no main-thread task
of 50 ms or longer; each returned a 32,768-character preview and full Blob.

The reproducible `v0.0.0-review` static ZIP is 1,154,943 bytes; its checksum and
all 93 app-shell URLs passed validation from an extracted HTTP-served copy.
The same build from the starting committed revision was 1,229,500 bytes. This
74,557-byte reduction includes the Brotli decoder replacement, so it is not an
isolated measurement of these four package removals.

Initial-cutover local gates: Chromium 929/929, Firefox smoke 90/90, WebKit smoke 90/90,
and current-engine minimum-suite checks 6/6 across all three engines. The latter
do not claim an actual legacy-engine run. Static baseline checks passed all 70
JavaScript files; syntax, Python 96/96 and compatibility-validator 3/3 passed.
The five official phase-3 document hashes matched live sources. The scheduled
minimum-engine job and remote release gates remain separate release requirements.

The LZ4 follow-up regression uses 8 MiB + 257 bytes: two compressed 4 MiB blocks
and one stored tail. Native liblz4 verifies the full result; the test observes the
buffers copied into the final frame without depending on garbage-collector timing.
Before the fix, each 16,459-byte compressed block retained 4,210,769 backing bytes;
afterward it retains exactly 16,459 bytes. Stored blocks still share the input.
Follow-up gates passed: archive/service-worker Chromium 111/111, current-engine
minimum checks 6/6, Python 103/103 (including 28 compression-audit tests), static
browser baseline and syntax checks, the live complete standards audit and a fresh
live check of all 11 phase-3 upstream snapshots. The extracted release again
passed all 93 app-shell URL checks. No remote CI result is implied.

Final PR-scoped verification passed Chromium 927/927, Python 103/103, static
validation, browser-baseline checks and pinned standards/compliance checks.
The 1,154,943-byte ZIP above was rebuilt from this isolated branch and passed
its checksum and all 93 extracted app-shell HTTP checks.
