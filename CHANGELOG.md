# Changelog

이 프로젝트는 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/) 형식과
[Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

## [1.0.1] - 2026-08-09

기존 도구의 정확성과 입력 검증을 보완한 패치 릴리즈입니다.

### 변경됨

- AES-GCM을 기본 권장 방식으로 추가하고 키 크기, 랜덤 IV, salt, 인증 태그를 실제 암호화와 자체 포함 Base64/Hex 왕복에 반영
- AES의 잘못된 키·IV·암호문 오류를 구체화하고 CBC/CTR/ECB 및 DES/3DES/Blowfish의 레거시·비인증 특성을 안내
- Crontab 설명기에 월·요일 이름과 범위·목록·간격 조합을 반영하고, 일과 요일을 함께 제한할 때 일반적인 cron의 OR 의미를 명시
- CSV 변환기에 구분자와 헤더 유무 옵션을 추가하고, 닫히지 않은 따옴표의 줄 번호 및 잘못된 따옴표 구문을 검증
- CSV의 비어 있거나 중복된 헤더와 헤더보다 긴 행을 자동 보정해 모든 열 데이터를 보존
- 이미지 변환기의 GIF 단일 프레임, PNG 포함 SVG, 원본 포맷 재인코딩 동작을 명확히 표시하고 JPEG/GIF/BMP 배경색 선택을 추가

### 테스트

- AES 모드·키 크기·출력 형식별 왕복과 공개 테스트 벡터 추가
- Crontab 일·요일 OR 의미 및 이름·범위·목록·간격 회귀 테스트 추가
- CSV CRLF, 셀 내부 줄바꿈, 따옴표 이스케이프, 빈 마지막 셀과 헤더 보존 테스트 추가
- 이미지 출력 포맷 안내와 투명 픽셀 배경색 합성 테스트 추가

## [1.0.0] - 2026-08-07

첫 정식 릴리즈. 빌드 과정 없는 순수 정적 사이트로, 12개 카테고리에 걸친
개발자 유틸리티를 제공합니다.

### 카테고리

- 인코딩 / 디코딩 (Base64/32/58/85, URL, JWT, 모스 부호, 진법 변환 등)
- 데이터 포맷 변환 (JSON/YAML/XML/CSV/TOML/ENV 상호 변환, JSONPath, JSON Schema 등)
- 코드 포맷팅 / 개발 유틸리티 (포맷터, Diff, 정규식, Crontab, Docker, cURL↔fetch 등)
- 문자열 / 텍스트 유틸리티 (대소문자 변환, 유니코드 분석, 한글 도구 등)
- 해싱 (MD/SHA/SHA3/BLAKE 계열, HMAC, 파일 체크섬 등)
- 암호화 / 복호화 (AES/DES/Blowfish, RSA, ECDSA/Ed25519, PGP, TOTP/HOTP 등)
- 공개키 / 인증서 (X.509, ASN.1, PEM↔Hex, SSH 키 등)
- 네트워크 (서브넷 계산, CIDR, MAC, DNS over HTTPS, User-Agent 파서 등)
- 날짜 / 시간 (Unix 타임스탬프, Filetime, UTC↔로컬, 스톱워치 등)
- 이미지 / 미디어 / QR (QR 생성/리더, 이미지 포맷 변환, EXIF, 파비콘 생성 등)
- 수학 / 논리 / 랜덤 (비트 연산, 수식 계산기, 단위 변환, UUID/ULID/NanoID 등)
- 압축 / 아카이브 (Gzip, Zip, Tar, LZMA, LZ4 등)

### 공통 기능

- 검색창 입력 형식(JWT/JSON/URL/Base64/해시) 자동 감지 및 도구 추천
- 서비스 워커 기반 앱 셸 오프라인 지원 및 PWA 설치
- 라이트/다크 테마, 반응형 UI, 접근성 알림

전체 기능 목록은 [FEATURES.md](FEATURES.md)를 참고하세요.
