# 제3자 자료 고지

## EFF Short Wordlist #1

- 포함 파일: `assets/eff-short-wordlist-1.txt`
- 원본: [EFF Dice-Generated Passphrases](https://www.eff.org/dice)의 `EFF's Short Wordlist #1`
- 제작: Electronic Frontier Foundation, Joseph Bonneau
- 라이선스: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

이 저장소에는 EFF가 공개한 원본 단어 목록을 변경하지 않고 포함합니다. 라이선스 근거는
[EFF Copyright Policy](https://www.eff.org/copyright)에서 확인할 수 있습니다.

## 로컬 고정 ESM/WASM

동적 모듈과 하위 자산은 공급망 무결성을 위해 SHA-384로 고정한 검토본을
`assets/vendor/`에 포함합니다. 정확한 원본 URL, 파일별 해시와 사용처는
`js/dependencies.js`가 관리합니다.

| 패키지 | 버전 | 라이선스 | 사용 범위 |
|---|---:|---|---|
| CryptoJS | 4.2.0 | MIT | 파일 해시 Worker |
| smol-toml | 1.2.2 | BSD-3-Clause | TOML 변환 |
| brotli-compress | 1.3.3 | Apache-2.0 | Brotli 압축 |
| brotli, base64-js | 1.3.3, 1.5.1 | MIT | Brotli 해제 |
| @bokuweb/zstd-wasm | 0.0.27 | MIT | Zstandard 압축 및 WASM |
| fzstd | 0.1.1 | MIT | Zstandard 해제 |
| seek-bzip | 2.0.0 | MIT | Bzip2 해제 |
| lz4js | 0.2.0 | ISC | LZ4 압축·해제 |
| gifenc | 1.0.3 | MIT | GIF 변환 |
| OpenPGP.js | 5.11.1 | LGPL-3.0-or-later | PGP 키·암복호화 |

각 파일은 위 패키지의 배포본을 그대로 사용합니다. 단, 브라우저에서 로컬 하위 자산을
찾도록 Brotli 해제 모듈의 `base64-js` import와 Zstandard 모듈의 WASM 상대 경로만
바꾸며, 원본 해시와 변환 결과 해시를 모두 등록부에서 검증합니다.

## 테스트 전용 의존성

정적 사이트 배포물에는 포함되지 않으며 CI에서만 사용합니다. Playwright 1.62.1은
Apache-2.0, axe-core 4.10.3은 MPL-2.0 라이선스입니다. npm 배포본 URL과 SHA-512는
`js/dependencies.js`와 `tests/package-lock.json`에서 함께 검증합니다.
