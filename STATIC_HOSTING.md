# W-Tools 정적 호스팅 안내

이 파일이 포함된 ZIP은 W-Tools를 정적 웹 서버에서 실행하기 위한 릴리즈 묶음입니다.
Windows, macOS, Linux와 관계없이 같은 파일을 사용할 수 있습니다.

## 로컬에서 실행

압축을 푼 디렉터리에서 다음 명령을 실행합니다.

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다. ES 모듈과 브라우저 보안 정책 때문에
`index.html`을 `file://` 주소로 직접 열면 정상적으로 동작하지 않습니다.

## 웹 서버에 배포

압축을 푼 디렉터리의 내용을 정적 웹 서버의 원하는 경로에 그대로 올리면 됩니다.
클립보드, 카메라, 서비스 워커와 PWA 기능을 사용하려면 `localhost` 또는 HTTPS로
제공해야 합니다. 운영 환경의 보안 응답 헤더는 웹 서버나 호스팅 서비스에서 별도로
설정해야 합니다.

일부 도구는 처음 사용할 때 버전과 SRI가 고정된 classic script/CSS를 CDN에서 불러옵니다.
동적 ESM/WASM은 릴리즈에 포함된 SHA-384 고정 사본을 사용합니다.
DNS over HTTPS 조회처럼 네트워크 요청 자체가 기능인 도구도 인터넷 연결이 필요합니다.
어떤 입력이 외부로 전송되는지는 해당 도구 화면에서 안내합니다.

## 운영 보안 응답 헤더

운영 HTML에는 다음 응답 헤더를 각각 한 번씩 설정하세요. 카메라를 `camera=()`로
차단하면 QR/바코드 스캔이 동작하지 않습니다.

```text
Content-Security-Policy: frame-ancestors 'none'
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), geolocation=(), microphone=(), payment=(), usb=()
```

Cloudflare JavaScript Detections는 HTML에 `/cdn-cgi/` 부트스트랩을 자동 삽입합니다.
Free 플랜에서는 이 기능을 따로 끌 수 없으며 Bot Fight Mode를 꺼도 삽입될 수 있습니다.
현재 meta CSP는 삽입된 인라인 부트스트랩을 차단하므로 Challenge Platform 스크립트가
요청되거나 실행되지 않습니다. 콘솔의 CSP 차단 메시지를 없애려고 `unsafe-inline`을
추가해서는 안 됩니다. 상위 플랜에서는 JavaScript Detections를 끌 수 있습니다.

배포 뒤 저장소 루트에서 다음 명령으로 누락·중복·잘못된 값을 확인합니다.

```bash
python3 scripts/check_security_headers.py --url https://example.com/
```

## 업데이트와 무결성 확인

새 릴리즈로 갱신할 때는 실행 중인 디렉터리의 파일을 새 ZIP의 내용으로 모두 교체하세요.
GitHub Release에 함께 첨부된 `.sha256` 파일로 다운로드한 ZIP의 SHA-256 체크섬을 확인할
수 있습니다.

```bash
shasum -a 256 -c wtools-vX.Y.Z-static.zip.sha256
```

프로젝트 코드의 라이선스는 `LICENSE`, 포함된 제3자 자료의 고지는
`THIRD_PARTY_NOTICES.md`에서 확인할 수 있습니다.
