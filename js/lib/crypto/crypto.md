# First-party CryptoJS replacement

Reviewed 2026-10-03. This replaces CryptoJS 4.2.0 in the browser and file Worker.
The old CDN script, vendored file, registry entries, global warning and obsolete
CSP origins are removed together. No production path retries through CryptoJS.

## Interfaces and standards

- `hash.js`: asynchronous `createHash(name)`, `digest(name, bytes)` and
  `hmac(name, message, key)`. Streaming hash objects expose `update`, `digest`
  and `destroy`. Inputs are retained by the caller; digest output is a fresh array.
  WebCrypto handles SHA-1/256/384/512 and their HMAC variants when available.
  Unsupported algorithms and empty HMAC keys use the portable implementation.
- `hash32.js` and `hash64.js`: MD5, legacy SHA-0, SHA-1, SHA-224/256/384/512
  and RIPEMD-160. SHA-512 uses paired 32-bit words. Sources:
  [RFC 1321](https://www.rfc-editor.org/rfc/rfc1321),
  [FIPS 180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf) and
  [the RIPEMD authors' specification and vectors](https://homes.esat.kuleuven.be/~bosselae/ripemd160.html).
  Existing MD2 and MD4 functionality shares this interface; MD2 follows
  [RFC 1319](https://www.rfc-editor.org/rfc/rfc1319).
- `keccak.js`: Keccak-f[1600], SHA3-224/256/384/512 and Keccak-256.
  SHA-3 uses domain byte `0x06`; Keccak-256 uses `0x01`. These distinct outputs
  retain their existing UI names. SHA-3 follows
  [FIPS 202](https://csrc.nist.gov/pubs/fips/202/final).
- `cipher.js`: byte-oriented API for CBC, full-block CFB, CTR, OFB and ECB.
  `aes.js` implements [FIPS 197](https://csrc.nist.gov/pubs/fips/197/final);
  modes follow [SP 800-38A](https://csrc.nist.gov/pubs/sp/800/38/a/final), with
  the legacy CTR counter behavior below. AES S-boxes and round tables are
  derived from the standard's field operations. AES-CBC with PKCS7 and AES-CTR
  prefer WebCrypto for 128/256-bit keys. AES-192, CFB, OFB and ECB use JavaScript.
  Native data/authentication errors remain errors; only unsupported native
  operations may select the portable implementation.
- `des.js`: DES and two-/three-key TripleDES EDE. `blowfish.js` follows
  [Schneier's specification and test vectors](https://www.schneier.com/academic/blowfish/).
  `generate_blowfish_constants.py` derives the initial words from pi using
  Machin's formula and checks two guard precisions; CI checks the generated file.
- `openssl.js`: [EVP_BytesToKey](https://docs.openssl.org/3.4/man3/EVP_BytesToKey/)
  with MD5, one iteration, eight-byte salt and the `Salted__` envelope.
  `aes-envelope.js` preserves the W-Tools v1 JSON envelope, PBKDF2-HMAC-SHA256
  (600,000 iterations), and WebCrypto GCM with a 128-bit tag.
- HMAC follows [RFC 2104](https://www.rfc-editor.org/rfc/rfc2104).
  JWT HS256/384/512, Base58Check, OTP and SSH fingerprints consume the same
  byte APIs. OTP vectors come from [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238).

## Compatibility contract

Hash names, UTF-8/Hex/Base64 conversions, uppercase output, HMAC options and
file MD5/SHA-1/SHA-256/SHA-512 outputs are preserved. AES Hex accepts the same
`0x` prefix and whitespace/colon/comma/hyphen separators as before. All AES key sizes and
existing envelopes remain supported. AES-GCM retains its existing restriction
to 128/256-bit keys across supported browsers.

The DES/3DES/Blowfish adapter deliberately retains the previous direct-key rules:
even-length hex is detected automatically; other strings become UTF-8 bytes;
DES pads/truncates to eight bytes; TripleDES accepts two, four or at least six
32-bit words and uses at most six; Blowfish pads the last partial word and uses
at most 72 bytes. Direct keys retain a zero IV. This behavior is confined to
`legacy.js`; it is not a recommended key format. CTR increments only the final
32 bits without carrying into earlier words. CBC/ECB use PKCS7; stream modes
retain partial final blocks without padding.

Two deliberate corrections are documented in the UI, FEATURES and changelog:

1. Passphrase DES/3DES/Blowfish Hex now includes the entire salted envelope.
   The previous Hex output discarded the random salt and cannot be recovered
   without separately retained salt. Existing salted Base64 remains readable.
2. Empty decrypted plaintext is valid; malformed PKCS7 padding is rejected
   after checking every byte of the final block. No partial plaintext is returned.

## Limits, ownership and misuse checks

One-shot messages and plaintext are capped at 16 MiB; keys/passwords at 64 KiB.
Ciphertext limits allow padding, tags and envelope overhead. The AES text adapter
accepts up to 48 MiB encoded input before decoding and checks decoded ciphertext.
PBKDF2 envelope iterations are restricted to 10,000–10,000,000 before derivation.
Hex conversion uses an 8,192-entry scratch array instead of an array per byte.

Hash state is independent of input size. The file Worker accepts chunks up to
2 MiB and only one active job. SHA-512 retains one 128-byte block and 160 words
of schedule scratch; the 32 MiB streaming test asserts these bounds. Cipher
buffers are linear in the capped message length. Tests cover exact 16 MiB input,
padding/envelope overhead, large Hex conversion and oversized rejection.

The hash-all, AES and legacy cipher tools always use a module Worker. Digest and
HMAC adapters switch to a Worker at 64 KiB messages, or 16 KiB HMAC keys.
Each operation owns one Worker; completion, abort, error and route exit terminate
it. Structured cloning retains caller buffers. File hashing reports chunk
progress; other crypto actions use the existing busy/cancel UI.

Random salt/IV generation uses `crypto.getRandomValues` exclusively. Missing
secure randomness fails in Korean. Owned key schedules, derived byte keys,
padding and temporary plaintext are cleared where reachable. Immutable strings,
native CryptoKey internals and engine copies cannot be explicitly erased.
Worker termination releases its remaining private state.

MAC/OTP comparisons scan the full compared buffers; PKCS7 scans the final block.
JavaScript JIT behavior and secret-indexed AES/DES/Blowfish tables do not provide
a constant-time guarantee. Native WebCrypto remains preferred. Legacy hash,
64-bit cipher, weak KDF and unauthenticated-mode warnings remain visible;
existing encryption opt-ins remain required. Inputs and secrets are never put
in resource URLs, telemetry or logs. Resource-cache messages carry same-origin
resource paths; the service worker caches only allowlisted static assets. This
review and the test vectors are not a security certification.

## Loading, offline behavior and rollback

Algorithms load by name when used. No crypto engine loads on the home page.
The service worker now precaches a minimal shell and caches tools, Workers and
engines on use. Window and Worker resource observers report first-visit imports
made before service-worker control. Retry query URLs use canonical cache keys;
vendored modules still pass SRI checks. The release archive and cache revision
include both shell and runtime inventories.

An uncached offline tool shows Korean retry guidance. A successfully used tool
works offline after caching. Each new release starts a new runtime cache, so
users must use needed tools online again after updating. Old shell/runtime and
CryptoJS external caches are removed during activation.

Rollback must restore the complete old tool/Worker code, script tag, dependency
registry, vendored asset, CSP and cache inventory together, then regenerate the
cache revision. Do not add an automatic CDN fallback or mix old/new Workers.
Normal persisted envelopes need no data migration. Retain the salted-Hex fix
when rolling back; old readers do not understand the corrected Hex envelope.

## Size and performance record

Raw UTF-8 bytes measured against the working tree at the start of this item,
including the existing phase-3 codec work. No bundler or minifier is introduced.

| Asset / group | Before | After |
|---|---:|---:|
| CryptoJS CDN asset | 60,819 | 0 |
| Local CryptoJS Worker asset | 60,819 | 0 |
| `js/lib/crypto/*.js` (includes existing MD4) | 5,160 | 79,708 |
| Crypto operation Worker | 0 | 1,545 |
| File hash Worker | 1,673 | 1,733 |
| Window + shared resource reporters | 0 | 2,633 |
| Initial local JavaScript | 128,045 | 129,568 |
| Unique shell precache source bytes | 2,845,719 | 538,650 |
| Static ZIP, identical `v0.0.0-crypto` root name | 1,152,222 | 1,159,964 |

Cold Chromium contexts recorded page and Worker JavaScript requests through the
first completed default operation. Service-worker installation was disabled to
measure the executed tool path; the old CDN response used the exact pinned
CryptoJS bytes. Values are raw bytes, counted once per URL, without HTTP headers
or transport compression. The file case hashes a generated three-byte file.

| First operation, including home code | Before | After |
|---|---:|---:|
| Home | 188,864 | 129,568 |
| All text hashes | 229,081 | 185,528 |
| Default AES-GCM envelope | 251,201 | 208,257 |
| Blowfish passphrase encryption | 251,201 | 223,634 |
| File hashes | 286,413 | 179,945 |

Local Node 22.23.2, 1 MiB input, one warmup and median of three operations;
conversion, Worker startup and UI are excluded. Timings are observations on one
machine, not browser latency guarantees. AES uses a 128-bit key; other ciphers
use their usual 8/24/16-byte keys and CBC. The optimized AES fallback avoids
the initial byte-loop regression.

| Operation | CryptoJS ms | Current preferred ms | Current streaming JS ms |
|---|---:|---:|---:|
| MD5 | 24.3 | 16.4 | 16.8 |
| SHA-1 | 13.7 | 0.6 | 15.4 |
| SHA-256 | 13.0 | 0.5 | 20.6 |
| SHA-512 | 68.0 | 0.8 | 47.9 |
| AES-CBC | 15.2 | 0.9 | — |
| AES-CFB | 12.4 | 16.5 | — |
| AES-CTR | 12.0 | 0.3 | — |
| AES-OFB | 11.0 | 16.4 | — |
| AES-ECB | 10.2 | 14.0 | — |
| DES | 332.4 | 43.6 | — |
| TripleDES | 1,104.7 | 87.1 | — |
| Blowfish | 36.1 | 34.6 | — |

## Verification

`tests/crypto-engine.spec.js` covers published AES/DES/Blowfish vectors, Node
hash/HMAC boundary comparisons, native/portable equality, OpenSSL interoperability,
1,560 frozen legacy cipher contracts, more than 1,000 malformed padding cases,
resource limits, caller ownership, route cleanup and first-load retry. Existing
tool suites retain MD2/MD4/SHA-0/Keccak vectors, GCM tag tampering, JWT verification,
OTP and SSH contracts. Service-worker tests exercise uncached failure, direct
first visits, Worker dependencies, canonical retries and vendored SRI.

`scripts/freeze_crypto_vectors.mjs` regenerates only the deterministic oracle
fingerprints. It requires a separately supplied CryptoJS file with the exact
historical SHA-384 pin, never downloads it and never ships it. Browser tests use
the frozen JSON and Node built-ins, so CryptoJS is not a test-time dependency.
Independent review also checked 1,430 randomized legacy cipher cases, 1,881
hash/HMAC cases and 4,800 AES blocks against separate implementations.

The full Chromium suite, Firefox/WebKit crypto and smoke projects, minimum-syntax
gate, Python validation tests and extracted release checks are the release gates.
Local Node 22.23.2 validation passed 959 Chromium cases, 101 Firefox cases and
101 WebKit cases, plus the added AES Hex-notation regression. Python passed 105
tests; the baseline syntax gate checked 89 JavaScript files. The extracted static
ZIP passed all 111 HTTP asset checks. Six crypto tools also passed 360 px light
and dark layout checks without page errors.
The intentional failed Worker-module fetch test runs on Chromium because the
other Playwright engines do not intercept those Worker imports. Minimum-browser
smoke runs locally on the installed current engine; the pinned historical-engine
workflow and remote release checks remain the existing pre-release TODO.
