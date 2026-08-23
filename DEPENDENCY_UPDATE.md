# 의존성 업데이트 체크리스트

외부 라이브러리나 테스트 러너 버전을 올릴 때 다음 항목을 한 변경에서 확인합니다.

- `js/dependencies.js`의 고정 버전, 라이선스, 최신 검토일과 SRI 또는 로컬 SHA-384 갱신
- `index.html`의 SRI·CSP 출처, `tests/cdn-cache.js` 캐시 키, `sw.js` 앱 셸 반영
- 로컬 고정 자산은 `python3 scripts/vendor_dependencies.py --check`로 원본과 변환 해시 검증
- Playwright는 `tests/package*.json`, digest 고정 공식 컨테이너, `validate_static.py` 허용 목록 동시 갱신
- `npm audit --audit-level=high`, Chromium 전체 테스트, Firefox/WebKit 스모크, 실제 CDN nightly 확인
- 관련 공개 표준 벡터와 브라우저 최소 기준에 변경이 없는지 확인
- 라이선스가 달라졌다면 `THIRD_PARTY_NOTICES.md` 갱신

매월 정기 점검은 `.github/workflows/maintenance.yml`이 보안 감사, 새 버전 목록,
고정 자산, 브라우저 기준선과 대표 공개 벡터를 한 번에 요약합니다.
