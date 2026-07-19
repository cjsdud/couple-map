# Phase 0 스파이크 결과

상태: **문서 조사 완료 · 실기기 검증 대기** · 최종 업데이트: 2026-07-19

## 요약

| # | 검증 항목 | 방법 | 결과 |
|---|---|---|---|
| 1 | 앱인토스 WebView에서 Supabase 익명 쿼리 | Hello 도화지 페이지 (실기기) | 🟢 문서상 가능 (공식 Supabase 연동 가이드 존재) · 실기기 확인 대기 |
| 2 | 앱인토스 WebView에서 Kakao Local REST | Hello 도화지 페이지 (실기기) | 🟡 문서상 외부 API 호출 가능 · 실기기 확인 대기 |
| 3 | 앱인토스 WebView에서 geolocation 권한 | Hello 도화지 페이지 (실기기) | 🟡 표준 API 대신 **앱인토스 브릿지 API 필요** 가능성 높음 · 실기기 확인 대기 |
| 4 | 앱인토스 로그인 정책 (토스 로그인 강제 여부) | 문서·웹 조사 | 🔴 **토스 로그인 강제 확정** — 카카오 OAuth 정책상 금지 → M0에 매핑 레이어 추가 |

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

## 4. 앱인토스 로그인 정책 조사 (완료, 2026-07-19)

### 결론: 토스 로그인 강제 — 카카오 OAuth는 앱인토스 채널에서 사용 불가 (확신도: 확실)

- 공식 문서: "미니앱에서 로그인 기능은 토스 로그인만 사용할 수 있어요. 자사 로그인이나 다른 간편 로그인 방식은 사용할 수 없어요." — [로그인 소개](https://developers-apps-in-toss.toss.im/login/intro.html)
- 공식 커뮤니티 스태프 답변으로 카카오·구글 OAuth 명시적 불허 확인: [소셜 로그인 불가](https://techchat-apps-in-toss.toss.im/t/topic/3584), [구글 불가](https://techchat-apps-in-toss.toss.im/t/gmail-oauth-api/4378), ["Webview로 자사 웹페이지 이동 기본 불허 + 카카오 로그인 등 외부 소셜 로그인 불허"](https://techchat-apps-in-toss.toss.im/t/topic/3319)
- [비게임 출시 체크리스트](https://developers-apps-in-toss.toss.im/checklist/app-nongame.html)에도 동일 조항.

### 토스 로그인 기술 구조 (M0 매핑 레이어 설계 입력)

- 클라이언트: SDK `appLogin()` → `{ authorizationCode, referrer: 'DEFAULT' | 'SANDBOX' }` (인가 코드 10분 유효, 일회성)
- 서버: Base `https://apps-in-toss-api.toss.im` — **mTLS 인증서 필수** (콘솔에서 발급)
  - `POST .../user/oauth2/generate-token` → accessToken(1h) / refreshToken(14d)
  - `GET .../user/oauth2/login-me` → **`userKey`** (앱 단위 고유 사용자 식별값) + AES-256-GCM 암호화 개인정보
- 매핑 방향: `userKey` ↔ 자체 계정(Supabase auth.users) 매핑 테이블. 토큰 교환은 Supabase Edge Function에서 mTLS 클라이언트 인증으로 수행 → 자체 JWT 발급(Supabase custom auth). 상세 설계는 M0에서.
- 카카오 OAuth는 폐기가 아니라 **채널 분리**: 웹(PWA)·네이티브(v2) 채널의 계정 축으로 유지. 앱인토스 채널만 토스 로그인.

### 조사 중 확인된 추가 사실 (원 계획에 영향)

| 항목 | 내용 | 영향 |
|---|---|---|
| 외부 API 호출 | 공식 [Supabase 연동 가이드](https://developers-apps-in-toss.toss.im/supabase/intro.html) 존재. 미니앱 도메인 `https://<appName>.apps.tossmini.com`(운영) / `.private-apps.tossmini.com`(테스트) — 이 도메인을 Supabase CORS·Auth 허용 목록에 추가 | 🟢 아키텍처 전제 유효. **Vercel URL을 WebView가 직접 로드하는 게 아니라 tossmini.com 도메인에서 서빙**되는 구조 → 검증 항목 ②에 반영 |
| 위치 정보 | 브릿지 API(`getCurrentLocation`/`useGeolocation`) 제공, `granite.config.ts`에 `geolocation` 권한 선언 필요. [커뮤니티에 따르면](https://techchat-apps-in-toss.toss.im/t/topic/4092) 표준 `navigator.geolocation`은 토스 런타임에서 비권장/미동작 가능 | 🟡 스파이크 ③이 샌드박스에서 실패해도 "브릿지로 해결 가능" — 실패 유형 기록이 중요 |
| 패키징 | `@apps-in-toss/web-framework` + `npx ait init`(granite.config.ts) → .ait 번들(≤100MB) 콘솔 업로드. 검수: 앱 등록 1~2영업일, 출시 3~5영업일(문서 간 3일 표기도 있음 — 원 계획의 "1~3개월"보다 훨씬 짧음) | 🟢 일정 리스크 완화 |
| 푸시 | 기능성 메시지 API `POST .../messenger/send-message` (mTLS + `X-Toss-User-Key`=userKey). 광고성은 콘솔 전용. QPM 3,000 | 🟢 M3 알림 전제 유효 (일 3건 자체 상한은 우리 정책대로) |
| **TDS 강제 (신규 리스크)** | 비게임 WebView 미니앱은 **토스 디자인 시스템(TDS, `@toss/tds-mobile`) 적용이 검수 요건** — [WebView 튜토리얼](https://developers-apps-in-toss.toss.im/tutorials/webview.html), [체크리스트](https://developers-apps-in-toss.toss.im/checklist/app-nongame.html) | 🔴 "도화지" 손그림 비주얼 정체성과 충돌 가능. **사용자 결정 필요** (아래 판정 절) |
| 다크패턴 | 진입 즉시 바텀시트·거절 불가 CTA 등 5대 사례 출시 불가 — 기존 계획(M3 점검)과 일치 | 🟢 |
| 연령 | 미니앱은 만 19세 이상 대상 — 스펙 전제와 일치 | 🟢 |

## 판정과 다음 단계

**항목 4 판정: "강제" 케이스 확정.** CLAUDE.md Phase 0 규칙에 따라 tech-design §12-1 매핑 레이어를 M0 범위에 추가했다 (CLAUDE.md M0 절 수정 반영). 이것은 "실패"가 아니라 사전에 정의된 분기이므로 작업 중단 사유는 아님.

**사용자 결정 필요 (진행 전 확인):**

1. **TDS vs 도화지 비주얼**: TDS 적용이 검수 요건이라면 손그림 디자인 언어를 어디까지 유지할 수 있는지 확인 필요. 옵션: (a) 콘텐츠 영역(지도·카드)은 도화지 스타일, 셸(네비게이션·버튼·바텀시트)은 TDS — 절충안, (b) 앱인토스 채널만 TDS 우선, PWA/네이티브에서 도화지 스타일 완전판, (c) 검수 가이드 문의 후 결정.
2. **mTLS 서버 구성**: 토스 로그인 토큰 교환에 mTLS 필수 → Supabase Edge Function에서 클라이언트 인증서 사용 가능 여부를 M0 초기에 확인 (불가 시 Vercel Functions 등 대안).

**항목 1~3은 실기기 검증 대기** — "1~3. Hello 도화지 진단 페이지" 절의 사전 준비(사용자 액션) 완료 후 샌드박스에서 확인. 이때 검증 항목 8가지 상세 목록:

1. 샌드박스 WebView에서 `*.supabase.co` fetch 동작 + 이때 Origin 값 확인 (CORS 설정 확정용)
2. `dapi.kakao.com` fetch 동작 (Kakao 플랫폼 도메인 등록에 tossmini.com 도메인도 필요할 수 있음)
3. `navigator.geolocation` 동작 여부 · 실패 시 다이얼로그 유무 (브릿지 API 필요성 판정)
4. localStorage/쿠키가 미니앱 재진입 시 유지되는지 (Supabase 세션 지속성)
5. `appLogin()` 샌드박스 플로우 (M0에서 mTLS 준비 후)
6. 외부 OAuth 리다이렉트의 기술적 차단 여부 (정책상 이미 불가 — 참고용)
7. `granite.config.ts` 권한 미선언 시 위치 API 에러 형태
8. 출시 검수 기간 실측 (문서 간 3일 vs 3~5영업일 상이)
