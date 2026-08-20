# W-Tools

W-Tools는 브라우저에서 바로 실행되는 개발자 유틸리티 모음입니다.  
모든 처리는 클라이언트에서 이루어지며, 입력 데이터는 서버로 전송되지 않습니다.

다만 네트워크 조회 자체가 핵심인 도구는 예외입니다.  
예를 들어 `DNS over HTTPS 조회`는 입력한 도메인을 Cloudflare DoH로 질의합니다.  
이처럼 외부 통신이 필요한 도구는 이름과 설명에 해당 사실을 명시합니다.

W-Tools는 별도의 빌드 과정이 없는 순수 정적 사이트로 HTML과 Vanilla JavaScript ES 모듈로 구성되어 있습니다.  
서비스 워커를 통해 오프라인 사용을 지원하며 PWA로 설치할 수 있습니다.

링크: [https://wtools.movingwoo.com](https://wtools.movingwoo.com)

호환되는 표준 결과는 `다른 도구로 보내기`로 이어서 처리할 수 있습니다.  
전달값은 URL이나 영구 저장소에 기록하지 않고 현재 탭의 메모리에서 한 번만 사용합니다.  
파일 입력 도구는 끌어놓기와 클립보드 파일 붙여넣기를 공통으로 지원합니다.

전체 도구 목록은 [FEATURES.md](FEATURES.md), 릴리즈별 변경 사항은 [CHANGELOG.md](CHANGELOG.md)에서 확인할 수 있습니다.

## 기능 카테고리

| 카테고리 | 예시 |
|---|---|
| 인코딩 / 디코딩 | Base64, URL, JWT 생성·검증, 모스 부호, 진법 변환 |
| 데이터 포맷 변환 | JSON↔YAML↔XML↔CSV↔TOML↔ENV, JSONPath/JMESPath, JSON Schema, 색상, 단위 |
| 코드 포맷팅 / 개발 유틸 | JSON/SQL/JS 포맷터, 통합 Diff, 정규식, 시간대별 Crontab, Docker, cURL↔fetch |
| 문자열 / 텍스트 | 대소문자, Slugify, 통계, 이모지, ASCII 텍스트 배너 |
| 해싱 | MD/SHA/SHA3, HMAC, 파일 체크섬 |
| 암호화 / 복호화 | AES, RSA, PGP, 비밀번호 해시, 토큰·패스프레이즈, TOTP/HOTP |
| 공개키 / 인증서 | X.509, ASN.1, PEM↔Hex, SSH 키 |
| 네트워크 | 서브넷, CIDR, MAC, DNS, User-Agent |
| 날짜 / 시간 | Unix 타임스탬프, Filetime, 시간대, 스톱워치 |
| 이미지 / 미디어 / QR | QR 생성, QR·바코드 카메라 인식, 이미지 포맷·크기·회전·자르기 변환 |
| 수학 / 논리 / 랜덤 | 통계, 비트 연산, 수식 계산, 범용 단위 변환, 랜덤 생성 |
| 압축 / 아카이브 | Gzip, Brotli·Zstandard 압축/해제, Bzip2 해제, LZMA, LZ4, Zip, Tar |

## 지원 브라우저

빌드 및 트랜스파일 과정이 없으므로 브라우저가 소스를 그대로 실행합니다.  
따라서 사용하는 JavaScript 문법과 Web API가 곧 최소 지원 사양이 됩니다.

| 브라우저 | 최소 버전 |
|---|---|
| Chrome / Edge | 110 (2023-02) |
| Firefox | 115 (2023-07) |
| Safari (macOS / iOS) | 16.4 (2023-03) |

이 선에서 정규식 후방 탐색, `structuredClone`, `Array.prototype.findLast`, `toSorted` / `toReversed` / `with`, import maps를 사용할 수 있습니다.  
`Intl.Segmenter`는 Firefox 125부터 지원되므로 사용하는 곳에서는 `typeof` 가드로 감싸 둡니다.

기준선을 넘는 문법은 사용하지 않습니다.  
특히 정규식 후방 탐색처럼 오래된 엔진이 파싱하지 못하는 문법은 정적으로 가져온 모듈 하나에서만 사용해도 사이트 전체의 실행을 중단시킵니다.  
`js/main.js`가 모든 도구 모듈을 정적으로 가져오기 때문입니다.

WebAssembly를 쓰는 기능(비밀번호 해시의 Argon2, BLAKE/xxHash 해시, Zstandard 압축)은 Chrome 97, Firefox 102, Safari 16.4 이상이 필요하며 위 기준선이 이를 포함합니다.

## 로컬에서 실행

정적 파일로 구성되어 있으므로 원하는 정적 HTTP 서버로 실행할 수 있습니다.  
ES 모듈은 `file://` 환경에서 올바르게 동작하지 않으므로 `index.html`을 직접 열지 마세요.

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000에 접속합니다.
```

## 릴리즈 파일

[GitHub Releases](https://github.com/movingwoo/wtools/releases)에는 앞으로 발행되는 릴리즈부터
소스 압축 파일과 별도로 `wtools-vX.Y.Z-static.zip` 정적 호스팅 묶음과 SHA-256 체크섬을
제공합니다. 운영체제와 관계없이 같은 ZIP을 사용할 수 있으며, 압축을 푼 뒤 정적 웹 서버
또는 HTTPS 호스팅에 그대로 배포합니다. 자세한 실행 조건과 무결성 확인 방법은
[STATIC_HOSTING.md](STATIC_HOSTING.md)를 참고하세요.

## 검사

다음 명령은 외부 패키지 없이 도구 ID와 카테고리, 로컬 모듈 가져오기, 정적 자산 및 서비스 워커 앱 셸을 검사합니다.

```bash
python3 scripts/validate_static.py
```

브라우저 테스트는 별도의 패키지로 분리되어 있으며 루트와 `tests/.node-version`에 고정된 Node.js 22(CI와 동일한 버전)가 필요합니다. `tests/.node-version`은 `cd tests` 뒤에도 버전 관리자가 Node 22를 선택하게 하며, 다른 메이저에서는 설치가 즉시 실패합니다. 의존성은 추적되는 `package-lock.json`을 기준으로 설치합니다. CI는 Playwright 버전과 digest가 고정된 공식 컨테이너를 사용해 브라우저와 Linux 의존성을 실행 중에 다시 내려받지 않습니다.

```bash
cd tests
npm ci
npm run test:collect -- --project=chromium
npx playwright install chromium
npx playwright test --project=chromium
```

CI와 동일한 세 브라우저 구성을 검사하려면 `npx playwright install chromium firefox webkit`으로 브라우저를 설치한 뒤 `npx playwright test`를 실행합니다.

GitHub Actions는 모든 PR과 `main` 브랜치 푸시에서 정적 검사, JavaScript 구문 검사, 공백 오류 검사와 HTTP 앱 셸 스모크 테스트를 실행합니다. 브라우저 검사는 하나의 고정된 컨테이너에서 Chromium 전체 테스트와 Firefox 및 WebKit 핵심 스모크 테스트를 순차적으로 실행합니다.

도구가 지연 로드하는 CDN 라이브러리는 로컬 캐시에서 공급되므로 일시적인 CDN 장애가 PR 검사를 중단시키지 않습니다.  
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

jsrsasign, openpgp, pako, figlet처럼 용량이 큰 라이브러리는 해당 도구를 열 때 CDN에서 **지연 로드**하여 초기 로딩 시간을 줄입니다.  
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

타이머, 네트워크 요청, 관찰자 및 오브젝트 URL처럼 종료 처리가 필요한 리소스를 사용한다면 `render(root)`에서 정리 함수를 반환해야 합니다.  
반환된 함수는 다른 라우트로 이동할 때 자동으로 호출됩니다.

`makeIO()`의 `process`가 Promise를 반환하면 처리 상태 표시, 실행 버튼 잠금, 최신 입력의 후속 실행 및 보조 기술 알림이 자동으로 적용됩니다.

## 라이선스

프로젝트 코드는 [MIT License](LICENSE)를 따릅니다.  
저장소에 포함된 EFF 단어 목록의 출처와 별도 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 참고하세요.
