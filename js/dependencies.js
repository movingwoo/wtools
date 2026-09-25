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
      "tools": [
        "js/main.js",
        "js/tools/cryptotools.js",
        "js/tools/encoding.js",
        "js/tools/hashing.js",
        "js/tools/pki.js"
      ]
    },
    "jsrsasign": {
      "package": "jsrsasign",
      "version": "11.1.5",
      "url": "https://cdn.jsdelivr.net/npm/jsrsasign@11.1.5/lib/jsrsasign-all-min.js",
      "integrity": "sha384-IdrNKmnO2MACDlM1h9Mxh3iC1hsUWqJtqPavxru0+RKPp533myjoFCv8nGIj4QLh",
      "license": "MIT",
      "kind": "script",
      "tools": [
        "js/tools/cryptotools.js",
        "js/tools/encoding.js",
        "js/tools/pki.js"
      ]
    },
    "bcrypt": {
      "package": "bcryptjs",
      "version": "2.4.3",
      "url": "https://cdn.jsdelivr.net/npm/bcryptjs@2.4.3/dist/bcrypt.min.js",
      "integrity": "sha384-qGFE4FIJLgCFuYs3nzg39XpCtvT5AZUhaBdjB3e1+vpKQa03AkyWOyBSFb9OcQ/g",
      "license": "MIT",
      "kind": "script",
      "tools": [
        "js/tools/cryptotools.js"
      ]
    },
    "hashWasm": {
      "package": "hash-wasm",
      "version": "4.12.0",
      "url": "https://cdn.jsdelivr.net/npm/hash-wasm@4.12.0/dist/index.umd.js",
      "integrity": "sha384-xqpAfTvjqeQXohcBXlcJLUDhn4Y4oFz8WBkp7H1Lak1kldyrkEwU8/q0pOfbYVn2",
      "license": "MIT",
      "kind": "script",
      "tools": [
        "js/tools/cryptotools.js",
        "js/tools/hashing.js"
      ]
    },
    "tweetnacl": {
      "package": "tweetnacl",
      "version": "1.0.3",
      "url": "https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js",
      "integrity": "sha384-05+sicyRJQ56XpL4U9HJ8YbtSzFDvAg7apPKOGV6A0JsAJKFM68jp5oLnUjG5mEp",
      "license": "Unlicense",
      "kind": "script",
      "tools": [
        "js/tools/cryptotools.js",
        "js/tools/pki.js"
      ]
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
      "tools": [
        "js/tools/hashing.js",
        "js/workers/file-hash.js"
      ]
    },
    "openpgp": {
      "package": "openpgp",
      "version": "5.11.3",
      "path": "assets/vendor/openpgp-5.11.3.min.mjs",
      "integrity": "sha384-NiknPeWCb1MqBPxyi4JE67L0QiTiFaVZi7scBC1HzhzZFTnG/e2TrY/qRScsXCQm",
      "source": "https://cdn.jsdelivr.net/npm/openpgp@5.11.3/dist/openpgp.min.mjs",
      "sourceIntegrity": "sha384-NiknPeWCb1MqBPxyi4JE67L0QiTiFaVZi7scBC1HzhzZFTnG/e2TrY/qRScsXCQm",
      "license": "LGPL-3.0-or-later",
      "tools": [
        "js/tools/cryptotools.js"
      ]
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
  "reviewed": "2026-09-04"
};

Object.freeze(globalThis.WTOOLS_DEPENDENCIES.cdn);
Object.freeze(globalThis.WTOOLS_DEPENDENCIES.vendored);
Object.freeze(globalThis.WTOOLS_DEPENDENCIES.tests);
Object.freeze(globalThis.WTOOLS_DEPENDENCIES);
