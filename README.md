# W-Tools

브라우저에서 바로 실행되는 개발자 유틸리티 모음. 대부분의 처리는 클라이언트(브라우저)에서 이루어지며, 입력 데이터는 서버로 전송되지 않음.

빌드 과정이 없는 순수 정적 사이트(HTML + Vanilla JS ES 모듈). 서비스워커로 오프라인 지원, PWA로 설치 가능.

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
| 수학 / 논리 / 랜덤 | 통계, 비트 연산, 수식 계산, 랜덤 생성 |
| 압축 / 아카이브 | Gzip, Zlib, LZMA, LZ4, Bzip2, Zip, Tar |

## 로컬에서 실행

정적 파일이므로 아무 정적 서버로 실행 (ES 모듈 때문에 `file://` 직접 열기는 불가):

```bash
python3 -m http.server 8000
# http://localhost:8000 접속
```

## 구조

```
index.html          진입점 (사이드바 + 콘텐츠 영역)
css/style.css       스타일 (라이트/다크 자동)
js/core.js          도구 등록 프레임워크 + 공통 UI 빌더 + 유틸
js/main.js          해시 기반 라우터 / 사이드바 / 홈 화면
js/tools/*.js       카테고리별 도구 구현 (모듈별로 분리)
manifest.json       PWA 매니페스트 (설치, 아이콘, 테마 색상)
sw.js               서비스워커; network-first 캐싱으로 오프라인 지원
```

무거운 라이브러리(jsrsasign, openpgp, pako, figlet 등)는 해당 도구를 열 때 CDN에서 **지연 로드**되어 빠른 초기 로딩. 핵심 라이브러리(crypto-js, js-yaml)만 초기에 로드.

## 새 도구 추가

`js/tools/`의 해당 모듈에서 `tool({...})`를 호출:

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

사이드바·검색·라우팅·복사 버튼은 자동으로 연결.
타이머, 요청, 관찰자, 오브젝트 URL처럼 종료가 필요한 리소스를 사용하는 도구는 `render(root)`에서 정리 함수를 반환하면 라우트가 바뀔 때 자동 호출됨.
`makeIO()`의 `process`가 Promise를 반환하면 처리 상태 표시, 실행 버튼 잠금, 최신 입력의 후속 실행, 보조 기술 알림이 자동 적용됨.
