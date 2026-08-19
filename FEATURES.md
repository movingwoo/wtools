# 웹 툴 기능 명세

---

## 공통 기능

- 검색창에 입력한 JWT, JSON, URL, Base64, 해시 형식 자동 감지 및 관련 도구 추천
- 호환되는 표준 결과를 `다른 도구로 보내기`로 연결 (Base64 디코딩·JWT payload → JSON, JSON → 데이터 변환/Schema, HMAC → 해시 분석)
- 전달할 도구가 여러 입력 칸을 지원하면 대상 칸 선택, 전달값은 URL·영구 저장소 없이 현재 탭 메모리에서 일회성 처리
- 모든 파일 입력에 공통 끌어놓기·클립보드 파일 붙여넣기 UI 적용 (accept/다중 선택 준수, 브라우저 내 처리 안내)
- 사용자 입력을 외부로 보내는 도구에 전송 대상·항목·개인정보·CORS 의존성 사전 안내 (현재 Cloudflare DNS over HTTPS 조회)
- 도구 화면을 벗어날 때 타이머, 요청, 관찰자, 오브젝트 URL 등 사용 중인 리소스 자동 정리
- 모바일에서 `/` 단축키로 사이드바 검색 열기
- 존재하지 않는 도구 주소에 오류 안내 및 홈 이동 링크 제공
- 비동기 도구의 처리 상태 표시, 중복 실행 방지 및 보조 기술 알림
- 대용량 텍스트 처리 전 경고 및 지원되는 네트워크 작업의 실제 취소
- 복사 실패 원인 안내와 안전한 대체 복사, 지원되는 비동기 작업 재시도 및 동적 오류 접근성
- 앱 셸 사전 캐시를 통한 홈·기본 도구 오프라인 실행, 새 버전 적용 안내 및 외부 CDN 캐시 자동 갱신
- 사이드바에서 GitHub 저장소 바로가기 제공

## 1. 인코딩 / 디코딩

- Base64 인코딩/디코딩 (커스텀 알파벳 지원)
- Base32 인코딩/디코딩 (RFC 4648 표준·Extended Hex·커스텀 알파벳 지원)
- Base58 인코딩/디코딩 (비트코인·리플·플리커 알파벳, Base58Check 체크섬)
- Base85 인코딩/디코딩 (Ascii85·Adobe·Z85)
- URL 인코딩/디코딩
- URL 파서 (프로토콜/호스트/쿼리 분해)
- Punycode / IDN 변환 (한글 도메인 ↔ xn--, 라벨별 분해)
- HTML 엔티티 인코딩/디코딩
- Quoted-Printable 인코딩/디코딩 (본문 RFC 2045, 헤더 encoded-word RFC 2047)
- Unicode 이스케이프 인코딩/디코딩
- 모스 부호 인코딩/디코딩
- 텍스트 ↔ ASCII 이진수(바이너리) 변환
- 정수(숫자) 진법 변환 (2/8/10/16진 등)
- 로마 숫자 변환
- JWT 인코딩 / 디코딩 / 서명 / 검증 (HS/RS/PS/ES, 서명·클레임 분리 검증, clock skew와 iss/aud/sub 기대값, 보안 경고)

## 2. 데이터 포맷 변환

- JSON ↔ YAML ↔ XML ↔ CSV ↔ TOML ↔ ENV(.env) 상호 변환 (CSV 구분자·헤더 옵션, 표준 따옴표 검증, 빈·중복 헤더 자동 보정)
- JSONPath / JMESPath 테스터
- JSON Schema 검증(Draft 4/6/7/2019-09/2020-12) 및 샘플 생성 (로컬 `$ref`, `required`, `allOf`/`oneOf`, `prefixItems`/`minItems`, `pattern` 반영 후 재검증)
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
- 텍스트 Diff (라인·단어·문자 비교, 공백 차이 무시, 통합 diff 미리보기·다운로드)
- 정규식(Regex) 테스터 + 검색·패턴 삽입형 JavaScript 치트시트
- Crontab 표현식 생성/설명기 (월·요일 이름, 범위·목록·간격, 일·요일 OR 의미, IANA 시간대·DST를 반영한 다음 실행 시각 5회)
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
- 유니코드 문자 분석기 (문자별 코드포인트·UTF-8/UTF-16 바이트·종류, 자소 수)
- 숨은 문자 탐지 / 정리 (제로폭·BOM·양방향 서식·특수 공백·위장 문자 검사 및 제거)
- 이모지 피커/검색 (유니코드 전체 약 1,900개, 한국어/영어 검색)
- ASCII 텍스트 배너 생성기 (FIGlet 글꼴)
- 한글 도구 (한/영 키 오타 변환, 초성 추출, 로마자 표기, 자모 분해)
- Lorem Ipsum / 한글 더미 텍스트 생성기
- 더미 데이터 생성기 (가짜 인물 데이터 → JSON/CSV/SQL)

## 5. 해싱

- MD2 / MD4 / MD5
- SHA0 / SHA1 / SHA2 (224/256/384/512) / SHA3 (FIPS 202) / Keccak-256
- BLAKE2b / BLAKE2s / BLAKE3 / xxHash (키 지정 가능)
- HMAC 생성
- 해시 분석기 (알고리즘 추정)
- 파일 해시 (MD5/SHA 체크섬 일괄 계산, 직접 입력 및 GNU/BSD 체크섬 목록 검증)
- 체크섬 계산기 (CRC-8/16/32, CRC-32C, Adler-32 — 텍스트/파일)

## 6. 암호화 / 복호화

- 고전 암호 (ROT13, ROT47, 카이사르, 아트바시, 비제네르, 레일 펜스)
- AES 암호화/복호화 (AES-GCM 기본, PBKDF2-HMAC-SHA256, 랜덤 salt·IV·128비트 인증 태그, 128/192/256비트 키, 자체 포함 Base64/Hex, OpenSSL·CBC/CTR/CFB/OFB/ECB 레거시 호환)
- DES / Triple DES 암호화/복호화
- Blowfish 암호화/복호화
- XOR / XOR 브루트포스
- RSA 키 페어 생성
- RSA 암호화/복호화 (RSA-OAEP), 서명/검증 (PKCS#1 v1.5)
- ECDSA(P-256/384/521) / Ed25519 키 생성·서명·검증 (raw·DER 서명 형식)
- PGP 암호화/복호화, 서명/검증, 키 생성
- PDF 전자서명 검증
- 토큰(랜덤 시크릿)·EFF 단어 패스프레이즈 생성기 (혼동 문자 제외, 문자군별 최소 개수, 엔트로피 안내)
- 비밀번호 해시 생성/검증 (Argon2id/i/d, PBKDF2, bcrypt)
- TOTP / HOTP 생성·검증 및 otpauth QR 코드

## 7. 공개키 / 인증서

- X.509 인증서 파싱
- ASN.1 Hex 문자열 파싱
- PEM ↔ Hex 변환
- JWK ↔ PEM 변환 (RSA/EC/Ed25519, RFC 7638 지문 계산)
- SSH 호스트 키 파싱
- RSA/DSA 개인키 정보 추출

## 8. 네트워크

- IPv4 서브넷 계산기
- IPv6 서브넷 계산기 (축약/확장 표기, 주소 범위·개수, 주소 종류, ip6.arpa)
- IPv4 주소 변환기 (10진/2진/16진)
- IPv4 대역(range) 전개 및 CIDR ↔ 목록/주소 변환
- IPv6 ULA(고유 로컬 주소) 생성기
- MAC 주소 포맷 변경 / 생성기
- User-Agent 파서
- URI 파싱
- DNS over HTTPS 조회 (Cloudflare 외부 전송·CORS 사전 안내, 진행 중인 요청 취소 지원)
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
- QR/바코드 리더 (실시간 카메라 스캔·카메라 전환/일시정지, 이미지/클립보드 QR 해독, 지원 시 EAN·Code 128·Data Matrix 등)
- Base64 ↔ 이미지 변환
- 이미지 포맷 변환기 (PNG/JPEG/WebP, 단일 프레임 GIF, BMP, PNG 포함 SVG, EXIF 방향 정규화, 회전·좌우/상하 반전·자르기, 공통/파일별 편집 우선순위, 품질·크기·불투명 배경색 조절, 메타데이터 제거, 여러 장 일괄 변환 + 전체 ZIP 다운로드)
- 배경 투명화 (단색 배경 제거 → 투명 PNG)
- EXIF 뷰어 / 메타데이터 제거 (JPEG/PNG, 무손실, 여러 장 일괄 처리 + 제거본 전체 ZIP 다운로드)
- 파비콘 생성기 (favicon.ico + 다중 크기 PNG)
- 이미지 색상 팔레트 추출 (median cut)
- 이미지 아스키아트 변환기 (밝기 기반 문자 매핑, 가로 문자 수·문자셋·반전·색상 유지 조절, TXT/PNG 다운로드)

## 11. 수학 / 논리 / 랜덤

- 산술 연산 (합/차/곱/나눗셈, 평균, 중앙값, 표준편차)
- 비트 논리 연산 (AND/OR/XOR/NOT), 비트 시프트, 회전
- 수식 계산기(Math Evaluator)
- 퍼센트 계산기
- 범용 단위 변환기 (길이·넓이·무게·온도·부피·속도 및 전체 단위 환산표)
- 랜덤 숫자 생성기
- UUID / ULID / NanoID 생성·분석기 (버전·variant·timestamp·형식·엔트로피)
- 랜덤 포트 생성기

## 12. 압축 / 아카이브

- Gzip 압축/해제 (텍스트 및 파일)
- Brotli 압축/해제 (품질 레벨, 텍스트·Base64·Hex 및 파일, Worker 처리)
- Bzip2 해제 (텍스트·Base64·Hex 및 파일, Worker 처리)
- Zstandard 압축/해제 (압축 레벨, 텍스트·Base64·Hex 및 파일, Worker 처리)
- Raw Inflate/Deflate
- LZMA 압축/해제
- LZ4 압축/해제
- Zip 압축/해제
- Tar 아카이브/해제
