# Changelog

이 프로젝트는 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/) 형식과
[Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

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
