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

## Brotli 표준 사전·문맥·변환 데이터

- 포함 파일: `assets/data/brotli-dictionary.bin`, `js/lib/archive/brotli-tables.js`
- 원본: IETF [RFC 7932](https://www.rfc-editor.org/rfc/rfc7932) 7.1절, 부록 A·B
- 저자: Jyrki Alakuijala, Zoltan Szabadka
- 변경: 표준의 16진수 사전을 바이트 파일로, 문맥·변환표를 ES 모듈 배열로 재구성
- 재현: `scripts/generate_brotli_data.py`가 고정 RFC 해시와 표준에 실린 길이·CRC를 검사

이 자료는 표준 형식을 읽기 위한 고정 데이터입니다. 해제 알고리즘은 W-Tools의 자체 구현이며,
제3자 해제기 코드를 포함하지 않습니다. RFC 코드 구성요소에 적용되는 IETF Trust의 BSD 조건을
아래에 재현합니다. RFC가 사용한 “Simplified BSD” 명칭은 IETF Trust가 “Revised BSD”로
정정했으며, [조건의 본문은 동일합니다](https://trustee.ietf.org/documents/trust-legal-provisions/tlp-5/).

Copyright (c) 2016 IETF Trust and the persons identified as authors of the code.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of Internet Society, IETF or IETF Trust, nor the names of
   specific contributors, may be used to endorse or promote products derived
   from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

## Zstandard 형식 테이블

`js/lib/archive/zstd-entropy.js`의 기본 확률·길이 테이블은
[RFC 8878](https://www.rfc-editor.org/rfc/rfc8878)의 고정 형식 데이터입니다.
Copyright (c) 2021 IETF Trust and the persons identified as authors of the code.
All rights reserved. 위의 IETF Trust BSD 조건이 적용됩니다. 코덱 알고리즘은 자체 구현입니다.

## Bzip2 구형 랜덤화 데이터

`js/lib/archive/bzip2-random.js`의 512개 정수는 bzip2 1.0.8 `randtable.c`에 정의된
고정 형식 데이터입니다. ES 모듈 배열로 변환했으며, 해제 알고리즘은 자체 구현입니다.
원본 bzip2 프로그램·라이브러리 코드는 포함하지 않습니다.

This program, "bzip2", the associated library "libbzip2", and all
documentation, are copyright (C) 1996-2019 Julian R Seward.  All
rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.

2. The origin of this software must not be misrepresented; you must 
   not claim that you wrote the original software.  If you use this 
   software in a product, an acknowledgment in the product 
   documentation would be appreciated but is not required.

3. Altered source versions must be plainly marked as such, and must
   not be misrepresented as being the original software.

4. The name of the author may not be used to endorse or promote 
   products derived from this software without specific prior written 
   permission.

THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS
OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Julian Seward, jseward@acm.org
bzip2/libbzip2 version 1.0.8 of 13 July 2019

## 로컬 고정 ESM/WASM

동적 모듈과 하위 자산은 공급망 무결성을 위해 SHA-384로 고정한 검토본을
`assets/vendor/`에 포함합니다. 정확한 원본 URL, 파일별 해시와 사용처는
`js/dependencies.js`가 관리합니다.

| 패키지 | 버전 | 라이선스 | 사용 범위 |
|---|---:|---|---|
| CryptoJS | 4.2.0 | MIT | 파일 해시 Worker |
| OpenPGP.js | 5.11.3 | LGPL-3.0-or-later | PGP 키·암복호화 |

각 파일은 위 패키지의 배포본을 사용하며, 원본과 로컬 파일의 해시를 등록부에서 검증합니다.

## 테스트 전용 의존성

정적 사이트 배포물에는 포함되지 않으며 CI에서만 사용합니다. Playwright 1.62.1은
Apache-2.0, axe-core 4.10.3은 MPL-2.0 라이선스입니다. npm 배포본 URL과 SHA-512는
`js/dependencies.js`와 `tests/package-lock.json`에서 함께 검증합니다.
