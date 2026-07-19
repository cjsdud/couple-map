# Phase 0 스파이크 결과

상태: **진행 중** · 최종 업데이트: 2026-07-19

## 요약

| # | 검증 항목 | 방법 | 결과 |
|---|---|---|---|
| 1 | 앱인토스 WebView에서 Supabase 익명 쿼리 | Hello 도화지 페이지 (실기기) | ⏳ 사용자 실기기 검증 대기 |
| 2 | 앱인토스 WebView에서 Kakao Local REST | Hello 도화지 페이지 (실기기) | ⏳ 사용자 실기기 검증 대기 |
| 3 | 앱인토스 WebView에서 geolocation 권한 | Hello 도화지 페이지 (실기기) | ⏳ 사용자 실기기 검증 대기 |
| 4 | 앱인토스 로그인 정책 (토스 로그인 강제 여부) | 문서·웹 조사 | ⏳ 조사 중 (아래 절) |

## 1~3. Hello 도화지 진단 페이지

`src/App.tsx` — 접속 시 3가지 검사를 자동 실행하고 카드로 표시한다.

- ① Supabase: `GET {url}/rest/v1/spike_ping` 익명 fetch. **성공**=쿼리 OK / **부분 성공**=서버 도달했지만 테이블·정책 문제(네트워크 경로 자체는 OK) / **실패**=fetch 자체가 차단.
- ② Kakao: 키워드 검색 + `coord2regioncode`(강남역 좌표 → 시군구 코드) 두 호출 모두 확인. 정복 판정 파이프라인의 핵심 API.
- ③ geolocation: `getCurrentPosition` 권한 요청. 실패 시 "OS 다이얼로그 후 거부"인지 "다이얼로그 없이 즉시 실패"인지가 중요 (후자면 앱인토스 권한 브리지 필요 신호).

검증 절차 (일반 브라우저 → 앱인토스 샌드박스 순서로 두 번):

1. 폰 브라우저에서 Vercel URL 접속 → 3종 결과 캡처 (대조군)
2. 토스 샌드박스 앱의 WebView로 동일 URL 로드 → 3종 결과 캡처
3. 두 캡처를 채팅에 공유 → 이 문서에 결과 기록

### 진단 페이지 사전 준비 (사용자 액션 필요)

- [ ] **Supabase**: 프로젝트 생성 → SQL Editor에서 `supabase/spike/spike_ping.sql` 실행 → Settings→API의 URL·anon key 확보
- [ ] **Kakao Developers**: 앱 등록(⚠️ 무료 쿼터는 계정당 첫 번째 지도 활성화 앱 — 이력 있는 계정이면 신규 계정) → REST API 키 확보, 플랫폼(Web)에 Vercel 도메인 등록
- [ ] **Vercel**: GitHub 레포 연결(이 브랜치 또는 main), 환경변수 3개 설정 (`.env.example` 참조: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_KAKAO_REST_KEY`)
- [ ] **앱인토스 콘솔**: 개발자 등록, 샌드박스 앱 설치, WebView 대상 URL로 Vercel URL 지정

## 4. 앱인토스 로그인 정책 조사

(조사 완료 후 기록)

## 판정과 다음 단계

(모든 항목 확인 후 기록. CLAUDE.md 규칙: 실패 항목이 있으면 작업을 멈추고 사용자와 대안을 결정한다.)
