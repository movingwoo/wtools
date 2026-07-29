# 보안 응답 헤더 설정

W-Tools 운영 사이트는 GitHub Pages를 원본 서버로 사용하고 Cloudflare 프록시를 거쳐
`https://wtools.movingwoo.com`에서 서비스합니다. Netlify 스타일의 `_headers` 파일은
이 구성에서 응답 헤더로 반영되지 않으므로, 저장소 파일 대신 Cloudflare의
Response Header Transform Rule에서 헤더를 관리합니다.

`index.html`의 CSP `meta` 태그는 정적 호스팅만으로 적용할 수 있는 정책을 담당합니다.
브라우저가 `meta` 전달을 허용하지 않는 `frame-ancestors`는 아래 응답 헤더 CSP가
보완하며, 두 CSP는 브라우저에서 함께 적용됩니다.

## 적용할 헤더

Cloudflare 규칙에서 다음 값을 `Set static`으로 설정합니다.

| 헤더 | 값 | 목적 |
|---|---|---|
| `Content-Security-Policy` | `frame-ancestors 'none'` | 다른 문서가 사이트를 프레임에 삽입하지 못하게 차단 |
| `X-Frame-Options` | `DENY` | 구형 브라우저를 위한 클릭재킹 방어 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 다른 출처로 이동할 때 URL 경로와 쿼리 유출 방지 |
| `Permissions-Policy` | `accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()` | 사이트에서 사용하지 않는 민감한 브라우저 기능 차단 |

다음 헤더는 GitHub Pages/Cloudflare 응답에 이미 포함되어 있습니다. 배포 검증 시 함께
확인하며, 없어질 경우 같은 규칙에 `Set static` 항목으로 추가합니다.

| 헤더 | 현재 값 |
|---|---|
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |

## Cloudflare 설정 절차

1. Cloudflare 대시보드에서 W-Tools 도메인을 선택합니다.
2. **규칙(Rules) → 개요(Overview) → 규칙 만들기(Create rule) → 응답 헤더 변환 규칙(Response Header Transform Rule)** 으로 이동합니다.
3. 규칙 이름을 `W-Tools security headers`로 입력합니다.
4. 사용자 지정 필터 표현식에 다음 조건을 입력합니다.

   ```text
   http.host eq "wtools.movingwoo.com"
   ```

5. **응답 헤더 수정(Modify response header)** 에서 위 네 헤더를 각각
   `Set static`으로 추가합니다. `Add static`은 원본에 같은 이름의 헤더가 있을 때
   중복 값을 만들 수 있으므로 사용하지 않습니다.
6. 규칙을 배포한 뒤 아래 명령으로 운영 응답을 확인합니다.

Cloudflare 화면 명칭이나 위치가 바뀐 경우
[Response Header Transform Rule 공식 절차](https://developers.cloudflare.com/rules/transform/response-header-modification/create-dashboard/)를
기준으로 설정합니다.

## 배포 검증

```bash
curl --head https://wtools.movingwoo.com
```

응답에 아래 항목이 모두 한 번씩 나타나야 합니다.

```text
content-security-policy: frame-ancestors 'none'
x-frame-options: DENY
referrer-policy: strict-origin-when-cross-origin
permissions-policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
strict-transport-security: max-age=15552000; includeSubDomains
x-content-type-options: nosniff
```

브라우저 개발자 도구의 Network 탭에서도 최상위 문서 응답을 확인합니다. 설정 변경 후
Cloudflare 캐시에 이전 응답이 남아 보이면 잠시 기다리거나 해당 URL의 캐시를 제거한 뒤
다시 검사합니다.
