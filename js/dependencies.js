// 실행 가능한 제3자 자산 등록부.
// 브라우저 코드, 서비스 워커, scripts/validate_static.py가 이 파일을 함께 사용한다.
globalThis.WTOOLS_DEPENDENCIES = {
  "cdn": {
    "cryptoJs": {
      "package": "crypto-js",
      "version": "4.2.0",
      "url": "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js",
      "integrity": "sha384-mgWScxWVKP8F7PBbpNp7i/aSb17kN0LcifBpahAplF3Mn0GR4/u1oMpWIm2rD8yY",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/main.js", "js/tools/cryptotools.js", "js/tools/encoding.js", "js/tools/hashing.js", "js/tools/pki.js"]
    },
    "jsrsasign": {
      "package": "jsrsasign",
      "version": "11.1.5",
      "url": "https://cdn.jsdelivr.net/npm/jsrsasign@11.1.5/lib/jsrsasign-all-min.js",
      "integrity": "sha384-IdrNKmnO2MACDlM1h9Mxh3iC1hsUWqJtqPavxru0+RKPp533myjoFCv8nGIj4QLh",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/cryptotools.js", "js/tools/encoding.js", "js/tools/pki.js"]
    },
    "pako": {
      "package": "pako",
      "version": "2.1.0",
      "url": "https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js",
      "integrity": "sha384-rNlaE5fs9dGIjmxWDALQh/RBAaGRYT5ChrzHo6tRfgrZ36iRFAiquP5g41Jsv+0j",
      "license": "MIT AND Zlib",
      "kind": "script",
      "tools": ["js/tools/archive.js"]
    },
    "fflate": {
      "package": "fflate",
      "version": "0.8.2",
      "url": "https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js",
      "integrity": "sha384-DT0Ls0mO7JmjTnT+oBuMhEJzYJO1zUqzuuMXNdnOmOQRIpN2BgSjvBV/j50NngIT",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/core.js", "js/tools/archive.js"]
    },
    "lzma": {
      "package": "lzma",
      "version": "2.3.2",
      "url": "https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma_worker.min.js",
      "integrity": "sha384-i0BmxJgY8ewnjHQFgeqUwAtroLPzl8tRN6M8tMYoR8fZPzUogiI6Uo8bUbzxKa9t",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/archive.js"]
    },
    "jmespath": {
      "package": "jmespath",
      "version": "0.16.0",
      "url": "https://cdn.jsdelivr.net/npm/jmespath@0.16.0/jmespath.min.js",
      "integrity": "sha384-gWcKrbXrrv/Qu9WrcJK8aDvaUwv8LMxpzdBtpRCNn3eoq7D6uOySOdo2YFvhaYrx",
      "license": "Apache-2.0",
      "kind": "script",
      "tools": ["js/tools/dataformat.js"]
    },
    "zSchema": {
      "package": "z-schema",
      "version": "12.4.0",
      "url": "https://cdn.jsdelivr.net/npm/z-schema@12.4.0/umd/ZSchema.min.js",
      "integrity": "sha384-uwH59hDi0evUZU9ySSP5KjCl0MAXZiFlA4eWOswSbiuGdLZKBmE7iztFuOFv42Gt",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/dataformat.js"]
    },
    "bcrypt": {
      "package": "bcryptjs",
      "version": "2.4.3",
      "url": "https://cdn.jsdelivr.net/npm/bcryptjs@2.4.3/dist/bcrypt.min.js",
      "integrity": "sha384-qGFE4FIJLgCFuYs3nzg39XpCtvT5AZUhaBdjB3e1+vpKQa03AkyWOyBSFb9OcQ/g",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/cryptotools.js"]
    },
    "hashWasm": {
      "package": "hash-wasm",
      "version": "4.12.0",
      "url": "https://cdn.jsdelivr.net/npm/hash-wasm@4.12.0/dist/index.umd.js",
      "integrity": "sha384-xqpAfTvjqeQXohcBXlcJLUDhn4Y4oFz8WBkp7H1Lak1kldyrkEwU8/q0pOfbYVn2",
      "license": "MIT",
      "kind": "script",
      "tools": ["js/tools/cryptotools.js", "js/tools/hashing.js"]
    },
    "tweetnacl": {
      "package": "tweetnacl",
      "version": "1.0.3",
      "url": "https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js",
      "integrity": "sha384-05+sicyRJQ56XpL4U9HJ8YbtSzFDvAg7apPKOGV6A0JsAJKFM68jp5oLnUjG5mEp",
      "license": "Unlicense",
      "kind": "script",
      "tools": ["js/tools/cryptotools.js", "js/tools/pki.js"]
    }
  },
  "vendored": {
    "cryptoJsWorker": {
      "package": "crypto-js",
      "version": "4.2.0",
      "path": "assets/vendor/crypto-js-4.2.0.min.js",
      "integrity": "sha384-mgWScxWVKP8F7PBbpNp7i/aSb17kN0LcifBpahAplF3Mn0GR4/u1oMpWIm2rD8yY",
      "source": "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js",
      "sourceIntegrity": "sha384-mgWScxWVKP8F7PBbpNp7i/aSb17kN0LcifBpahAplF3Mn0GR4/u1oMpWIm2rD8yY",
      "license": "MIT",
      "tools": ["js/tools/hashing.js", "js/workers/file-hash.js"]
    },
    "brotliCompress": {
      "package": "brotli-compress",
      "version": "1.3.3",
      "path": "assets/vendor/brotli-compress-1.3.3.mjs",
      "integrity": "sha384-/hg6ctFoDqW/LRdLeiuUW28NL+RL+R+ninNkKzNIAMf9PzcllGfuNUN9p23y0DLc",
      "source": "https://cdn.jsdelivr.net/npm/brotli-compress@1.3.3/index.mjs",
      "sourceIntegrity": "sha384-/hg6ctFoDqW/LRdLeiuUW28NL+RL+R+ninNkKzNIAMf9PzcllGfuNUN9p23y0DLc",
      "license": "Apache-2.0",
      "tools": ["js/tools/archive.js"]
    },
    "brotliDecompress": {
      "package": "brotli",
      "version": "1.3.3",
      "path": "assets/vendor/brotli-decompress-1.3.3.mjs",
      "integrity": "sha384-0DWt7KH3BB7UTY1iywY0tyM7NfJJ5SiWN8gt8kFf3izEeZptC+q0jr/8KjLrW7xf",
      "source": "https://cdn.jsdelivr.net/npm/brotli@1.3.3/decompress.js/+esm",
      "sourceIntegrity": "sha384-E6MAu//hrot7qFyeqjLGxqJ9wba48vL5j+ENc6G2vE6hM3Q9Zyxxc0Q9PrKl4tWb",
      "license": "MIT",
      "tools": ["js/tools/archive.js"]
    },
    "zstdCompress": {
      "package": "@bokuweb/zstd-wasm",
      "version": "0.0.27",
      "path": "assets/vendor/zstd-compress-0.0.27.mjs",
      "integrity": "sha384-8cxMCI54YYF3ngeYrlyAEtdYkzxeFrZWZp1BaGopdfxabrYGsS74ckgP2/YiPGpm",
      "source": "https://cdn.jsdelivr.net/npm/@bokuweb/zstd-wasm@0.0.27/+esm",
      "sourceIntegrity": "sha384-SmJLKQ1PpKIS3qBOQWPyc+U5ScUudslu3btMo7d9DHcOKxBz7Nz5Cp3QoS6IqhL/",
      "license": "MIT",
      "tools": ["js/tools/archive.js"]
    },
    "zstdWasm": {
      "package": "@bokuweb/zstd-wasm",
      "version": "0.0.27",
      "path": "assets/vendor/zstd-wasm-0.0.27.wasm",
      "integrity": "sha384-MIWnGpnIkQ7YxqaFxzhMjv9Kc6zOqfy77ZNJx+iQNrJlMlkLIA+JJVLDqGZ3rPW4",
      "source": "https://cdn.jsdelivr.net/npm/@bokuweb/zstd-wasm@0.0.27/dist/web/zstd.wasm",
      "sourceIntegrity": "sha384-MIWnGpnIkQ7YxqaFxzhMjv9Kc6zOqfy77ZNJx+iQNrJlMlkLIA+JJVLDqGZ3rPW4",
      "license": "MIT",
      "tools": ["js/tools/archive.js"]
    },
    "zstdDecompress": {
      "package": "fzstd",
      "version": "0.1.1",
      "path": "assets/vendor/fzstd-0.1.1.mjs",
      "integrity": "sha384-36JTXuypr3iXDZRIdK27FY0dfxYJNwlPtx4tbu2ErYD47ppPrXtObkp9kzqhhie+",
      "source": "https://cdn.jsdelivr.net/npm/fzstd@0.1.1/+esm",
      "sourceIntegrity": "sha384-36JTXuypr3iXDZRIdK27FY0dfxYJNwlPtx4tbu2ErYD47ppPrXtObkp9kzqhhie+",
      "license": "MIT",
      "tools": ["js/tools/archive.js"]
    },
    "bzip2Decompress": {
      "package": "seek-bzip",
      "version": "2.0.0",
      "path": "assets/vendor/seek-bzip-2.0.0.mjs",
      "integrity": "sha384-usIs/KK/0l3b5KOooBEmxKmlAkXn9vyWiFMIuDbYmMf29mlWi5hjlgpD4O5M0UrB",
      "source": "https://cdn.jsdelivr.net/npm/seek-bzip@2.0.0/+esm",
      "sourceIntegrity": "sha384-usIs/KK/0l3b5KOooBEmxKmlAkXn9vyWiFMIuDbYmMf29mlWi5hjlgpD4O5M0UrB",
      "license": "MIT",
      "tools": ["js/tools/archive.js"]
    },
    "lz4": {
      "package": "lz4js",
      "version": "0.2.0",
      "path": "assets/vendor/lz4js-0.2.0.mjs",
      "integrity": "sha384-1gyPa+NXP6qrwcxIm0AZ1qJ8VDd40VpPFdVp0FVLx3oYko16nZcVpzp0cJE7HXsI",
      "source": "https://cdn.jsdelivr.net/npm/lz4js@0.2.0/+esm",
      "sourceIntegrity": "sha384-1gyPa+NXP6qrwcxIm0AZ1qJ8VDd40VpPFdVp0FVLx3oYko16nZcVpzp0cJE7HXsI",
      "license": "ISC",
      "tools": ["js/tools/archive.js"]
    },
    "openpgp": {
      "package": "openpgp",
      "version": "5.11.3",
      "path": "assets/vendor/openpgp-5.11.3.min.mjs",
      "integrity": "sha384-NiknPeWCb1MqBPxyi4JE67L0QiTiFaVZi7scBC1HzhzZFTnG/e2TrY/qRScsXCQm",
      "source": "https://cdn.jsdelivr.net/npm/openpgp@5.11.3/dist/openpgp.min.mjs",
      "sourceIntegrity": "sha384-NiknPeWCb1MqBPxyi4JE67L0QiTiFaVZi7scBC1HzhzZFTnG/e2TrY/qRScsXCQm",
      "license": "LGPL-3.0-or-later",
      "tools": ["js/tools/cryptotools.js"]
    }
  },
  "tests": {
    "playwright": {
      "package": "@playwright/test",
      "version": "1.62.1",
      "source": "https://registry.npmjs.org/@playwright/test/-/test-1.62.1.tgz",
      "integrity": "sha512-DTcUc8qii+cpHvtOwggMtBRMjKZHXYWdw8syRYu2vtzuq4Wxphqq4NfCs5Zt44L6mA8rfDfj+PHnxFc/FeK6mQ==",
      "license": "Apache-2.0",
      "use": "브라우저 기능·호환성 회귀 테스트"
    },
    "axeCore": {
      "package": "axe-core",
      "version": "4.10.3",
      "source": "https://registry.npmjs.org/axe-core/-/axe-core-4.10.3.tgz",
      "integrity": "sha512-Xm7bpRXnDSX2YE2YFfBk2FnF0ep6tmG7xPh8iHee8MIcrgq762Nkce856dYtJYLkuIoYZvGfTs/PbZhideTcEg==",
      "license": "MPL-2.0",
      "use": "WCAG 자동 접근성 검사"
    }
  },
  "reviewed": "2026-08-29"
};

Object.freeze(globalThis.WTOOLS_DEPENDENCIES.cdn);
Object.freeze(globalThis.WTOOLS_DEPENDENCIES.vendored);
Object.freeze(globalThis.WTOOLS_DEPENDENCIES.tests);
Object.freeze(globalThis.WTOOLS_DEPENDENCIES);
