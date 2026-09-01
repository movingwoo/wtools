# 웹 툴 기능 명세

---

## 공통 기능

- 검색창에 입력한 JWT, JSON, URL, Base64, 해시 형식 자동 감지 및 관련 도구 추천
- 호환되는 표준 결과를 `다른 도구로 보내기`로 연결 (텍스트/Base64/Hex/PEM/JWK/ASN.1, URL, JSON/NDJSON/YAML/XML/CSV/TOML/ENV, 이미지 Data URI, 해시·체크섬)
- 같은 도구 재전달, 대상 입력 칸과 포맷 옵션 자동 선택, 중앙 형식 검증을 지원하며 전달값은 URL·영구 저장소 없이 현재 탭 메모리에서 일회성 처리
- PEM·JWK처럼 개인키·시크릿일 수 있는 값은 매번 추가 동의 후 전달
- 모든 파일 입력에 공통 끌어놓기·클립보드 파일 붙여넣기 UI 적용 (accept/다중 선택 준수, 브라우저 내 처리 안내)
- 사용자 입력을 외부로 보내는 도구에 전송 대상·항목·개인정보·CORS 의존성 사전 안내 (Cloudflare DNS over HTTPS, 사용자가 명시적으로 실행한 인증서 AIA·OCSP·CRL 조회)
- 도구 화면을 벗어날 때 타이머, 요청, 관찰자, 오브젝트 URL 등 사용 중인 리소스 자동 정리
- 모바일에서 `/` 단축키로 사이드바 검색 열기
- 존재하지 않는 도구 주소에 오류 안내 및 홈 이동 링크 제공
- 비동기 파일·키·아카이브 도구의 처리 상태, 중복 실행 방지, 취소·재시도·라우트 이탈 정리 및 보조 기술 알림
- 공통 파일 개수·단일 크기·총합 예산과 큰 입력의 `그래도 처리` 확인, 도구별 픽셀·압축 해제 예산
- 대용량 텍스트 처리 전 경고 및 지원되는 네트워크 작업의 실제 취소
- 복사 실패 원인 안내와 안전한 대체 복사, 지원되는 비동기 작업 재시도 및 동적 오류 접근성
- 앱 셸 내용 지문 기반 캐시 버전, 홈·직접 도구 URL·navigation fallback 오프라인 실행, 새 버전 적용 안내 및 SHA-384 검증 후 외부 CDN 캐시 갱신
- 도구 메타데이터와 구현 모듈 분리, 도구 진입 시 지연 로드, 모듈 장애 격리·재시도 및 초기 JavaScript 140 KiB 예산
- axe-core WCAG, 320px·200% 확대·키보드·감소 모션·고대비와 라이트/다크 시각 계약 자동 검사
- 동적 ESM/WASM과 하위 자산을 버전·SHA-384·라이선스·사용처 등록부에 고정하고 검토한 로컬 사본으로 실행
- 사이드바에서 GitHub 저장소 바로가기 제공

## 1. 인코딩 / 디코딩

- Base64 인코딩/디코딩 (커스텀 알파벳 지원)
- Base32 인코딩/디코딩 (RFC 4648 표준·Extended Hex·커스텀 알파벳 지원)
- Base58 인코딩/디코딩 (비트코인·리플·플리커 알파벳, Base58Check 체크섬)
- Base85 인코딩/디코딩 (Ascii85·Adobe·Z85)
- URL 인코딩/디코딩
- URL 파서 (프로토콜/호스트/쿼리 분해)
- Punycode / IDN 변환 (UTS #46/IDNA 길이·금지 문자·NFC, 혼합 스크립트 피싱 경고)
- HTML 엔티티 인코딩/디코딩
- Quoted-Printable 인코딩/디코딩 (본문 RFC 2045, 헤더 encoded-word RFC 2047)
- Unicode 이스케이프 인코딩/디코딩
- 모스 부호 인코딩/디코딩
- 텍스트 ↔ ASCII 이진수(바이너리) 변환
- 정수(숫자) 진법 변환 (2/8/10/16진 등)
- 로마 숫자 변환
- JWT 인코딩 / 디코딩 / 서명 / 검증 (HS/RS/PS/ES, 서명·클레임 분리 검증, clock skew와 iss/aud/sub 기대값, 보안 경고)

## 2. 데이터 포맷 변환

- JSON ↔ YAML ↔ XML ↔ CSV ↔ TOML ↔ ENV(.env) 상호 변환 (YAML 1.2 핵심 스키마 기반의 안전한 데이터 하위 범위, 안전한 표준 태그, 앵커·별칭·merge, literal/folded 블록 문자열과 단일 문서 변환, 16 KiB 이상 Worker·취소와 256 KiB 큰 입력 확인; TOML 1.0 날짜·시간, dotted key, 테이블 배열, 기본·리터럴·다중 행 문자열, 64 KiB 이상 Worker·취소; CSV 구분자·헤더 옵션, 표준 따옴표 검증, 빈·중복 헤더 자동 보정)
- JSON Lines/NDJSON ↔ JSON 배열/CSV/YAML 변환 (줄 번호 오류, BOM·CRLF, 텍스트·다운로드, NDJSON·JSON 배열·CSV 파일 512 KiB 청크 파싱, YAML 32 MiB 전체 파싱, 진행률·취소, 지원 브라우저 디스크 직접 저장과 128 MiB 호환 다운로드)
- JSONPath / JMESPath 테스터 (JSONPath는 RFC 9535의 루트·자식·재귀 하강, 이름·와일드카드,
  배열 인덱스·슬라이스·합집합, 존재·비교·논리 필터와 `length`/`count`/`value` 함수를 지원;
  `match`/`search` 정규식 함수, JSONPath Plus의 부모·속성명·타입 선택자와 임의 JavaScript
  평가는 제외; 질의 16,384자·선택자 1만 개·평가 100만 노드·결과 10만 개·UTF-8 입력과
  출력 각각 16 MiB·출력 중첩 256단계 상한, 비유한 숫자·안전 정수 범위 밖 정수·잘못된
  Unicode 거부, 결과별 점진적 예산 적용과 256 KiB 이상 Worker·취소; JMESPath 1.0은
  식별자·인덱스·슬라이스·투영·필터·파이프·논리/비교·다중 선택과 표준 내장 함수 26개를
  지원하고 공식 compliance 결과·오류 벡터 892건 통과, 표현식 65,536자·토큰/AST 각 2만 개·
  중첩 256단계·내장 함수 순회를 포함한 평가 100만 회·UTF-8 입출력과 중간 문자열 각각
  16 MiB 상한, 제한 선검사·점진적 문자열 이스케이프와 256 KiB 이상 Worker·취소)
- JSON Schema 검증(Draft 4/6/7/2019-09/2020-12 핵심 키워드) 및 샘플 생성 (공식 벡터 검증, 로컬 `$ref`, 조합·배열·패턴; 외부 `$ref`와 `$dynamicRef`, `unevaluated*`, `contentSchema`는 명시적으로 거부)
- 리스트 변환기 (구분자 변경, 정렬, 중복 제거 등)
- To/From 테이블 (구분자 기반 표 변환)
- 색상 변환기 (RGB / HSL / HEX / CMYK)
- 색상 대비 검사기 (WCAG 접근성 기준)
- 데이터 단위 변환기 (바이트/KB/MB 등)
- IP 주소 형식 변경 (10진/16진/6to4 등)

## 3. 코드 포맷팅 / 개발 유틸리티

- JSON 포맷/압축/뷰어(트리)
- XML / CSS / JavaScript / HTML / SQL / YAML 포맷/압축 (SQL:2023 공통 DML·DDL, CTE·조인·집합 연산·CASE·윈도 함수; PostgreSQL·MySQL·SQLite 종류 선택과 인용문·주석·연산자·파라미터 보존, MySQL 백슬래시 이스케이프·`ANSI_QUOTES` 설정; 제품별 전체 문법 검사는 제외; SQL·JavaScript·CSS·HTML·YAML 자체 엔진, 2천 자 이상 Worker·취소·4,194,304자 입력 및 16,777,216자 결과 상한)
- 구문 강조 (JavaScript·TypeScript·Python·Java·C·C++·C#·Go·Rust·Kotlin·Swift·PHP·Ruby·SQL·HTML·XML·CSS·JSON·YAML·Bash·Shell·Markdown 자체 토크나이저, 저신뢰 일반 텍스트 처리와 선형 시간 보호를 포함한 자동 감지, 공식 언어 프로필 정기 점검, WCAG AA 밝은/어두운 내부 테마, 큰 입력 승인·취소 및 100만 자 상한)
- JSON Diff (구조 비교)
- 텍스트 Diff (자체 Myers 구현 기반 라인·단어·문자 비교, 공백 차이 무시, 수동 실행·Worker 계산·취소, 통합 diff 미리보기·다운로드)
- 정규식(Regex) 테스터 + 검색·패턴 삽입형 JavaScript 치트시트
- Crontab 표현식 생성/설명기 (월·요일 이름, 범위·목록·간격, 일·요일 OR 의미, IANA 시간대·DST를 반영한 다음 실행 시각 5회)
- Markdown → HTML 변환기 (자체 CommonMark/GFM 주요 문법 파서, 블록·인라인 문법, 표·작업 목록, raw HTML, 링크, 코드 펜스, 중첩 목록, 입력 4,194,304자·구조 10만 개·중첩 64단계 제한, 큰 입력 Worker·취소, sanitizer가 아닌 결과와 샌드박스 미리보기 안내)
- Markdown 목차 생성기 (헤딩 분석, GitHub 스타일 앵커, 번호 매기기)
- HTML 태그 렌더링 / 제거(Strip)
- Docker run ↔ docker-compose 변환기 (Compose 사용자 값을 POSIX 안전 셸 인자로 인용, 구조 검증, 큰 YAML Worker 처리·취소)
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
- 이모지 피커/검색 (로컬 공식 Unicode Emoji·CLDR 데이터 약 1,900개, 한국어/영어 검색)
- ASCII 텍스트 배너 생성기 (자체 FIGfont 엔진, Standard/Big/Small/Slant/Banner/Block/Doom/Ghost/Shadow/Speed 로컬 글꼴)
- 한글 도구 (한/영 키 오타 변환, 초성 추출, 로마자 표기, 자모 분해)
- Lorem Ipsum / 한글 더미 텍스트 생성기
- 더미 데이터 생성기 (가짜 인물 데이터 → JSON/CSV/SQL)

## 5. 해싱

- MD2 / MD4 / MD5 (레거시 호환성 확인용, 보안 용도 비권장)
- SHA0 / SHA1 / SHA2 (224/256/384/512) / SHA3 (FIPS 202) / Keccak-256
- BLAKE2b / BLAKE2s / BLAKE3 / xxHash (키 지정 가능)
- HMAC 생성
- 해시 분석기 (알고리즘 추정)
- 파일 해시 (2 MiB 청크 Worker, 알고리즘별 진행률·취소, MD5/SHA 일괄 계산·전체 복사/다운로드, GNU/BSD 체크섬 목록 검증)
- 체크섬 계산기 (CRC-8/16/32, CRC-32C, Adler-32 — 텍스트/파일)

## 6. 암호화 / 복호화

- 고전 암호 (ROT13, ROT47, 카이사르, 아트바시, 비제네르, 레일 펜스)
- AES 암호화/복호화 (AES-GCM 기본, PBKDF2-HMAC-SHA256, 랜덤 salt·IV·128비트 인증 태그, 128/192/256비트 키, 자체 포함 Base64/Hex, OpenSSL·CBC/CTR/CFB/OFB 호환; ECB 새 암호화는 추가 확인)
- DES / Triple DES 암호화/복호화 (기존 자료 복호화 호환, 새 암호화는 추가 확인)
- Blowfish 암호화/복호화
- XOR / XOR 브루트포스
- RSA 키 페어 생성 (2048/3072/4096비트, 1024비트 생성 차단)
- RSA 암호화/복호화 (RSA-OAEP), 서명/검증 (PKCS#1 v1.5; SHA-1은 기존 서명 검증만)
- ECDSA(P-256/384/521) / Ed25519 키 생성·서명·검증 (raw·DER 서명 형식)
- PGP 암호화/복호화, 서명/검증, 키 생성
- PDF 전자서명 검증
- 토큰(랜덤 시크릿)·EFF 단어 패스프레이즈 생성기 (혼동 문자 제외, 문자군별 최소 개수, 엔트로피 안내)
- 비밀번호 해시 생성/검증 (Argon2id/i/d, PBKDF2, bcrypt)
- TOTP / HOTP 생성·검증 및 otpauth QR 코드

## 7. 공개키 / 인증서

- X.509 인증서 파싱
- PKCS#10 CSR 생성/파싱 (RSA/EC 개인키, Subject·DNS/IP/이메일 SAN, 자체 서명·약한 키/알고리즘 검사, CSR 다운로드)
- 개인키·공개키·CSR·인증서의 SPKI 공개키 및 SHA-256 지문 일치 확인
- 인증서 체인 자동 정렬과 기간·서명·Basic Constraints/keyCertSign·pathLen·DNS Name Constraints 검증, 정렬된 PEM 다운로드
- 사용자 지정 신뢰 앵커 연결, TLS DNS/IP 호스트명·serverAuth 검사, 서명·기간을 검증한 로컬 CRL 폐기 판정
- 사용자가 명시적으로 실행할 때 인증서에 기록된 AIA 중간 인증서를 보완하고 권한·CertID·기간·서명을 검증한 OCSP 및 온라인 CRL 상태 확인 (요청 대상·IP 노출·CORS 사전 안내, OS/브라우저 신뢰 저장소 대신 사용자 지정 앵커 사용)
- ASN.1 Hex 문자열 파싱
- PEM ↔ Hex 변환
- JWK ↔ PEM 변환 (RSA/EC/Ed25519, RFC 7638 지문 계산)
- SSH 호스트 키 파싱
- RSA/EC 개인키 정보 추출

## 8. 네트워크

- IPv4 서브넷 계산기
- IPv6 서브넷 계산기 (축약/확장 표기, 주소 범위·개수, 주소 종류, ip6.arpa)
- IPv4 주소 변환기 (10진/2진/16진)
- IPv4 대역(range) 전개 및 CIDR ↔ 목록/주소 변환
- IPv6 ULA(고유 로컬 주소) 생성기
- MAC 주소 포맷 변경 / 생성기
- User-Agent 파서 (데스크톱·모바일·대표 인앱 브라우저의 브라우저·엔진·OS·기기·CPU 자체 규칙 코퍼스, 분기별 검토일·한계 안내)
- URI 파싱
- DNS over HTTPS 조회 (Cloudflare 외부 전송·CORS 사전 안내, 진행 중인 요청 취소 지원)
- 이메일/URL/도메인/IP 주소 추출 (텍스트에서)
- IANA 등록부 기준으로 분기별 검토하는 자주 쓰는 HTTP 상태 코드 참조표
- IANA 등록 여부와 일반 별칭을 분기별 검토하는 자주 쓰는 MIME 타입 참조표
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

- QR 코드 생성기 (UTF-8 바이트 모드, QR 버전 1~40 자동 선택, L/M/Q/H 오류 복원)
- WiFi QR 코드 생성기 (자체 QR 행렬 생성)
- QR/바코드 리더 (자체 QR 탐지·원근 보정·Reed–Solomon 복호, 실시간 카메라 스캔·카메라 전환/일시정지, 이미지/클립보드 해독, 지원 시 EAN·Code 128·Data Matrix 등)
- Base64 ↔ 이미지 변환
- 이미지 포맷 변환기 (PNG/JPEG/WebP, WebP 실제 형식 검증·미지원 안내, 자체 팔레트 양자화·LZW 단일 프레임 GIF, BMP, PNG 포함 SVG, EXIF 방향 정규화, 회전·반전·자르기, 픽셀 상한, 순차 디코딩·해제, 취소·부분 실패 재시도, 전체 ZIP 다운로드)
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
- Zip 압축/해제 (안전한 경로, CRC-32, 중복 이름, UTF-8, 항목·크기·압축률 상한)
- Tar/USTAR 아카이브/해제 (헤더 체크섬, UTF-8 긴 경로, 안전한 경로, 항목·크기·압축률 상한)
