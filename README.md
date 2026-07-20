# 우리의 도화지 🖍️

한국 20대 커플용 앱 — 지도(시군구 정복·데이트 기록)가 홈, 오늘(상호 잠금 일상 공유)이 리텐션 루프, 우리(디데이·가계부)가 관계 자산. 기획·설계는 `docs/`, 작업 지침은 `CLAUDE.md`.

## 스택

React 18 + Vite + TypeScript + Tailwind v4 + TanStack Query + Supabase(Postgres/RLS/Storage) + Vercel. 지도는 SDK 없이 자체 SVG(시군구 GeoJSON 230개), 장소 검색·행정구역 판정만 Kakao Local REST.

## 처음 여는 사람용 (배포 셋업)

1. **Supabase**: 프로젝트 생성 → SQL Editor에서 `supabase/migrations/0001→0002→0003` 순서대로 실행 → `supabase/seed/sigungu.sql`, `supabase/seed/questions.sql` 실행. Auth → Providers에서 Kakao 활성화(카카오 REST 키·시크릿), Redirect URL 등록.
2. **Kakao Developers**: 앱 등록 → REST API 키 확보, 플랫폼(Web)에 배포 도메인 등록. ⚠️ 무료 쿼터는 계정당 첫 번째 지도 활성화 앱.
3. **Vercel**: 이 레포 연결(자동 배포) + 환경변수 3개(`.env.example` 참조).
4. **앱인토스**(v1 채널): 콘솔 등록 → 샌드박스에서 `#/spike` 진단 페이지로 환경 검증(`docs/spike-result.md`) → 로그인은 토스 로그인 매핑 레이어(M0 후속) 필요.

## 개발

```bash
npm install
npm run dev        # 로컬 개발
npm run lint && npm run typecheck && npm run build   # CI와 동일
```

- 키 없이도 앱 셸이 뜬다(데모 모드). `?mock=1`을 붙이면 지도·타임라인·잔디에 목데이터가 보인다.
- `#/spike` — 앱인토스 WebView 환경 진단 페이지 (Phase 0).
- 상호 잠금 RLS 검증: `scripts/test-rls.mjs` (실 Supabase + 테스트 계정 2개 필요, 파일 상단 사용법 참조).

## 데이터 메모

- 정복 단위 = 시군구 **230개** (2026-07-01 행정구역 개편 반영, `docs/spike-result.md` 참조). 코드 체계는 행안부 법정동코드 앞 5자리, 일반구는 모시(母市)로 정규화(`src/shared/lib/sigunguAlias.ts`).
- `public/geo/sigungu.json` — 행정동 ver20260701 경계를 시군구로 병합·단순화(207KB).
