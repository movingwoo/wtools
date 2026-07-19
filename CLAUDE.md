# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

W-Tools: 브라우저에서 실행되는 개발자 유틸리티를 모은 **순수 정적 사이트** (HTML + Vanilla JS ES 모듈). 빌드/번들러/패키지 설치/테스트 스위트가 전혀 없다. 모든 처리는 클라이언트에서 이루어지며 사용자 데이터를 서버로 보내지 않는다(이 원칙 유지). UI 텍스트는 전부 한국어.

## 명령어

```bash
python3 -m http.server 8000   # 로컬 실행 (ES 모듈 때문에 file:// 직접 열기 불가)
```

- 테스트/린트 없음. 검증은 브라우저에서 직접 확인.
- 브라우저 없이 빠른 문법·모듈 해석 검사 (macOS):
  `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc --module-file=js/tools/<파일>.js`
  → `Can't find variable: TextEncoder` 오류만 나오면 정상 (브라우저 전용 API라 예상된 결과).

## 아키텍처

```
index.html      전역 라이브러리(crypto-js→CryptoJS, js-yaml→jsyaml) 로드 + js/main.js
js/core.js      도구 레지스트리 + 공통 UI 빌더 + 유틸 — 핵심 파일
js/main.js      tools/*.js를 import → 해시 라우터(#/tool/<id>) / 사이드바 / 홈 자동 생성
js/tools/*.js   카테고리별 도구 구현 모듈 (파일당 여러 도구)
```

각 도구는 `tool({ id, cat, name, desc, keywords, render(root) })` 호출로 자체 등록된다. `cat` 문자열은 `core.js`의 `categories` 배열과 정확히 일치해야 한다. 사이드바·검색·라우팅은 레지스트리에서 자동 생성되므로 도구 추가 시 다른 파일 수정 불필요. `render()`는 도구를 열 때마다 실행된다.

### core.js 핵심 API

- `makeIO(root, cfg)` — 표준 입력/옵션/버튼/결과창 UI 빌더. 대부분의 도구가 사용.
  - **주의: `inputs`가 1개면 `process(문자열, opts, actionId)`, 여러 개면 `process({id: 값}, ...)`로 인자 형태가 달라진다** (과거 이걸로 버그 발생).
  - `process`에서 throw한 Error는 결과창에 자동 표시. Promise 반환 가능.
  - 기본 autorun(입력마다 실행); `actions` 지정 시 마지막 클릭 버튼 id가 3번째 인자.
  - `runOnLoad: true`면 열자마자 실행, `outputHTML: true`면 결과창이 DOM 노드 수용.
  - 반환값 `{ run, inputEls, optEls, ... }`로 커스텀 UI(색상 표 등)를 끼워 넣을 수 있다.
- `h(tag, attrs, ...kids)` — DOM 헬퍼 (on* 이벤트, style 객체 지원). 파일 업로드 등 비정형 UI는 makeIO 없이 h()로 직접 구성 (예: media.js, archive.js의 파일 도구).
- `loadScript(LIB.x)` / `import('https://cdn.jsdelivr.net/npm/...+esm')` — 무거운 라이브러리는 도구를 열 때 CDN에서 지연 로드. 전역은 CryptoJS, jsyaml뿐.
- 바이트 변환: `strToBytes/bytesToStr/bytesToHex/hexToBytes/bytesToB64/b64ToBytes`, `decodeInput(str, fmt)/encodeOutput(bytes, fmt)` — 재구현하지 말 것.
- `kvTable(rows)` 복사 버튼 달린 키-값 표, `copyBtn`, `download(name, blob)`.

### 컨벤션

- 외부 라이브러리로 해결 안 되는 알고리즘은 파일 내에 직접 구현되어 있다 (hashing.js의 SHA-0·MD2, archive.js의 tar 빌더/파서, media.js의 BMP 인코더 등) — 새 포맷 추가 시 같은 방식 선호.
- 도구 추가/변경 시 `FEATURES.md`의 해당 카테고리 목록을 함께 갱신.
