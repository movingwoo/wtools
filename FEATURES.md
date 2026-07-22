# 웹 툴 기능 명세

---

## 공통 기능

- 검색창에 붙여넣은 JWT, JSON, URL, Base64, 해시 형식 자동 감지 및 관련 도구 추천
- 도구 화면을 벗어날 때 타이머, 요청, 관찰자, 오브젝트 URL 등 사용 중인 리소스 자동 정리

## 1. 인코딩 / 디코딩

- Base64 인코딩/디코딩 (커스텀 알파벳 지원)
- URL 인코딩/디코딩
- URL 파서 (프로토콜/호스트/쿼리 분해)
- HTML 엔티티 인코딩/디코딩
- Unicode 이스케이프 인코딩/디코딩
- 모스 부호 인코딩/디코딩
- 텍스트 ↔ ASCII 이진수(바이너리) 변환
- 정수(숫자) 진법 변환 (2/8/10/16진 등)
- 로마 숫자 변환
- JWT 인코딩 / 디코딩 / 서명 / 검증

## 2. 데이터 포맷 변환

- JSON ↔ YAML ↔ XML ↔ CSV ↔ TOML ↔ ENV(.env) 상호 변환
- JSONPath / JMESPath 테스터
- JSON Schema 검증 및 샘플 생성
- 리스트 변환기 (구분자 변경, 정렬, 중복 제거 등)
- To/From 테이블 (구분자 기반 표 변환)
- 색상 변환기 (RGB / HSL / HEX / CMYK)
- 색상 대비 검사기 (WCAG 접근성 기준)
- 데이터 단위 변환기 (바이트/KB/MB 등)
- IP 주소 형식 변경 (10진/16진/6to4 등)

## 3. 코드 포맷팅 / 개발 유틸리티

- JSON 포맷/압축/뷰어(트리)
- XML / CSS / JavaScript / HTML / SQL / YAML 포맷/압축
- 구문 강조(Syntax Highlighter)
- JSON Diff (구조 비교)
- 텍스트 Diff (라인 비교)
- 정규식(Regex) 테스터 + 검색·패턴 삽입형 JavaScript 치트시트
- Crontab 표현식 생성/설명기
- Markdown → HTML 변환기
- Markdown 목차 생성기 (헤딩 분석, GitHub 스타일 앵커, 번호 매기기)
- HTML 태그 렌더링 / 제거(Strip)
- Docker run ↔ docker-compose 변환기
- SQL INSERT ↔ JSON/CSV 변환기
- chmod 계산기
- Git 치트시트
- Hex 뷰어 (파일 덤프 / 매직 넘버 형식 판별)
- cURL ↔ fetch 변환기

## 4. 문자열 / 텍스트 유틸리티

- 대소문자 변환 (camelCase, snake_case, kebab-case, PascalCase 등)
- 문자열 난독화(Obfuscator)
- Slugify (URL 슬러그 생성)
- 텍스트 통계 (글자/단어/줄 수 등)
- 이모지 피커/검색 (유니코드 전체 약 1,900개, 한국어/영어 검색)
- ASCII 아트 생성기
- 한글 도구 (한/영 키 오타 변환, 초성 추출, 로마자 표기, 자모 분해)
- Lorem Ipsum / 한글 더미 텍스트 생성기
- 더미 데이터 생성기 (가짜 인물 데이터 → JSON/CSV/SQL)

## 5. 해싱

- MD2 / MD4 / MD5
- SHA0 / SHA1 / SHA2 (224/256/384/512) / SHA3
- HMAC 생성
- 해시 분석기 (알고리즘 추정)
- 파일 해시 (체크섬, 여러 파일 일괄 계산)
- 체크섬 계산기 (CRC-8/16/32, CRC-32C, Adler-32 — 텍스트/파일)

## 6. 암호화 / 복호화

- AES 암호화/복호화
- DES / Triple DES 암호화/복호화
- Blowfish 암호화/복호화
- XOR / XOR 브루트포스
- RSA 키 페어 생성
- RSA 암호화/복호화, 서명/검증
- PGP 암호화/복호화, 서명/검증, 키 생성
- PDF 전자서명 검증
- 토큰(랜덤 시크릿) 생성기
- 비밀번호 해시 생성/검증 (PBKDF2, bcrypt)
- TOTP / HOTP 생성·검증 및 otpauth QR 코드

## 7. 공개키 / 인증서

- X.509 인증서 파싱
- ASN.1 Hex 문자열 파싱
- PEM ↔ Hex 변환
- SSH 호스트 키 파싱
- RSA/DSA 개인키 정보 추출

## 8. 네트워크

- IPv4 서브넷 계산기
- IPv4 주소 변환기 (10진/2진/16진)
- IPv4 대역(range) 전개 및 CIDR ↔ 목록/주소 변환
- IPv6 ULA(고유 로컬 주소) 생성기
- MAC 주소 포맷 변경 / 생성기
- User-Agent 파서
- URI 파싱
- DNS over HTTPS 조회
- 이메일/URL/도메인/IP 주소 추출 (텍스트에서)
- HTTP 상태 코드 참조표
- MIME 타입 참조표
- CSP(Content-Security-Policy) 헤더 생성기 및 위험 지시어 검사
- 키코드(Keycode) 정보 뷰어
- 기기 정보(User Agent/화면 등) 뷰어

## 9. 날짜 / 시간

- 날짜-시간 형식 변환기 (다양한 포맷 상호 변환)
- Unix 타임스탬프 변환
- Windows Filetime 변환
- UTC ↔ 로컬 변환
- 크로노미터(스톱워치/타이머)
- 날짜 계산기 (D-day, 두 날짜 차이, 영업일, 날짜 더하기/빼기)

## 10. 이미지 / 미디어 / QR

- QR 코드 생성기
- WiFi QR 코드 생성기
- QR 코드 리더 (이미지/클립보드 해독)
- Base64 ↔ 이미지 변환
- 이미지 포맷 변환기 (PNG/JPEG/WebP/GIF/BMP/SVG, 품질·비율·최대 크기 조절, 메타데이터 제거, 여러 장 일괄 변환 + 전체 ZIP 다운로드)
- 배경 투명화 (단색 배경 제거 → 투명 PNG)
- EXIF 뷰어 / 메타데이터 제거 (JPEG/PNG, 무손실, 여러 장 일괄 처리 + 제거본 전체 ZIP 다운로드)
- 파비콘 생성기 (favicon.ico + 다중 크기 PNG)
- 이미지 색상 팔레트 추출 (median cut)

## 11. 수학 / 논리 / 랜덤

- 산술 연산 (합/차/곱/나눗셈, 평균, 중앙값, 표준편차)
- 비트 논리 연산 (AND/OR/XOR/NOT), 비트 시프트, 회전
- 수식 계산기(Math Evaluator)
- 퍼센트 계산기
- 랜덤 숫자 생성기
- UUID / ULID / NanoID 생성·분석기 (버전·variant·timestamp·형식·엔트로피)
- 랜덤 포트 생성기

## 12. 압축 / 아카이브

- Gzip 압축/해제 (텍스트 및 파일)
- Bzip2 압축/해제
- Raw Inflate/Deflate
- LZMA 압축/해제
- LZ4 압축/해제
- Zip 압축/해제
- Tar 아카이브/해제
