# 제3자 자료 고지

## EFF Short Wordlist #1

- 포함 파일: `assets/eff-short-wordlist-1.txt`
- 원본: [EFF Dice-Generated Passphrases](https://www.eff.org/dice)의 `EFF's Short Wordlist #1`
- 제작: Electronic Frontier Foundation, Joseph Bonneau
- 라이선스: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

이 저장소에는 EFF가 공개한 원본 단어 목록을 변경하지 않고 포함합니다. 라이선스 근거는
[EFF Copyright Policy](https://www.eff.org/copyright)에서 확인할 수 있습니다.

## FIGlet 글꼴의 ASCII 글리프

- 포함 파일: `assets/data/figlet/*.flf`
- 원본: `figlet 1.7.0` 배포본의 Standard, Big, Small, Slant, Banner, Block, Doom, Ghost,
  Shadow, Speed FIGfont
- 라이선스: `figlet 1.7.0` 배포본의 MIT 라이선스 및 글꼴별 원본 주석의 수정 조건
- 변경: W-Tools가 지원하는 printable ASCII(U+0020–U+007E) 글리프만 남기고 내부
  FIGfont 파서용으로 주석과 줄바꿈을 정규화

Standard는 Glenn Chappell과 Ian Chai, Big·Small·Slant·Block·Shadow는 Glenn Chappell,
Banner는 Ryan Youck, Doom은 Frans P. de Vries, Ghost는 myflix, Speed는 Claude Martins가
제작했습니다. Banner를 제외한 원본 글꼴 주석은 수정자의 이름을 주석에 남기는 조건으로 수정을
허용하며, 생성된 모든 파일에는 W-Tools 수정 고지를 포함합니다. 원본 URL과 SHA-384는
`scripts/generate_figlet_fonts.py`에 고정되어 있습니다.

## 이모지 검색 데이터

- 포함 파일: `assets/data/emoji.json`
- 원본: `scripts/emoji-data-lock.json`에 고정된 Unicode Emoji `emoji-test.txt`,
  CLDR 한국어·영어 annotation 데이터
- 데이터 기준: `scripts/emoji-data-lock.json`과 생성 자산의 메타데이터에 기록
- 라이선스: Unicode License v3
- 변경: 스킨톤 등 조합용 컴포넌트를 제외한 기본 이모지의 문자·그룹·한국어 라벨과
  한국어/영어 검색어만 앱 전용 배열 형식으로 재구성하고 중복 검색어를 제거

원자료의 저작권과 사용 조건은 [Unicode License v3](https://www.unicode.org/license.txt)를
따릅니다. 고정한 Unicode 파일과 공식 `unicode-org/cldr` 릴리스 태그의 원본 URL,
SHA-384는 `scripts/emoji-data-lock.json`에, 변환·검증·공식 안정판 갱신 과정은
`scripts/generate_emoji_data.py`에 기록되어 있습니다.

## 로컬 고정 ESM/WASM

동적 모듈과 하위 자산은 공급망 무결성을 위해 SHA-384로 고정한 검토본을
`assets/vendor/`에 포함합니다. 정확한 원본 URL, 파일별 해시와 사용처는
`js/dependencies.js`가 관리합니다.

| 패키지 | 버전 | 라이선스 | 사용 범위 |
|---|---:|---|---|
| CryptoJS | 4.2.0 | MIT | 파일 해시 Worker |
| smol-toml | 1.2.2 | BSD-3-Clause | TOML 변환 |
| brotli-compress | 1.3.3 | Apache-2.0 | Brotli 압축 |
| brotli | 1.3.3 | MIT | Brotli 해제 |
| @bokuweb/zstd-wasm | 0.0.27 | MIT | Zstandard 압축 및 WASM |
| fzstd | 0.1.1 | MIT | Zstandard 해제 |
| seek-bzip | 2.0.0 | MIT | Bzip2 해제 |
| lz4js | 0.2.0 | ISC | LZ4 압축·해제 |
| OpenPGP.js | 5.11.1 | LGPL-3.0-or-later | PGP 키·암복호화 |

각 파일은 위 패키지의 배포본을 기준으로 사용합니다. 단, Brotli 해제 모듈의
`base64-js` import는 W-Tools 공통 Base64 모듈로 바꾸고 Zstandard 모듈의 WASM 상대
경로를 로컬 자산에 맞게 바꿉니다. 원본 해시와 변환 결과 해시를 모두 등록부에서
검증합니다.

## 테스트 전용 의존성

정적 사이트 배포물에는 포함되지 않으며 CI에서만 사용합니다. Playwright 1.62.1은
Apache-2.0, axe-core 4.10.3은 MPL-2.0 라이선스입니다. npm 배포본 URL과 SHA-512는
`js/dependencies.js`와 `tests/package-lock.json`에서 함께 검증합니다.
