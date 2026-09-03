// 이 파일은 scripts/generate_tool_manifest.mjs로 갱신합니다. 직접 편집하지 마세요.
export const TOOL_MANIFESTS = Object.freeze([
  {
    "id": "base64",
    "cat": "인코딩 / 디코딩",
    "name": "Base64 인코딩/디코딩",
    "desc": "텍스트를 Base64로 변환하거나 복원합니다. 커스텀 알파벳과 URL-safe를 지원합니다.",
    "keywords": "b64 encode decode",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "입력",
          "accepts": [
            "text",
            "base64"
          ]
        }
      ],
      "outputs": [
        {
          "id": "base64",
          "label": "Base64 결과",
          "type": "base64"
        },
        {
          "id": "decoded-json",
          "label": "디코딩한 JSON",
          "type": "json",
          "targets": [
            "json-format",
            "data-convert"
          ]
        },
        {
          "id": "decoded-text",
          "label": "디코딩한 텍스트",
          "type": "text"
        }
      ]
    },
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "base32",
    "cat": "인코딩 / 디코딩",
    "name": "Base32 인코딩/디코딩",
    "desc": "텍스트를 Base32(RFC 4648)로 변환하거나 복원합니다. 표준·Extended Hex·커스텀 알파벳을 지원합니다.",
    "keywords": "b32 encode decode otp secret rfc4648",
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "base58",
    "cat": "인코딩 / 디코딩",
    "name": "Base58 인코딩/디코딩",
    "desc": "Base58(비트코인/리플/플리커 알파벳)로 변환하거나 복원합니다. Base58Check 체크섬을 지원합니다.",
    "keywords": "base58 b58 bitcoin btc address wif ripple flickr ipfs check checksum",
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "base85",
    "cat": "인코딩 / 디코딩",
    "name": "Base85 인코딩/디코딩",
    "desc": "Ascii85(btoa), Adobe(<~ ~>), Z85 형식으로 변환하거나 복원합니다.",
    "keywords": "base85 b85 ascii85 a85 adobe z85 zeromq btoa git binary patch",
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "url-encode",
    "cat": "인코딩 / 디코딩",
    "name": "URL 인코딩/디코딩",
    "desc": "URL 퍼센트 인코딩(%XX)을 적용하거나 해제합니다.",
    "keywords": "percent encodeURIComponent urlencode urldecode query escape",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "입력",
          "accepts": [
            "url",
            "text"
          ]
        }
      ],
      "outputs": [
        {
          "id": "url",
          "label": "URL 결과",
          "type": "url"
        }
      ]
    },
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "url-parser",
    "cat": "인코딩 / 디코딩",
    "name": "URL 파서",
    "desc": "URL을 프로토콜, 호스트, 경로, 쿼리 파라미터 등으로 분해합니다.",
    "keywords": "uri url parse query string qs parameter params",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "URL",
          "accepts": [
            "url"
          ]
        }
      ],
      "outputs": [
        {
          "id": "url",
          "label": "원본 URL",
          "type": "url"
        }
      ]
    },
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "punycode",
    "cat": "인코딩 / 디코딩",
    "name": "Punycode / IDN 변환",
    "desc": "한글·유니코드 도메인과 ASCII(xn--) 표기를 상호 변환합니다.",
    "keywords": "punycode idn idna xn-- 국제화 도메인 한글도메인 한국 domain unicode rfc3492",
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "html-entities",
    "cat": "인코딩 / 디코딩",
    "name": "HTML 엔티티 인코딩/디코딩",
    "desc": "HTML 특수문자를 엔티티(&amp;lt; 등)로 변환하거나 복원합니다.",
    "keywords": "escape unescape",
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "quoted-printable",
    "cat": "인코딩 / 디코딩",
    "name": "Quoted-Printable 인코딩/디코딩",
    "desc": "메일 본문의 Quoted-Printable(=XX)과 헤더의 encoded-word(=?UTF-8?Q?...?=)를 변환합니다.",
    "keywords": "quoted printable qp mime email rfc2045 rfc2047 encoded word header 메일",
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "unicode-escape",
    "cat": "인코딩 / 디코딩",
    "name": "Unicode 이스케이프",
    "desc": "텍스트를 \\uXXXX 등 유니코드 이스케이프로 변환하거나 복원합니다.",
    "keywords": "escape codepoint",
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "morse",
    "cat": "인코딩 / 디코딩",
    "name": "모스 부호 인코딩/디코딩",
    "desc": "텍스트 ↔ 모스 부호를 변환합니다. 단어 구분은 / 를 사용합니다.",
    "keywords": "morse code",
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "text-binary",
    "cat": "인코딩 / 디코딩",
    "name": "텍스트 ↔ 이진수 변환",
    "desc": "텍스트를 바이트 단위 2진수(UTF-8)로 변환하거나 복원합니다.",
    "keywords": "binary ascii bits",
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "base-convert",
    "cat": "인코딩 / 디코딩",
    "name": "진법 변환",
    "desc": "정수를 2진수, 8진수, 10진수, 16진수 등 임의 진법(2~36)으로 변환합니다.",
    "keywords": "radix binary octal hex decimal",
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "roman",
    "cat": "인코딩 / 디코딩",
    "name": "로마 숫자 변환",
    "desc": "아라비아 숫자(1~3999) ↔ 로마 숫자를 변환합니다.",
    "keywords": "roman numeral",
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "jwt",
    "cat": "인코딩 / 디코딩",
    "name": "JWT 인코딩/디코딩/검증",
    "desc": "JWT의 서명과 클레임을 분리해 검증하고 HS/RS/PS/ES 알고리즘으로 생성합니다.",
    "keywords": "jwt json web token jsonwebtoken bearer sign verify claims",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "JWT 토큰",
          "accepts": [
            "jwt"
          ]
        }
      ],
      "outputs": [
        {
          "id": "payload-json",
          "label": "Payload JSON",
          "type": "json",
          "targets": [
            "json-format",
            "data-convert",
            "json-schema"
          ]
        }
      ]
    },
    "module": "./tools/encoding.js",
    "externalLibrary": true
  },
  {
    "id": "json-query",
    "cat": "데이터 포맷 변환",
    "name": "JSONPath / JMESPath 테스터",
    "desc": "RFC 9535 JSONPath 또는 JMESPath 표현식으로 JSON 데이터의 원하는 값을 조회합니다.",
    "keywords": "jsonpath jmespath json query path filter 조회 경로",
    "module": "./tools/dataformat.js",
    "externalLibrary": false
  },
  {
    "id": "json-schema",
    "cat": "데이터 포맷 변환",
    "name": "JSON Schema 검증 / 샘플 생성",
    "desc": "JSON Schema로 데이터를 검증하고 스키마 기반 예제 JSON을 생성합니다.",
    "keywords": "json schema validate draft 2020 2019 sample mock 검증 샘플",
    "transfer": {
      "inputs": [
        {
          "id": "json",
          "label": "검증할 JSON",
          "accepts": [
            "json"
          ]
        },
        {
          "id": "schema",
          "label": "JSON Schema",
          "accepts": [
            "json"
          ]
        }
      ]
    },
    "module": "./tools/dataformat.js",
    "externalLibrary": false
  },
  {
    "id": "data-convert",
    "cat": "데이터 포맷 변환",
    "name": "JSON ↔ YAML ↔ XML ↔ CSV ↔ TOML ↔ ENV",
    "desc": "데이터를 JSON, YAML, XML, CSV, TOML, ENV 포맷 간에 상호 변환합니다.",
    "keywords": "convert json yaml xml csv toml env dotenv environment",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "입력",
          "accepts": [
            "json",
            "yaml",
            "xml",
            "csv",
            "toml",
            "env"
          ],
          "optionsByType": {
            "json": {
              "options": {
                "from": "json"
              }
            },
            "yaml": {
              "options": {
                "from": "yaml"
              }
            },
            "xml": {
              "options": {
                "from": "xml"
              }
            },
            "csv": {
              "options": {
                "from": "csv"
              }
            },
            "toml": {
              "options": {
                "from": "toml"
              }
            },
            "env": {
              "options": {
                "from": "env"
              }
            }
          }
        }
      ],
      "outputs": [
        {
          "id": "format-json",
          "label": "JSON 결과",
          "type": "json"
        },
        {
          "id": "format-yaml",
          "label": "YAML 결과",
          "type": "yaml"
        },
        {
          "id": "format-xml",
          "label": "XML 결과",
          "type": "xml"
        },
        {
          "id": "format-csv",
          "label": "CSV 결과",
          "type": "csv"
        },
        {
          "id": "format-toml",
          "label": "TOML 결과",
          "type": "toml"
        },
        {
          "id": "format-env",
          "label": "ENV 결과",
          "type": "env"
        }
      ]
    },
    "module": "./tools/dataformat.js",
    "externalLibrary": false
  },
  {
    "id": "json-lines",
    "cat": "데이터 포맷 변환",
    "name": "JSON Lines / NDJSON 변환",
    "desc": "JSON·NDJSON·CSV·YAML 레코드를 변환하고 큰 NDJSON 파일을 줄 단위로 검사해 다운로드합니다.",
    "keywords": "json lines jsonl ndjson newline delimited csv yaml streaming 대용량 줄 변환",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "JSON Lines 데이터",
          "accepts": [
            "json",
            "ndjson",
            "csv",
            "yaml"
          ],
          "optionsByType": {
            "json": {
              "options": {
                "from": "json"
              }
            },
            "ndjson": {
              "options": {
                "from": "ndjson"
              }
            },
            "csv": {
              "options": {
                "from": "csv"
              }
            },
            "yaml": {
              "options": {
                "from": "yaml"
              }
            }
          }
        }
      ],
      "outputs": [
        {
          "id": "json-lines-json",
          "label": "JSON 결과",
          "type": "json"
        },
        {
          "id": "json-lines-ndjson",
          "label": "NDJSON 결과",
          "type": "ndjson"
        },
        {
          "id": "json-lines-csv",
          "label": "CSV 결과",
          "type": "csv"
        },
        {
          "id": "json-lines-yaml",
          "label": "YAML 결과",
          "type": "yaml"
        }
      ]
    },
    "module": "./tools/dataformat.js",
    "externalLibrary": false
  },
  {
    "id": "list-convert",
    "cat": "데이터 포맷 변환",
    "name": "리스트 변환기",
    "desc": "리스트의 구분자 변경, 정렬, 중복 제거, 감싸기(quote) 등을 수행합니다.",
    "keywords": "list sort unique dedupe join split",
    "module": "./tools/dataformat.js",
    "externalLibrary": false
  },
  {
    "id": "table-convert",
    "cat": "데이터 포맷 변환",
    "name": "To/From 테이블 변환",
    "desc": "CSV/TSV 데이터를 Markdown, HTML, ASCII 표로 변환하거나 Markdown 표를 CSV로 되돌립니다.",
    "keywords": "markdown table html ascii",
    "module": "./tools/dataformat.js",
    "externalLibrary": false
  },
  {
    "id": "color-convert",
    "cat": "데이터 포맷 변환",
    "name": "색상 변환기",
    "desc": "HEX, RGB, HSL, CMYK 형식 간 색상을 변환하고 미리보기를 제공합니다.",
    "keywords": "color hex rgb hsl cmyk",
    "module": "./tools/dataformat.js",
    "externalLibrary": false
  },
  {
    "id": "data-unit",
    "cat": "데이터 포맷 변환",
    "name": "데이터 단위 변환기",
    "desc": "바이트, KB/KiB, MB/MiB 등 데이터 크기 단위를 변환합니다.",
    "keywords": "byte kb mb gb kib mib size",
    "module": "./tools/dataformat.js",
    "externalLibrary": false
  },
  {
    "id": "ip-format",
    "cat": "데이터 포맷 변환",
    "name": "IP 주소 형식 변환",
    "desc": "IPv4 주소를 10진수, 16진수, 2진수, IPv6 매핑, 6to4 등 다양한 형식으로 변환합니다.",
    "keywords": "ip decimal hex 6to4 mapped",
    "module": "./tools/dataformat.js",
    "externalLibrary": false
  },
  {
    "id": "color-contrast",
    "cat": "데이터 포맷 변환",
    "name": "색상 대비 검사기 (WCAG)",
    "desc": "글자색과 배경색의 명암 대비율을 계산하고 WCAG 접근성 기준 통과 여부를 확인합니다.",
    "keywords": "contrast wcag accessibility a11y color ratio 접근성 대비",
    "module": "./tools/dataformat.js",
    "externalLibrary": false
  },
  {
    "id": "json-format",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "JSON 포맷/압축/트리 뷰어",
    "desc": "JSON을 정렬(pretty print), 압축(minify)하거나 접을 수 있는 트리로 표시합니다.",
    "keywords": "json pretty prettify beautify minify tree viewer formatter",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "JSON",
          "accepts": [
            "json"
          ]
        }
      ],
      "outputs": [
        {
          "id": "json",
          "label": "JSON 결과",
          "type": "json",
          "targets": [
            "data-convert",
            "json-schema"
          ]
        }
      ]
    },
    "module": "./tools/devfmt-format.js",
    "externalLibrary": false
  },
  {
    "id": "code-format",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "XML/CSS/JS/HTML/SQL/YAML 포맷터",
    "desc": "각종 코드를 정렬(beautify)하거나 압축(minify)합니다.",
    "keywords": "beautify minify format pretty",
    "module": "./tools/devfmt-format.js",
    "externalLibrary": false
  },
  {
    "id": "syntax-highlight",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "구문 강조 (Syntax Highlighter)",
    "desc": "22개 언어의 코드를 자체 토크나이저와 밝은/어두운 테마로 강조합니다.",
    "keywords": "highlight code color",
    "module": "./tools/devfmt-format.js",
    "externalLibrary": false
  },
  {
    "id": "markdown-html",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "Markdown → HTML 변환기",
    "desc": "CommonMark·GFM의 주요 Markdown 문법을 자체 파서로 HTML 코드로 변환하고 렌더링 미리보기를 제공합니다.",
    "keywords": "markdown md html preview",
    "module": "./tools/devfmt-format.js",
    "externalLibrary": false
  },
  {
    "id": "markdown-toc",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "Markdown 목차 생성기",
    "desc": "Markdown 헤딩을 분석해 GitHub 스타일 앵커가 적용된 목차를 생성합니다.",
    "keywords": "markdown md toc table of contents heading anchor slug 목차 헤딩 앵커 번호",
    "module": "./tools/devfmt-format.js",
    "externalLibrary": false
  },
  {
    "id": "html-strip",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "HTML 렌더링 / 태그 제거",
    "desc": "HTML을 안전한 샌드박스에서 렌더링해 보거나, 태그를 제거해 순수 텍스트만 추출합니다.",
    "keywords": "html strip tags render sandbox",
    "module": "./tools/devfmt-format.js",
    "externalLibrary": false
  },
  {
    "id": "hex-viewer",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "Hex 뷰어 (파일 덤프)",
    "desc": "파일이나 텍스트를 16진수 덤프(xxd 형식)로 보고, 매직 넘버로 파일 형식을 판별합니다.",
    "keywords": "hex dump viewer binary magic number file type xxd signature",
    "module": "./tools/devfmt-format.js",
    "externalLibrary": false
  },
  {
    "id": "curl-fetch",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "cURL ↔ fetch 변환기",
    "desc": "cURL 명령과 브라우저 JavaScript fetch 코드를 서로 변환합니다.",
    "keywords": "curl fetch api http request convert 변환 요청",
    "module": "./tools/devfmt-convert.js",
    "externalLibrary": false
  },
  {
    "id": "sql-insert-convert",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "SQL INSERT ↔ JSON/CSV 변환기",
    "desc": "다중 행 SQL INSERT의 VALUES 데이터를 JSON·CSV와 상호 변환합니다.",
    "keywords": "sql insert json csv values convert mysql postgresql sqlite 변환",
    "module": "./tools/devfmt-convert.js",
    "externalLibrary": false
  },
  {
    "id": "docker-convert",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "docker run ↔ docker-compose 변환",
    "desc": "docker run 명령을 docker-compose.yml로, 또는 그 반대로 변환합니다.",
    "keywords": "docker compose container",
    "module": "./tools/devfmt-convert.js",
    "externalLibrary": false
  },
  {
    "id": "json-diff",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "JSON Diff (구조 비교)",
    "desc": "두 JSON의 구조적 차이(추가/삭제/변경된 경로)를 비교합니다.",
    "keywords": "json compare diff",
    "module": "./tools/devfmt-diff.js",
    "externalLibrary": false
  },
  {
    "id": "text-diff",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "텍스트 Diff (라인 비교)",
    "desc": "두 텍스트의 차이를 비교하고 통합 diff 파일로 내려받습니다.",
    "keywords": "diff compare text patch unified whitespace difference 비교 공백",
    "module": "./tools/devfmt-diff.js",
    "externalLibrary": false
  },
  {
    "id": "regex-tester",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "정규식 테스터 + 치트시트",
    "desc": "정규식을 실시간으로 테스트하고 검색 가능한 JavaScript 정규식 치트시트를 제공합니다.",
    "keywords": "regex regexp pattern match replace cheat sheet reference 문법 치트시트 정규표현식",
    "module": "./tools/devfmt-diff.js",
    "externalLibrary": false
  },
  {
    "id": "crontab",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "Crontab 표현식 생성/설명",
    "desc": "cron 표현식을 설명하고 선택한 시간대의 다음 실행 시각 5회를 계산합니다.",
    "keywords": "cron crontab schedule expression job scheduler timezone next run DST",
    "module": "./tools/devfmt-reference.js",
    "externalLibrary": false
  },
  {
    "id": "chmod",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "chmod 계산기",
    "desc": "권한 체크박스, 8진수, 심볼릭(rwxr-xr--) 표기를 상호 변환합니다.",
    "keywords": "chmod permission unix 755",
    "module": "./tools/devfmt-reference.js",
    "externalLibrary": false
  },
  {
    "id": "git-cheatsheet",
    "cat": "코드 포맷팅 / 개발 유틸리티",
    "name": "Git 치트시트",
    "desc": "자주 쓰는 Git 명령어 모음입니다.",
    "keywords": "git cheat sheet command",
    "module": "./tools/devfmt-reference.js",
    "externalLibrary": false
  },
  {
    "id": "case-convert",
    "cat": "문자열 / 텍스트",
    "name": "대소문자 변환",
    "desc": "camelCase, snake_case, kebab-case, PascalCase 등으로 변환합니다.",
    "keywords": "camel snake kebab pascal case",
    "module": "./tools/stringtools.js",
    "externalLibrary": false
  },
  {
    "id": "obfuscator",
    "cat": "문자열 / 텍스트",
    "name": "문자열 난독화",
    "desc": "텍스트를 눈으로는 비슷하지만 다른 문자로 바꾸거나(호모글리프), 제로폭 문자 삽입, 전각, 리트 표기 등으로 난독화합니다.",
    "keywords": "obfuscate homoglyph zero width leet",
    "module": "./tools/stringtools.js",
    "externalLibrary": false
  },
  {
    "id": "slugify",
    "cat": "문자열 / 텍스트",
    "name": "Slugify (URL 슬러그)",
    "desc": "제목을 URL에 쓸 수 있는 슬러그로 변환합니다.",
    "keywords": "slug url seo",
    "module": "./tools/stringtools.js",
    "externalLibrary": false
  },
  {
    "id": "text-stats",
    "cat": "문자열 / 텍스트",
    "name": "텍스트 통계",
    "desc": "글자 수, 단어 수, 줄 수, 바이트 수 등 텍스트 통계를 표시합니다.",
    "keywords": "count characters words lines statistics",
    "module": "./tools/stringtools.js",
    "externalLibrary": false
  },
  {
    "id": "unicode-inspect",
    "cat": "문자열 / 텍스트",
    "name": "유니코드 문자 분석기",
    "desc": "문자마다 코드포인트, UTF-8/UTF-16 바이트, 종류를 표로 보여줍니다.",
    "keywords": "unicode codepoint inspect utf8 utf16 character 문자 코드포인트 분석 grapheme",
    "module": "./tools/stringtools.js",
    "externalLibrary": false
  },
  {
    "id": "invisible-chars",
    "cat": "문자열 / 텍스트",
    "name": "숨은 문자 탐지 / 정리",
    "desc": "제로폭 문자, BOM, 양방향 서식, 특수 공백, 혼동되는 위장 문자를 찾아내고 제거합니다.",
    "keywords": "zero width zwsp bom nbsp invisible hidden homoglyph bidi trojan source 제로폭 숨은문자 공백 위장",
    "module": "./tools/stringtools.js",
    "externalLibrary": false
  },
  {
    "id": "emoji-picker",
    "cat": "문자열 / 텍스트",
    "name": "이모지 피커",
    "desc": "유니코드 전체 이모지(약 1,900개)를 한국어/영어로 검색하고 클릭해서 복사합니다.",
    "keywords": "emoji picker copy unicode",
    "module": "./tools/stringtools.js",
    "externalLibrary": false
  },
  {
    "id": "ascii-art",
    "cat": "문자열 / 텍스트",
    "name": "ASCII 텍스트 배너 생성기",
    "desc": "영문과 숫자를 큰 ASCII 문자 배너로 변환합니다. (FIGlet)",
    "keywords": "ascii art figlet banner 텍스트 배너 아스키 아트",
    "module": "./tools/stringtools.js",
    "externalLibrary": false
  },
  {
    "id": "hangul-tools",
    "cat": "문자열 / 텍스트",
    "name": "한글 도구 (한/영 변환·초성·로마자)",
    "desc": "한/영 키를 잘못 놓고 친 텍스트 변환(dkssud→안녕), 초성 추출, 로마자 표기, 자모 분해를 제공합니다.",
    "keywords": "hangul korean 한영 오타 변환 초성 로마자 romanize jamo dkssud",
    "module": "./tools/stringtools.js",
    "externalLibrary": false
  },
  {
    "id": "lorem-ipsum",
    "cat": "문자열 / 텍스트",
    "name": "Lorem Ipsum / 한글 더미 텍스트",
    "desc": "레이아웃 확인용 채움 텍스트를 영문(Lorem Ipsum) 또는 한글로 생성합니다.",
    "keywords": "lorem ipsum dummy filler placeholder text 더미 채움",
    "module": "./tools/stringtools.js",
    "externalLibrary": false
  },
  {
    "id": "dummy-data",
    "cat": "문자열 / 텍스트",
    "name": "더미 데이터 생성기 (mock)",
    "desc": "테스트용 가짜 인물 데이터(이름/이메일/전화번호 등)를 JSON, CSV, SQL로 생성합니다.",
    "keywords": "dummy mock fake data json csv sql seed 테스트 데이터",
    "module": "./tools/stringtools.js",
    "externalLibrary": false
  },
  {
    "id": "hash",
    "cat": "해싱",
    "name": "해시 생성 (MD/SHA 전체)",
    "desc": "MD2/MD4/MD5, SHA-0/1/2/3, Keccak-256, RIPEMD160 해시를 한 번에 계산합니다.",
    "keywords": "hash md5 sha1 sha256 sha512 sha3 keccak digest checksum",
    "module": "./tools/hashing.js",
    "externalLibrary": true
  },
  {
    "id": "hash-modern",
    "cat": "해싱",
    "name": "BLAKE2 / BLAKE3 / xxHash 생성",
    "desc": "BLAKE2b, BLAKE2s, BLAKE3, xxHash를 한 번에 계산합니다. 키(keyed hash)를 지원합니다.",
    "keywords": "blake blake2 blake2b blake2s blake3 xxhash xxh64 xxh3 keyed hash digest 해시",
    "module": "./tools/hashing.js",
    "externalLibrary": true
  },
  {
    "id": "hmac",
    "cat": "해싱",
    "name": "HMAC 생성",
    "desc": "비밀 키를 사용한 HMAC 메시지 인증 코드를 생성합니다.",
    "keywords": "hmac mac key",
    "transfer": {
      "outputs": [
        {
          "id": "hash",
          "label": "HMAC 결과",
          "type": "hash",
          "targets": [
            "hash-analyze"
          ]
        }
      ]
    },
    "module": "./tools/hashing.js",
    "externalLibrary": true
  },
  {
    "id": "hash-analyze",
    "cat": "해싱",
    "name": "해시 분석기",
    "desc": "해시 문자열의 형태로 사용된 알고리즘을 추정합니다.",
    "keywords": "hash identify analyze",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "해시 값",
          "accepts": [
            "hash"
          ]
        }
      ]
    },
    "module": "./tools/hashing.js",
    "externalLibrary": true
  },
  {
    "id": "checksum-file",
    "cat": "해싱",
    "name": "파일 해시 (체크섬)",
    "desc": "파일의 체크섬을 계산하고 GNU/BSD 체크섬 목록과 일치하는지 검증합니다.",
    "keywords": "file checksum verify manifest gnu bsd download digest integrity sha md5 검증",
    "module": "./tools/hashing.js",
    "externalLibrary": true
  },
  {
    "id": "checksum-crc",
    "cat": "해싱",
    "name": "체크섬 계산기 (CRC / Adler)",
    "desc": "CRC-8/16/32, CRC-32C, Adler-32 체크섬을 텍스트 또는 파일로 계산합니다.",
    "keywords": "crc crc32 crc16 crc8 adler checksum modbus xmodem ccitt castagnoli",
    "module": "./tools/hashing.js",
    "externalLibrary": true
  },
  {
    "id": "classic-cipher",
    "cat": "암호화 / 복호화",
    "name": "고전 암호 (ROT13 / 카이사르 / 비제네르)",
    "desc": "ROT13, ROT47, 카이사르, 아트바시, 비제네르, 레일 펜스 암호를 적용하거나 해독합니다.",
    "keywords": "rot13 rot47 caesar shift atbash vigenere railfence classic cipher 시저 카이사르 고전암호 치환",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "aes",
    "cat": "암호화 / 복호화",
    "name": "AES 암호화/복호화",
    "desc": "AES-GCM 인증 암호화를 기본으로 제공하며 CBC/CTR 등 레거시 호환 모드도 지원합니다.",
    "keywords": "aes gcm cbc ctr rijndael symmetric authenticated encrypt pbkdf2 openssl",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "des",
    "cat": "암호화 / 복호화",
    "name": "DES 암호화/복호화",
    "desc": "DES 대칭키 암호화 (레거시, 보안 취약).",
    "keywords": "des symmetric",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "tripledes",
    "cat": "암호화 / 복호화",
    "name": "Triple DES 암호화/복호화",
    "desc": "3DES 대칭키 암호화 (레거시, 새 데이터 보호에는 권장하지 않음).",
    "keywords": "3des triple des",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "blowfish",
    "cat": "암호화 / 복호화",
    "name": "Blowfish 암호화/복호화",
    "desc": "Blowfish 대칭키 암호화 (레거시 호환용).",
    "keywords": "blowfish symmetric",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "xor",
    "cat": "암호화 / 복호화",
    "name": "XOR 암호화",
    "desc": "반복 키 XOR 암호화/복호화를 수행합니다.",
    "keywords": "xor cipher",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "xor-brute",
    "cat": "암호화 / 복호화",
    "name": "XOR 브루트포스",
    "desc": "단일 바이트 XOR로 암호화된 데이터를 모든 키(0~255)로 시도합니다.",
    "keywords": "xor brute force crack single byte",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "ec-sign",
    "cat": "암호화 / 복호화",
    "name": "ECDSA / Ed25519 서명·검증",
    "desc": "타원곡선 키를 만들고 메시지에 서명하거나 서명을 검증합니다. P-256/384/521과 Ed25519를 지원합니다.",
    "keywords": "ecdsa ed25519 elliptic curve sign verify keypair p256 p384 p521 eddsa 타원곡선 서명 검증",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "password-hash",
    "cat": "암호화 / 복호화",
    "name": "비밀번호 해시 생성 / 검증",
    "desc": "Argon2, PBKDF2, bcrypt로 비밀번호 해시를 생성하고 검증합니다.",
    "keywords": "password hash pbkdf2 bcrypt argon2 argon2id salt verify 비밀번호 해시 검증",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "otp",
    "cat": "암호화 / 복호화",
    "name": "TOTP / HOTP 생성·검증",
    "desc": "Base32 시크릿으로 일회용 인증 코드를 만들고 otpauth QR 코드를 생성합니다.",
    "keywords": "totp hotp otp authenticator 2fa mfa qr one time password",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "rsa-keygen",
    "cat": "암호화 / 복호화",
    "name": "RSA 키페어 생성",
    "desc": "RSA 개인키/공개키 페어를 PEM 형식으로 생성합니다.",
    "keywords": "rsa key pair generate pem",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "rsa-crypt",
    "cat": "암호화 / 복호화",
    "name": "RSA 암호화/복호화·서명/검증",
    "desc": "RSA 공개키로 암호화(OAEP), 개인키로 복호화하거나 서명/검증합니다.",
    "keywords": "rsa oaep encrypt decrypt sign verify",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "pgp-keygen",
    "cat": "암호화 / 복호화",
    "name": "PGP 키 생성",
    "desc": "이름·이메일로 PGP 키페어를 생성합니다.",
    "keywords": "pgp gpg key generate",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "pgp-crypt",
    "cat": "암호화 / 복호화",
    "name": "PGP 암호화/복호화",
    "desc": "공개키로 메시지를 암호화하거나 개인키로 복호화합니다.",
    "keywords": "pgp gpg encrypt decrypt",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "token-gen",
    "cat": "암호화 / 복호화",
    "name": "토큰 / 시크릿 생성기",
    "desc": "암호학적으로 안전한 랜덤 토큰을 생성합니다.",
    "keywords": "token secret random password generate api key passphrase diceware entropy 패스프레이즈 엔트로피",
    "module": "./tools/cryptotools.js",
    "externalLibrary": true
  },
  {
    "id": "x509-parse",
    "cat": "공개키 / 인증서",
    "name": "X.509 인증서 파싱",
    "desc": "PEM 인증서를 파싱해 주체, 발급자, 유효기간, 확장 등을 표시합니다.",
    "keywords": "x509 certificate ssl tls pem parse",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "PEM 인증서",
          "accepts": [
            "pem"
          ]
        }
      ]
    },
    "module": "./tools/pki.js",
    "externalLibrary": true
  },
  {
    "id": "pkcs10-csr",
    "cat": "공개키 / 인증서",
    "name": "PKCS#10 CSR 생성 / 파싱",
    "desc": "개인키로 인증서 서명 요청(CSR)을 만들거나 CSR의 주체, SAN, 공개키와 자체 서명을 검사합니다.",
    "keywords": "pkcs10 csr certificate signing request create parse san 인증서 서명 요청",
    "transfer": {
      "inputs": [
        {
          "id": "privateKey",
          "label": "개인키 PEM",
          "accepts": [
            "pem"
          ]
        },
        {
          "id": "csr",
          "label": "CSR PEM",
          "accepts": [
            "pem"
          ]
        }
      ],
      "outputs": [
        {
          "id": "csr",
          "label": "CSR PEM",
          "type": "pem"
        }
      ]
    },
    "module": "./tools/pki.js",
    "externalLibrary": true
  },
  {
    "id": "key-cert-match",
    "cat": "공개키 / 인증서",
    "name": "키·CSR·인증서 일치 확인",
    "desc": "개인키나 공개키, CSR, X.509 인증서에서 공개키를 추출해 같은 키 쌍인지 비교합니다.",
    "keywords": "private public key csr certificate match spki fingerprint modulus 키 인증서 일치",
    "transfer": {
      "inputs": [
        {
          "id": "key",
          "label": "개인키 또는 공개키",
          "accepts": [
            "pem"
          ]
        },
        {
          "id": "csr",
          "label": "CSR",
          "accepts": [
            "pem"
          ]
        },
        {
          "id": "certificate",
          "label": "인증서",
          "accepts": [
            "pem"
          ]
        }
      ]
    },
    "module": "./tools/pki.js",
    "externalLibrary": true
  },
  {
    "id": "certificate-chain",
    "cat": "공개키 / 인증서",
    "name": "인증서 체인 / 신뢰 검증",
    "desc": "X.509 체인을 정렬하고 신뢰 앵커·호스트명·제약·서명·CRL과 선택적 AIA/OCSP 상태를 검사합니다.",
    "keywords": "x509 certificate chain trust verify hostname root intermediate aia ocsp crl revocation 인증서 신뢰 검증",
    "externalRequest": {
      "service": "인증서에 기록된 AIA·OCSP·CRL HTTP(S) 서버",
      "sends": "AIA·CRL 조회 요청, OCSP 인증서 식별 정보 및 일반적인 접속 정보(IP 등)",
      "privacy": "“체인 검증”은 입력한 인증서 내용을 외부 서버로 전송하지 않습니다. 민감한 사설 인증서는 온라인 확인 전에 인증서에 기록된 대상 주소를 확인하세요.",
      "cors": true,
      "action": "“온라인 AIA·OCSP·CRL 확인” 버튼"
    },
    "transfer": {
      "inputs": [
        {
          "id": "chain",
          "label": "인증서 체인 PEM",
          "accepts": [
            "pem"
          ]
        },
        {
          "id": "anchors",
          "label": "신뢰 앵커 PEM",
          "accepts": [
            "pem"
          ]
        }
      ]
    },
    "module": "./tools/pki.js",
    "externalLibrary": true
  },
  {
    "id": "asn1-parse",
    "cat": "공개키 / 인증서",
    "name": "ASN.1 Hex 파싱",
    "desc": "ASN.1 DER(Hex 문자열)를 계층 구조로 디코딩합니다.",
    "keywords": "asn1 der parse hex",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "ASN.1 DER",
          "accepts": [
            "asn1",
            "hex",
            "pem"
          ]
        }
      ]
    },
    "module": "./tools/pki.js",
    "externalLibrary": true
  },
  {
    "id": "pem-hex",
    "cat": "공개키 / 인증서",
    "name": "PEM ↔ Hex 변환",
    "desc": "PEM(Base64) 블록과 DER Hex를 상호 변환합니다.",
    "keywords": "pem hex der base64 convert",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "PEM 또는 Hex",
          "accepts": [
            "pem",
            "hex",
            "asn1"
          ]
        }
      ],
      "outputs": [
        {
          "id": "pem",
          "label": "PEM",
          "type": "pem"
        },
        {
          "id": "hex",
          "label": "DER Hex",
          "type": "hex"
        }
      ]
    },
    "module": "./tools/pki.js",
    "externalLibrary": true
  },
  {
    "id": "jwk-pem",
    "cat": "공개키 / 인증서",
    "name": "JWK ↔ PEM 변환",
    "desc": "JWK(JSON Web Key)와 PEM(SPKI/PKCS#8)을 서로 변환하고 RFC 7638 지문(kid)을 계산합니다.",
    "keywords": "jwk pem spki pkcs8 jwt jose kid thumbprint rfc7638 rsa ec ed25519 키 변환",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "JWK 또는 PEM",
          "accepts": [
            "jwk",
            "pem"
          ]
        }
      ],
      "outputs": [
        {
          "id": "pem",
          "label": "PEM",
          "type": "pem"
        },
        {
          "id": "jwk",
          "label": "JWK",
          "type": "jwk"
        }
      ]
    },
    "module": "./tools/pki.js",
    "externalLibrary": true
  },
  {
    "id": "ssh-hostkey",
    "cat": "공개키 / 인증서",
    "name": "SSH 공개키 파싱",
    "desc": "SSH 공개키(authorized_keys 형식)의 타입, 비트, 지문(fingerprint)을 분석합니다.",
    "keywords": "ssh key fingerprint host rsa ed25519",
    "module": "./tools/pki.js",
    "externalLibrary": true
  },
  {
    "id": "privkey-info",
    "cat": "공개키 / 인증서",
    "name": "RSA/EC 개인키 정보",
    "desc": "PEM 개인키에서 알고리즘, 키 크기, 공개키 등의 정보를 추출합니다.",
    "keywords": "private key rsa ec dsa info modulus",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "PEM 개인키",
          "accepts": [
            "pem"
          ]
        }
      ]
    },
    "module": "./tools/pki.js",
    "externalLibrary": true
  },
  {
    "id": "subnet",
    "cat": "네트워크",
    "name": "IPv4 서브넷 계산기",
    "desc": "CIDR 표기로 네트워크 주소, 브로드캐스트, 사용 가능 호스트 범위 등을 계산합니다.",
    "keywords": "subnet cidr netmask network broadcast",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "ipv4-convert",
    "cat": "네트워크",
    "name": "IPv4 주소 변환기",
    "desc": "IPv4를 10진수, 2진수, 16진수 등으로 변환합니다.",
    "keywords": "ipv4 decimal binary hex integer",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "ip-range",
    "cat": "네트워크",
    "name": "IP 대역 ↔ CIDR 변환",
    "desc": "시작-끝 IP 범위를 최소 CIDR 블록들로 변환하거나, CIDR을 주소 목록으로 전개합니다.",
    "keywords": "ip range cidr expand list",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "subnet6",
    "cat": "네트워크",
    "name": "IPv6 서브넷 계산기",
    "desc": "IPv6 CIDR의 네트워크 주소, 주소 범위, 개수, 주소 종류, 역방향 DNS를 계산합니다.",
    "keywords": "ipv6 subnet cidr prefix network range ip6.arpa reverse dns 서브넷",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "ipv6-ula",
    "cat": "네트워크",
    "name": "IPv6 ULA 생성기",
    "desc": "RFC 4193에 따라 고유 로컬 IPv6 주소(ULA) 프리픽스를 생성합니다.",
    "keywords": "ipv6 ula unique local rfc4193",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "mac-format",
    "cat": "네트워크",
    "name": "MAC 주소 포맷/생성",
    "desc": "MAC 주소의 구분자 형식을 변환하거나 랜덤 MAC을 생성합니다.",
    "keywords": "mac address format vendor oui random",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "user-agent",
    "cat": "네트워크",
    "name": "User-Agent 파서",
    "desc": "User-Agent 문자열에서 브라우저, OS, 디바이스 정보를 추출합니다.",
    "keywords": "user agent parse browser os device",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "dns-lookup",
    "cat": "네트워크",
    "name": "DNS over HTTPS 조회",
    "desc": "Cloudflare DoH를 통해 도메인의 DNS 레코드를 조회합니다.",
    "keywords": "dns doh lookup resolve resolver dig nslookup a aaaa mx txt cname",
    "externalRequest": {
      "service": "Cloudflare DNS over HTTPS",
      "sends": "입력한 도메인과 선택한 레코드 타입",
      "privacy": "Cloudflare는 요청 처리 과정에서 접속 IP 등 일반적인 통신 정보를 확인할 수 있습니다. 비공개 내부 도메인이나 민감한 호스트 이름은 입력하지 마세요.",
      "cors": true
    },
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "extract",
    "cat": "네트워크",
    "name": "이메일/URL/IP 추출",
    "desc": "텍스트에서 이메일, URL, 도메인, IP 주소를 추출합니다.",
    "keywords": "extract email url domain ip regex",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "csp-header",
    "cat": "네트워크",
    "name": "CSP 헤더 생성기",
    "desc": "체크박스로 Content-Security-Policy를 구성하고 위험하거나 빠진 지시어를 확인합니다.",
    "keywords": "csp content security policy header 보안 헤더 unsafe-inline unsafe-eval",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "http-status",
    "cat": "네트워크",
    "name": "HTTP 상태 코드 참조",
    "desc": "자주 쓰는 HTTP 상태 코드와 IANA 명칭을 검색합니다.",
    "keywords": "http status code reference 404 500",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "mime-types",
    "cat": "네트워크",
    "name": "MIME 타입 참조",
    "desc": "자주 쓰는 MIME 타입과 파일 확장자를 상호 검색합니다.",
    "keywords": "mime type content-type extension",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "keycode",
    "cat": "네트워크",
    "name": "키코드 뷰어",
    "desc": "키보드 키를 누르면 key, code, keyCode 값을 표시합니다.",
    "keywords": "keycode keyboard event key which",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "device-info",
    "cat": "네트워크",
    "name": "기기 정보 뷰어",
    "desc": "현재 브라우저·화면·시스템 정보를 표시합니다.",
    "keywords": "device screen browser info viewport",
    "module": "./tools/network.js",
    "externalLibrary": false
  },
  {
    "id": "unix-time",
    "cat": "날짜 / 시간",
    "name": "Unix 타임스탬프 변환",
    "desc": "Unix 타임스탬프와 사람이 읽는 날짜를 상호 변환합니다.",
    "keywords": "unix timestamp epoch time convert posix milliseconds seconds",
    "module": "./tools/datetime.js",
    "externalLibrary": false
  },
  {
    "id": "datetime-format",
    "cat": "날짜 / 시간",
    "name": "날짜-시간 형식 변환기",
    "desc": "날짜를 ISO, RFC, 커스텀 등 다양한 포맷으로 변환합니다.",
    "keywords": "date time format iso rfc strftime",
    "module": "./tools/datetime.js",
    "externalLibrary": false
  },
  {
    "id": "filetime",
    "cat": "날짜 / 시간",
    "name": "Windows Filetime 변환",
    "desc": "Windows FILETIME(1601년 기준 100ns 단위)을 변환합니다.",
    "keywords": "filetime windows ldap ntfs timestamp",
    "module": "./tools/datetime.js",
    "externalLibrary": false
  },
  {
    "id": "utc-local",
    "cat": "날짜 / 시간",
    "name": "UTC ↔ 로컬 / 시간대 변환",
    "desc": "한 시각을 여러 시간대(UTC, 서울, 뉴욕 등)로 표시합니다.",
    "keywords": "utc local timezone convert offset",
    "module": "./tools/datetime.js",
    "externalLibrary": false
  },
  {
    "id": "stopwatch",
    "cat": "날짜 / 시간",
    "name": "스톱워치 / 타이머",
    "desc": "스톱워치와 카운트다운 타이머를 제공합니다.",
    "keywords": "stopwatch timer countdown chronometer",
    "module": "./tools/datetime.js",
    "externalLibrary": false
  },
  {
    "id": "date-calc",
    "cat": "날짜 / 시간",
    "name": "날짜 계산기 (D-day / 더하기)",
    "desc": "두 날짜의 차이(D-day, 영업일)를 구하거나 날짜에 일/주/개월/년을 더하고 뺍니다.",
    "keywords": "date calculator dday diff add subtract days between 디데이",
    "module": "./tools/datetime.js",
    "externalLibrary": false
  },
  {
    "id": "qr-generate",
    "cat": "이미지 / 미디어 / QR",
    "name": "QR 코드 생성기",
    "desc": "텍스트나 URL을 QR 코드로 생성하고 PNG로 저장합니다.",
    "keywords": "qr code generate url png",
    "module": "./tools/media.js",
    "externalLibrary": false
  },
  {
    "id": "wifi-qr",
    "cat": "이미지 / 미디어 / QR",
    "name": "WiFi QR 코드 생성기",
    "desc": "WiFi 접속 정보를 QR 코드로 만들어 스캔으로 연결할 수 있게 합니다.",
    "keywords": "wifi qr wireless password ssid",
    "module": "./tools/media.js",
    "externalLibrary": false
  },
  {
    "id": "base64-image",
    "cat": "이미지 / 미디어 / QR",
    "name": "Base64 ↔ 이미지",
    "desc": "이미지를 Base64 데이터 URI로 변환하거나, Data URI를 이미지로 미리보고 저장합니다.",
    "keywords": "base64 image data uri encode decode",
    "transfer": {
      "inputs": [
        {
          "id": "input",
          "label": "Base64 또는 Data URI",
          "accepts": [
            "base64",
            "data-uri"
          ]
        }
      ],
      "outputs": [
        {
          "id": "data-uri",
          "label": "이미지 Data URI",
          "type": "data-uri"
        }
      ]
    },
    "module": "./tools/media.js",
    "externalLibrary": false
  },
  {
    "id": "image-convert",
    "cat": "이미지 / 미디어 / QR",
    "name": "이미지 포맷 변환기",
    "desc": "이미지를 회전·반전·자르기·크기 조절한 뒤 다시 인코딩하고 여러 결과를 ZIP으로 내려받습니다.",
    "keywords": "image convert png jpeg webp gif bmp svg resize crop rotate flip compress quality metadata exif orientation 회전 반전 자르기",
    "module": "./tools/media.js",
    "externalLibrary": false
  },
  {
    "id": "bg-remove",
    "cat": "이미지 / 미디어 / QR",
    "name": "배경 투명화",
    "desc": "단색 배경(로고, 도장, 스캔 이미지 등)을 투명하게 만들어 PNG로 저장합니다.",
    "keywords": "background transparent remove alpha chroma key png",
    "module": "./tools/media.js",
    "externalLibrary": false
  },
  {
    "id": "qr-read",
    "cat": "이미지 / 미디어 / QR",
    "name": "QR 코드 리더",
    "desc": "카메라로 QR·바코드를 실시간 스캔하거나 이미지와 클립보드의 QR 코드를 해독합니다.",
    "keywords": "qr barcode code 128 ean data matrix camera read scan decode reader wifi",
    "module": "./tools/media.js",
    "externalLibrary": false
  },
  {
    "id": "exif-viewer",
    "cat": "이미지 / 미디어 / QR",
    "name": "EXIF 뷰어 / 메타데이터 제거",
    "desc": "사진의 EXIF(촬영 정보, GPS 위치)를 확인하고, 재압축 없이 메타데이터만 제거합니다.",
    "keywords": "exif metadata gps remove strip privacy jpeg png 위치정보",
    "module": "./tools/media.js",
    "externalLibrary": false
  },
  {
    "id": "favicon-gen",
    "cat": "이미지 / 미디어 / QR",
    "name": "파비콘 생성기",
    "desc": "이미지 한 장으로 favicon.ico와 여러 크기의 PNG 파비콘, HTML 태그를 만듭니다.",
    "keywords": "favicon ico png apple touch icon generator site",
    "module": "./tools/media.js",
    "externalLibrary": false
  },
  {
    "id": "image-palette",
    "cat": "이미지 / 미디어 / QR",
    "name": "이미지 색상 팔레트 추출",
    "desc": "이미지에서 대표 색상 팔레트를 추출합니다. (median cut 방식)",
    "keywords": "palette color extract dominant image 색상 추출",
    "module": "./tools/media.js",
    "externalLibrary": false
  },
  {
    "id": "image-ascii-art",
    "cat": "이미지 / 미디어 / QR",
    "name": "이미지 아스키아트 변환기",
    "desc": "이미지의 밝기를 분석해 아스키아트(텍스트 그림)로 바꿉니다. 문자 수(세부 정도), 문자셋, 색상 유지 여부를 조절할 수 있습니다.",
    "keywords": "ascii art image to text 텍스트 아트 아스키 그림 변환기",
    "module": "./tools/media.js",
    "externalLibrary": false
  },
  {
    "id": "statistics",
    "cat": "수학 / 논리 / 랜덤",
    "name": "산술 / 통계 계산",
    "desc": "숫자 목록의 합, 평균, 중앙값, 표준편차 등을 계산합니다.",
    "keywords": "sum average mean median stddev statistics variance",
    "module": "./tools/mathtools.js",
    "externalLibrary": false
  },
  {
    "id": "bitwise",
    "cat": "수학 / 논리 / 랜덤",
    "name": "비트 논리 연산",
    "desc": "AND, OR, XOR, NOT, 시프트, 회전 등 비트 연산을 수행합니다.",
    "keywords": "bitwise and or xor not shift rotate",
    "module": "./tools/mathtools.js",
    "externalLibrary": false
  },
  {
    "id": "math-eval",
    "cat": "수학 / 논리 / 랜덤",
    "name": "수식 계산기",
    "desc": "수학 수식을 계산합니다. sin, cos, sqrt, log, pi 등 함수와 상수를 지원합니다.",
    "keywords": "math calculator evaluate expression formula",
    "module": "./tools/mathtools.js",
    "externalLibrary": false
  },
  {
    "id": "percentage",
    "cat": "수학 / 논리 / 랜덤",
    "name": "퍼센트 계산기",
    "desc": "다양한 퍼센트 계산(비율, 증감률 등)을 수행합니다.",
    "keywords": "percent percentage ratio increase decrease",
    "module": "./tools/mathtools.js",
    "externalLibrary": false
  },
  {
    "id": "unit-converter",
    "cat": "수학 / 논리 / 랜덤",
    "name": "범용 단위 변환기",
    "desc": "길이, 넓이, 무게, 온도, 부피, 속도의 단위를 변환하고 전체 환산표를 표시합니다.",
    "keywords": "단위 변환 길이 넓이 면적 무게 질량 온도 섭씨 화씨 켈빈 부피 속도 unit converter length area weight temperature volume speed",
    "module": "./tools/mathtools.js",
    "externalLibrary": false
  },
  {
    "id": "random-number",
    "cat": "수학 / 논리 / 랜덤",
    "name": "랜덤 숫자 생성기",
    "desc": "지정 범위에서 랜덤한 정수 또는 실수를 생성합니다.",
    "keywords": "random number generate dice",
    "module": "./tools/mathtools.js",
    "externalLibrary": false
  },
  {
    "id": "uuid-generate",
    "cat": "수학 / 논리 / 랜덤",
    "name": "UUID / ULID / NanoID 생성·분석기",
    "desc": "고유 식별자를 생성하거나 UUID·ULID의 메타데이터와 NanoID의 형식을 분석합니다.",
    "keywords": "uuid guid ulid nanoid unique id generate analyze validate timestamp variant entropy random v1 v4 v6 v7",
    "module": "./tools/mathtools.js",
    "externalLibrary": false
  },
  {
    "id": "random-port",
    "cat": "수학 / 논리 / 랜덤",
    "name": "랜덤 포트 생성기",
    "desc": "사용 가능한 범위(1024~65535)에서 랜덤 포트 번호를 생성합니다.",
    "keywords": "random port tcp udp",
    "module": "./tools/mathtools.js",
    "externalLibrary": false
  },
  {
    "id": "gzip",
    "cat": "압축 / 아카이브",
    "name": "Gzip 압축/해제",
    "desc": "Gzip으로 데이터나 파일을 압축하거나 해제합니다.",
    "keywords": "gzip gz compress file",
    "module": "./tools/archive.js",
    "externalLibrary": true
  },
  {
    "id": "raw-deflate",
    "cat": "압축 / 아카이브",
    "name": "Raw Deflate/Inflate",
    "desc": "zlib 헤더 없는 raw deflate/inflate를 수행합니다.",
    "keywords": "deflate inflate raw zlib",
    "module": "./tools/archive.js",
    "externalLibrary": true
  },
  {
    "id": "zlib",
    "cat": "압축 / 아카이브",
    "name": "Zlib 압축/해제",
    "desc": "zlib(deflate) 형식으로 압축하거나 해제합니다.",
    "keywords": "zlib deflate compress",
    "module": "./tools/archive.js",
    "externalLibrary": true
  },
  {
    "id": "lzma",
    "cat": "압축 / 아카이브",
    "name": "LZMA 압축/해제",
    "desc": "LZMA 알고리즘으로 데이터를 압축하거나 해제합니다.",
    "keywords": "lzma xz compress",
    "module": "./tools/archive.js",
    "externalLibrary": true
  },
  {
    "id": "brotli",
    "cat": "압축 / 아카이브",
    "name": "Brotli 압축/해제",
    "desc": "Brotli(.br) 데이터를 품질 레벨을 지정해 압축하거나 해제합니다.",
    "keywords": "brotli br compress decompress web content-encoding 압축 해제 worker",
    "module": "./tools/archive.js",
    "externalLibrary": true
  },
  {
    "id": "zstd",
    "cat": "압축 / 아카이브",
    "name": "Zstandard 압축/해제",
    "desc": "Zstandard(.zst) 데이터를 레벨을 지정해 압축하거나 해제합니다.",
    "keywords": "zstd zstandard zst compress decompress 압축 해제 worker",
    "module": "./tools/archive.js",
    "externalLibrary": true
  },
  {
    "id": "bzip2",
    "cat": "압축 / 아카이브",
    "name": "Bzip2 해제",
    "desc": "Bzip2(.bz2) 데이터를 Worker에서 해제합니다. 압축은 브라우저 비용과 라이선스 문제로 제공하지 않습니다.",
    "keywords": "bzip2 bz2 decompress worker",
    "module": "./tools/archive.js",
    "externalLibrary": true
  },
  {
    "id": "lz4",
    "cat": "압축 / 아카이브",
    "name": "LZ4 압축/해제",
    "desc": "LZ4 블록 포맷으로 압축하거나 해제합니다.",
    "keywords": "lz4 compress fast",
    "module": "./tools/archive.js",
    "externalLibrary": true
  },
  {
    "id": "zip",
    "cat": "압축 / 아카이브",
    "name": "ZIP 생성/해제",
    "desc": "여러 파일을 ZIP으로 묶거나, ZIP 파일의 내용을 나열하고 추출합니다.",
    "keywords": "zip archive unzip compress extract",
    "module": "./tools/archive.js",
    "externalLibrary": true
  },
  {
    "id": "tar",
    "cat": "압축 / 아카이브",
    "name": "Tar 아카이브/해제",
    "desc": "여러 파일을 tar로 묶거나 tar/tar.gz의 내용을 나열합니다.",
    "keywords": "tar archive gzip tgz",
    "module": "./tools/archive.js",
    "externalLibrary": true
  }
]);
