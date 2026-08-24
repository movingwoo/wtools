// 실행 가능한 제3자 자산 등록부.
// 브라우저 코드, 서비스 워커, scripts/validate_static.py가 이 파일을 함께 사용한다.
globalThis.WTOOLS_DEPENDENCIES = {
  "cdn": {
    "cryptoJs": {
      "url": "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js",
      "integrity": "sha384-mgWScxWVKP8F7PBbpNp7i/aSb17kN0LcifBpahAplF3Mn0GR4/u1oMpWIm2rD8yY",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/cryptotools.js", "js/tools/hashing.js"]
    },
    "jsyaml": {
      "url": "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js",
      "integrity": "sha384-+pxiN6T7yvpryuJmE1gM9PX7yQit15auDb+ZwwvJOd/4be2Cie5/IuVXgQb/S9du",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/dataformat.js"]
    },
    "jsrsasign": {
      "url": "https://cdn.jsdelivr.net/npm/jsrsasign@11.1.0/lib/jsrsasign-all-min.js",
      "integrity": "sha384-vbfVWK2rJ9x1Xsycv0IIV02oWFwkOZ5Ohb/cQGU2ldysPOlCR4OtdM1nvOZFbpzk",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/cryptotools.js", "js/tools/encoding.js", "js/tools/pki.js"]
    },
    "marked": {
      "url": "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js",
      "integrity": "sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/devfmt-format.js"]
    },
    "hljs": {
      "url": "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js",
      "integrity": "sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp",
      "license": "BSD-3-Clause",
      "kind": "script",
      "tools": ["js/tools/devfmt-format.js"]
    },
    "hljsCss": {
      "url": "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark-dimmed.min.css",
      "integrity": "sha384-PiLidnnRuzFgp4qiN8oGNmktrV8ETL+6a8heAxljUX4A+3XWlocwaMn9duBUepfK",
      "license": "BSD-3-Clause",
      "kind": "style",
      "tools": ["js/tools/devfmt-format.js"]
    },
    "beautifyJs": {
      "url": "https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify.min.js",
      "integrity": "sha384-FVx1WK8VHSskkzcjxDxmZKSJ3KQ8vYOZo+sirXFdjOxUq4Y4+9IrtCG8iiisHHfj",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/devfmt-format.js"]
    },
    "beautifyCss": {
      "url": "https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify-css.min.js",
      "integrity": "sha384-YkGkitXFTTE2YT+poOaBOfObka+86Q4ianXfq8SwPtTSW3SIFE4Ha5u33+xVK65+",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/devfmt-format.js"]
    },
    "beautifyHtml": {
      "url": "https://cdn.jsdelivr.net/npm/js-beautify@1.15.1/js/lib/beautify-html.min.js",
      "integrity": "sha384-j7zhOGXtPN67K2CFiNW3h/EvKRoW14dRbO8Pj4f2089y8m2RoxS2l627sobb19d3",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/devfmt-format.js"]
    },
    "sqlFormatter": {
      "url": "https://cdn.jsdelivr.net/npm/sql-formatter@15.3.2/dist/sql-formatter.min.js",
      "integrity": "sha384-7mUXtMlypVs4NSv+ZCUHAniscLZNgJXAaaOQrdOuYqKA6LvRVSlgbYyiMX0xyHuz",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/devfmt-format.js"]
    },
    "pako": {
      "url": "https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js",
      "integrity": "sha384-rNlaE5fs9dGIjmxWDALQh/RBAaGRYT5ChrzHo6tRfgrZ36iRFAiquP5g41Jsv+0j",
      "license": "MIT AND Zlib",
      "kind": "script",
      "tools": ["js/tools/archive.js"]
    },
    "fflate": {
      "url": "https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js",
      "integrity": "sha384-DT0Ls0mO7JmjTnT+oBuMhEJzYJO1zUqzuuMXNdnOmOQRIpN2BgSjvBV/j50NngIT",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/core.js", "js/tools/archive.js"]
    },
    "lzma": {
      "url": "https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma_worker.min.js",
      "integrity": "sha384-i0BmxJgY8ewnjHQFgeqUwAtroLPzl8tRN6M8tMYoR8fZPzUogiI6Uo8bUbzxKa9t",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/archive.js"]
    },
    "jsqr": {
      "url": "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
      "integrity": "sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx",
      "license": "Apache-2.0",
      "kind": "script",
      "tools": ["js/tools/media.js"]
    },
    "jsonpath": {
      "url": "https://unpkg.com/jsonpath-plus@10.3.0/dist/index-browser-umd.min.cjs",
      "integrity": "sha384-hGQPqOxTPM4foQNgrQgUmEiH4XmDBHG/JM6hBfraI4LJ9LA9V/tDGADiGRXeC9/c",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/dataformat.js"]
    },
    "jmespath": {
      "url": "https://cdn.jsdelivr.net/npm/jmespath@0.16.0/jmespath.min.js",
      "integrity": "sha384-gWcKrbXrrv/Qu9WrcJK8aDvaUwv8LMxpzdBtpRCNn3eoq7D6uOySOdo2YFvhaYrx",
      "license": "Apache-2.0",
      "kind": "script",
      "tools": ["js/tools/dataformat.js"]
    },
    "zSchema": {
      "url": "https://cdn.jsdelivr.net/npm/z-schema@12.4.0/umd/ZSchema.min.js",
      "integrity": "sha384-uwH59hDi0evUZU9ySSP5KjCl0MAXZiFlA4eWOswSbiuGdLZKBmE7iztFuOFv42Gt",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/dataformat.js"]
    },
    "bcrypt": {
      "url": "https://cdn.jsdelivr.net/npm/bcryptjs@2.4.3/dist/bcrypt.min.js",
      "integrity": "sha384-qGFE4FIJLgCFuYs3nzg39XpCtvT5AZUhaBdjB3e1+vpKQa03AkyWOyBSFb9OcQ/g",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/cryptotools.js"]
    },
    "hashWasm": {
      "url": "https://cdn.jsdelivr.net/npm/hash-wasm@4.12.0/dist/index.umd.js",
      "integrity": "sha384-xqpAfTvjqeQXohcBXlcJLUDhn4Y4oFz8WBkp7H1Lak1kldyrkEwU8/q0pOfbYVn2",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/cryptotools.js", "js/tools/hashing.js"]
    },
    "tweetnacl": {
      "url": "https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js",
      "integrity": "sha384-05+sicyRJQ56XpL4U9HJ8YbtSzFDvAg7apPKOGV6A0JsAJKFM68jp5oLnUjG5mEp",
      "license": "Unlicense",
      "kind": "script",
      "tools": ["js/tools/cryptotools.js", "js/tools/pki.js"]
    }
  },
  "vendored": {
    "cryptoJsWorker": {
      "path": "assets/vendor/crypto-js-4.2.0.min.js",
      "integrity": "sha384-mgWScxWVKP8F7PBbpNp7i/aSb17kN0LcifBpahAplF3Mn0GR4/u1oMpWIm2rD8yY",
      "source": "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js",
      "sourceIntegrity": "sha384-mgWScxWVKP8F7PBbpNp7i/aSb17kN0LcifBpahAplF3Mn0GR4/u1oMpWIm2rD8yY",
      "license": "MIT",
      "tools": ["js/tools/hashing.js"]
    },
    "smolToml": {
      "path": "assets/vendor/smol-toml-1.2.2.mjs",
      "integrity": "sha384-+o/LoGqbIrGc9fWR9hZI+JsVoUoMGibYVsEynMz33B/i3P8j4xcdCFR7mBIW9xEP",
      "source": "https://cdn.jsdelivr.net/npm/smol-toml@1.2.2/+esm",
      "sourceIntegrity": "sha384-+o/LoGqbIrGc9fWR9hZI+JsVoUoMGibYVsEynMz33B/i3P8j4xcdCFR7mBIW9xEP",
      "license": "BSD-3-Clause",
      "tools": ["js/tools/dataformat.js"]
    },
    "brotliCompress": {
      "path": "assets/vendor/brotli-compress-1.3.3.mjs",
      "integrity": "sha384-/hg6ctFoDqW/LRdLeiuUW28NL+RL+R+ninNkKzNIAMf9PzcllGfuNUN9p23y0DLc",
      "source": "https://cdn.jsdelivr.net/npm/brotli-compress@1.3.3/index.mjs",
      "sourceIntegrity": "sha384-/hg6ctFoDqW/LRdLeiuUW28NL+RL+R+ninNkKzNIAMf9PzcllGfuNUN9p23y0DLc",
      "license": "Apache-2.0",
      "tools": ["js/tools/archive.js"]
    },
    "brotliDecompress": {
      "path": "assets/vendor/brotli-decompress-1.3.3.mjs",
      "integrity": "sha384-0DWt7KH3BB7UTY1iywY0tyM7NfJJ5SiWN8gt8kFf3izEeZptC+q0jr/8KjLrW7xf",
      "source": "https://cdn.jsdelivr.net/npm/brotli@1.3.3/decompress.js/+esm",
      "sourceIntegrity": "sha384-E6MAu//hrot7qFyeqjLGxqJ9wba48vL5j+ENc6G2vE6hM3Q9Zyxxc0Q9PrKl4tWb",
      "license": "MIT",
      "tools": ["js/tools/archive.js"]
    },
    "zstdCompress": {
      "path": "assets/vendor/zstd-compress-0.0.27.mjs",
      "integrity": "sha384-8cxMCI54YYF3ngeYrlyAEtdYkzxeFrZWZp1BaGopdfxabrYGsS74ckgP2/YiPGpm",
      "source": "https://cdn.jsdelivr.net/npm/@bokuweb/zstd-wasm@0.0.27/+esm",
      "sourceIntegrity": "sha384-SmJLKQ1PpKIS3qBOQWPyc+U5ScUudslu3btMo7d9DHcOKxBz7Nz5Cp3QoS6IqhL/",
      "license": "MIT",
      "tools": ["js/tools/archive.js"]
    },
    "zstdWasm": {
      "path": "assets/vendor/zstd-wasm-0.0.27.wasm",
      "integrity": "sha384-MIWnGpnIkQ7YxqaFxzhMjv9Kc6zOqfy77ZNJx+iQNrJlMlkLIA+JJVLDqGZ3rPW4",
      "source": "https://cdn.jsdelivr.net/npm/@bokuweb/zstd-wasm@0.0.27/dist/web/zstd.wasm",
      "sourceIntegrity": "sha384-MIWnGpnIkQ7YxqaFxzhMjv9Kc6zOqfy77ZNJx+iQNrJlMlkLIA+JJVLDqGZ3rPW4",
      "license": "MIT",
      "tools": ["js/tools/archive.js"]
    },
    "zstdDecompress": {
      "path": "assets/vendor/fzstd-0.1.1.mjs",
      "integrity": "sha384-36JTXuypr3iXDZRIdK27FY0dfxYJNwlPtx4tbu2ErYD47ppPrXtObkp9kzqhhie+",
      "source": "https://cdn.jsdelivr.net/npm/fzstd@0.1.1/+esm",
      "sourceIntegrity": "sha384-36JTXuypr3iXDZRIdK27FY0dfxYJNwlPtx4tbu2ErYD47ppPrXtObkp9kzqhhie+",
      "license": "MIT",
      "tools": ["js/tools/archive.js"]
    },
    "bzip2Decompress": {
      "path": "assets/vendor/seek-bzip-2.0.0.mjs",
      "integrity": "sha384-usIs/KK/0l3b5KOooBEmxKmlAkXn9vyWiFMIuDbYmMf29mlWi5hjlgpD4O5M0UrB",
      "source": "https://cdn.jsdelivr.net/npm/seek-bzip@2.0.0/+esm",
      "sourceIntegrity": "sha384-usIs/KK/0l3b5KOooBEmxKmlAkXn9vyWiFMIuDbYmMf29mlWi5hjlgpD4O5M0UrB",
      "license": "MIT",
      "tools": ["js/tools/archive.js"]
    },
    "lz4": {
      "path": "assets/vendor/lz4js-0.2.0.mjs",
      "integrity": "sha384-1gyPa+NXP6qrwcxIm0AZ1qJ8VDd40VpPFdVp0FVLx3oYko16nZcVpzp0cJE7HXsI",
      "source": "https://cdn.jsdelivr.net/npm/lz4js@0.2.0/+esm",
      "sourceIntegrity": "sha384-1gyPa+NXP6qrwcxIm0AZ1qJ8VDd40VpPFdVp0FVLx3oYko16nZcVpzp0cJE7HXsI",
      "license": "ISC",
      "tools": ["js/tools/archive.js"]
    },
    "gifenc": {
      "path": "assets/vendor/gifenc-1.0.3.mjs",
      "integrity": "sha384-EfUTDezHroFGSc5auU2WaufI20uFOnrsAzmsj3A3jth9RGB9bc+Qv5ILBF//UBZz",
      "source": "https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm",
      "sourceIntegrity": "sha384-EfUTDezHroFGSc5auU2WaufI20uFOnrsAzmsj3A3jth9RGB9bc+Qv5ILBF//UBZz",
      "license": "MIT",
      "tools": ["js/tools/media.js"]
    },
    "openpgp": {
      "path": "assets/vendor/openpgp-5.11.1.min.mjs",
      "integrity": "sha384-m6+ZxNo9HLYd6qRh4ooNqJWOFctQSdEpDQkT86+ehzerQ5cvthBinVk9VkpnC2IA",
      "source": "https://cdn.jsdelivr.net/npm/openpgp@5.11.1/dist/openpgp.min.mjs",
      "sourceIntegrity": "sha384-m6+ZxNo9HLYd6qRh4ooNqJWOFctQSdEpDQkT86+ehzerQ5cvthBinVk9VkpnC2IA",
      "license": "LGPL-3.0-or-later",
      "tools": ["js/tools/cryptotools.js"]
    }
  },
  "tests": {
    "playwright": {
      "version": "1.62.1",
      "source": "https://registry.npmjs.org/@playwright/test/-/test-1.62.1.tgz",
      "integrity": "sha512-DTcUc8qii+cpHvtOwggMtBRMjKZHXYWdw8syRYu2vtzuq4Wxphqq4NfCs5Zt44L6mA8rfDfj+PHnxFc/FeK6mQ==",
      "license": "Apache-2.0",
      "use": "브라우저 기능·호환성 회귀 테스트"
    },
    "axeCore": {
      "version": "4.10.3",
      "source": "https://registry.npmjs.org/axe-core/-/axe-core-4.10.3.tgz",
      "integrity": "sha512-Xm7bpRXnDSX2YE2YFfBk2FnF0ep6tmG7xPh8iHee8MIcrgq762Nkce856dYtJYLkuIoYZvGfTs/PbZhideTcEg==",
      "license": "MPL-2.0",
      "use": "WCAG 자동 접근성 검사"
    }
  },
  "reviewed": "2026-08-24"
};

Object.freeze(globalThis.WTOOLS_DEPENDENCIES.cdn);
Object.freeze(globalThis.WTOOLS_DEPENDENCIES.vendored);
Object.freeze(globalThis.WTOOLS_DEPENDENCIES.tests);
Object.freeze(globalThis.WTOOLS_DEPENDENCIES);
