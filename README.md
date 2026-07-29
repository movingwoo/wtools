# W-Tools

W-Tools는 브라우저에서 바로 실행되는 개발자 유틸리티 모음입니다.
모든 처리는 클라이언트에서 이루어지며, 입력 데이터는 서버로 전송되지 않습니다.

다만 네트워크 조회 자체가 핵심인 도구는 예외입니다.
예를 들어 `DNS over HTTPS 조회`는 입력한 도메인을 Cloudflare DoH로 질의하며,
이처럼 외부 통신이 필요한 도구는 이름과 설명에 해당 사실을 명시합니다.

W-Tools는 별도의 빌드 과정이 없는 순수 정적 사이트로,
HTML과 Vanilla JavaScript ES 모듈로 구성되어 있습니다.
서비스 워커를 통해 오프라인 사용을 지원하며 PWA로 설치할 수 있습니다.

링크: [https://wtools.movingwoo.com](https://wtools.movingwoo.com)

## 기능 카테고리

| 카테고리 | 예시 |
|---|---|
| 인코딩 / 디코딩 | Base64, URL, JWT, 모스 부호, 진법 변환 |
| 데이터 포맷 변환 | JSON↔YAML↔XML↔CSV↔TOML↔ENV, JSONPath/JMESPath, JSON Schema, 색상, 단위 |
| 코드 포맷팅 / 개발 유틸 | JSON/SQL/JS 포맷터, Diff, 정규식, Crontab, Docker, cURL↔fetch, SQL INSERT 변환 |
| 문자열 / 텍스트 | 대소문자, Slugify, 통계, 이모지, ASCII 아트 |
| 해싱 | MD/SHA/SHA3, HMAC, 파일 체크섬 |
| 암호화 / 복호화 | AES/DES/Blowfish, RSA, PGP, XOR, 비밀번호 해시, TOTP/HOTP |
| 공개키 / 인증서 | X.509, ASN.1, PEM↔Hex, SSH 키 |
| 네트워크 | 서브넷, CIDR, MAC, DNS, User-Agent |
| 날짜 / 시간 | Unix 타임스탬프, Filetime, 시간대, 스톱워치 |
| 이미지 / 미디어 / QR | QR 생성, WiFi QR, Base64↔이미지, 이미지 포맷·품질·크기 변환 |
| 수학 / 논리 / 랜덤 | 통계, 비트 연산, 수식 계산, 범용 단위 변환, 랜덤 생성 |
| 압축 / 아카이브 | Gzip, Zlib, LZMA, LZ4, Bzip2, Zip, Tar |

## 지원 브라우저

빌드 및 트랜스파일 과정이 없으므로 브라우저가 소스를 그대로 실행합니다.
따라서 사용하는 JavaScript 문법과 Web API가 곧 최소 지원 사양이 됩니다.

| 브라우저 | 최소 버전 |
|---|---|
| Chrome / Edge | 93 (2021-08) |
| Firefox | 92 (2021-09) |
| Safari (macOS / iOS) | 15.4 (2022-03) |

호환성 기준선은 `Object.hasOwn`입니다.
이보다 새로운 문법이나 API는 사용하지 않습니다.
예를 들어 정규식 후방 탐색처럼 오래된 브라우저가 파싱하지 못하는 문법은
정적으로 가져온 모듈 하나에서만 사용해도 사이트 전체의 실행을 중단시킬 수 있습니다.

## 로컬에서 실행

정적 파일로 구성되어 있으므로 원하는 정적 HTTP 서버로 실행할 수 있습니다.
ES 모듈은 `file://` 환경에서 올바르게 동작하지 않으므로 `index.html`을 직접 열지 마십시오.

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000에 접속합니다.
```

## 검사

다음 명령은 외부 패키지 없이 도구 ID와 카테고리, 로컬 모듈 가져오기,
정적 자산 및 서비스 워커 앱 셸을 검사합니다.

```bash
python3 scripts/validate_static.py
```

브라우저 테스트는 별도의 패키지로 분리되어 있으며 Node.js 18 이상이 필요합니다.

```bash
cd tests
npm install
npx playwright install chromium
npx playwright test --project=chromium
```

CI와 동일한 세 브라우저 구성을 검사하려면
`npx playwright install chromium firefox webkit`으로 브라우저를 설치한 뒤
`npx playwright test`를 실행합니다.

GitHub Actions는 모든 PR과 `main` 브랜치 푸시에서 정적 검사, JavaScript 구문 검사,
공백 오류 검사, HTTP 앱 셸 스모크 테스트, Chromium 전체 Playwright 테스트,
Firefox 및 WebKit 핵심 스모크 테스트를 병렬로 실행합니다.

도구가 지연 로드하는 CDN 라이브러리는 로컬 캐시에서 공급되므로
일시적인 CDN 장애가 PR 검사를 중단시키지 않습니다.
실제 CDN 상태는 하루에 한 번 실행되는 Chromium nightly 워크플로에서 확인합니다.

## 구조

```
index.html          진입점 (사이드바 + 콘텐츠 영역)
css/style.css       스타일 (시스템 연동 + 수동 라이트/다크)
js/core.js          도구 등록 프레임워크 + 공통 UI 빌더 + 유틸
js/main.js          해시 기반 라우터 / 사이드바 / 홈 화면
js/theme.js         초기 테마 적용 + 시스템/라이트/다크 전환
js/tools/*.js       카테고리별 도구 구현 (모듈별로 분리)
assets/             아이콘·이미지
manifest.json       PWA 매니페스트 (설치, 아이콘, 테마 색상)
sw.js               서비스워커; 앱 셸 사전 캐시 + network-first 갱신으로 오프라인 지원
tests/              Playwright 브라우저 테스트 (CI 전용, 자체 package.json — 사이트 배포와 무관)
scripts/            의존성 없는 저장소·정적 사이트 검증 스크립트
.github/workflows/  PR·main push 검사(validate)와 하루 한 번 실제 CDN 검증(nightly)
```

jsrsasign, openpgp, pako, figlet처럼 용량이 큰 라이브러리는
해당 도구를 열 때 CDN에서 **지연 로드**하여 초기 로딩 시간을 줄입니다.
crypto-js와 js-yaml 등 핵심 라이브러리만 페이지를 열 때 불러옵니다.

## 새 도구 추가

새 도구는 `js/tools/` 아래의 해당 모듈에서 `tool({...})`을 호출하여 등록합니다.

```js
import { tool, makeIO } from '../core.js';

tool({
  id: 'my-tool', cat: '문자열 / 텍스트', name: '내 도구',
  desc: '설명', keywords: '검색 키워드',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력' }],
      process(text) { return text.toUpperCase(); },
    });
  },
});
```

도구를 등록하면 사이드바, 검색, 라우팅 및 복사 버튼이 자동으로 연결됩니다.

타이머, 네트워크 요청, 관찰자 및 오브젝트 URL처럼 종료 처리가 필요한 리소스를 사용한다면
`render(root)`에서 정리 함수를 반환해야 합니다.
반환된 함수는 다른 라우트로 이동할 때 자동으로 호출됩니다.

`makeIO()`의 `process`가 Promise를 반환하면 처리 상태 표시, 실행 버튼 잠금,
최신 입력의 후속 실행 및 보조 기술 알림이 자동으로 적용됩니다.
