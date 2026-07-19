# 우리의 도화지 — 기술 설계서 v0.1

작성일: 2026-07-19 · 기준: 기능 명세 v0.4 · 대상: v1 (앱인토스 무료 검증)

---

## 0. 설계 전제 (제약 조건)

1. 개발 환경: 모바일 단독. 로컬 데스크톱 없음 → 브라우저 기반 개발 + GitHub + 클라우드 빌드로 전체 파이프라인 구성.
2. 앱인토스 v1 = WebView 방식 (기존 웹 프로젝트를 WebView로 감싸는 공식 경로 존재). React Native(Granite) 방식은 배제 — 웹 코드베이스 하나로 앱인토스·웹·네이티브(v2 Capacitor) 3채널을 커버하기 위함.
3. 운영 인력 1인 → 서버 직접 운영 금지. 관리형(BaaS)만 사용.
4. v1 고정비 0원 목표.

## 1. 아키텍처 개요

```
[사용자 폰]
  ├─ 토스 앱 ▸ 앱인토스 WebView ─┐
  ├─ 모바일 브라우저 (PWA) ──────┼──▶ 웹앱 (React SPA, Vercel 호스팅)
  └─ v2: 네이티브 (Capacitor) ──┘         │
                                          ├─ Supabase Auth (카카오 OAuth)
                                          ├─ Supabase Postgres (+RLS)
                                          ├─ Supabase Storage (사진)
                                          ├─ Supabase Edge Functions (회고 생성 등 배치)
                                          └─ Kakao Local REST (장소 검색·좌표→행정구역)
정적 자산: 시군구 GeoJSON (public/, 공공데이터) — 정복 지도는 SDK 없이 자체 SVG 렌더
```

## 2. 스택 결정

| 레이어 | 선택 | 근거 |
|---|---|---|
| 프론트 | **React 18 + Vite + TypeScript** | 기존 경험(React) 재사용, 앱인토스 WebView·Capacitor 모두 호환, Vite = 빠른 브라우저 기반 개발 |
| 스타일 | Tailwind CSS | 프로토타입 디자인 토큰(도화지 팔레트)을 config로 이식 |
| 상태/데이터 | TanStack Query + Zustand(최소) | 서버 상태 캐싱 중심, 전역 상태 최소화 |
| 백엔드 | **Supabase** (Postgres + Auth + Storage + Edge Functions + RLS) | Express 서버 자체 운영 대비 운영비·관리 부담 0. Postgres 경험 재사용. 무료 티어로 v1 충분 |
| 인증 | Supabase Auth — 카카오 OAuth 기본 | 타깃(20대 커플) 보급률. 채널 이전(앱인토스→네이티브)의 계정 축. 앱인토스 토스 로그인 요구 여부는 §12 확인 항목 — 요구 시 토스 로그인→자체 계정 매핑 레이어 추가 |
| 호스팅 | Vercel (GitHub 연동 자동 배포) | 기존 워크플로우 그대로. 앱인토스 WebView가 Vercel 프로덕션 URL을 로드 |
| 지도 | §3 참조 (3분할 전략) | |
| 배치 작업 | Supabase Edge Functions + pg_cron | 월간 회고 생성(v1.5), 스트릭 집계 |

Express 서버를 두지 않는 이유: 인증·권한·CRUD 전부 Supabase RLS로 처리 가능하고, 1인 모바일 개발에서 별도 서버는 배포·장애 대응 부담만 늘린다. 커스텀 로직은 Edge Function으로 국소 처리.

## 3. 지도 전략 — 핵심 결정: "정복 지도에는 SDK가 필요 없다"

지도 요구사항을 셋으로 분해하면 SDK 의존이 극적으로 줄어든다:

| 요구 | 해법 | SDK 필요? |
|---|---|---|
| ① 전국/서울 정복 지도 (색칠·덧칠·핀 개요) | **자체 SVG 렌더**: 공공 시군구 경계 GeoJSON(229개, 단순화 처리) → SVG path. 도화지 크레용 스타일 100% 자유 구현 (프로토타입의 wobble 필터·빗금 패턴 그대로) | ✕ |
| ② 장소 검색 + 좌표→시군구 판정 | **Kakao Local REST API**: 키워드 장소 검색(`/v2/local/search/keyword`), 좌표→행정구역(`/v2/local/geo/coord2regioncode`) | REST만 |
| ③ 스팟 상세 위치 확인 (동네 줌 레벨) | **Kakao Maps JS SDK** — 핀 상세 바텀시트 안의 미니맵 한정 | 최소 사용 |

이 3분할의 효과: 홈 화면(가장 많이 렌더되는 화면)이 SDK 호출 0회 → 쿼터 소모 최소화, WebView 호환성 리스크 축소, 그리고 표준 지도 룩이 아닌 "도화지" 비주얼 정체성 확보.

### SDK 비교 (조사 기준 2026-07)

| | Kakao | Naver(NCP) | Mapbox |
|---|---|---|---|
| 한국 POI 검색 | 최상 | 상 | 하 (한국 커버리지 약함) |
| 무료 쿼터 | 로컬 API 일 10만, 지도 일 30만, 통합 월 300만 — 단, **개발자 계정당 첫 번째 활성화 앱에만 무료 쿼터 제공 (2026 정책 변경)** | 유료 전환·요금 개편 이력으로 인디에 비용 불확실성 | 월 5만 로드 무료, 초과 과금 |
| 좌표→행정구역 API | 제공 (coord2regioncode) | 제공 | 별도 구현 필요 |
| 결론 | **채택** | 보류 | 보류 (v2 커스텀 스타일 필요 시 재검토) |

주의: 카카오 무료 쿼터가 "계정당 첫 앱" 기준으로 바뀌었으므로, **카카오 개발자 계정에서 이 앱을 첫 번째 지도 활성화 앱으로 등록**할 것 (기존 프로젝트에서 지도 API를 활성화한 적 있는 계정이면 새 계정 분리 검토).

### 시군구 GeoJSON

- 출처: 공공데이터(행정안전부 행정구역 경계) 기반 단순화본. mapshaper 웹 도구(브라우저)로 5~10% 단순화 → 용량 수백 KB 수준으로 압축해 `public/geo/`에 정적 포함.
- 정복 판정: 스팟 저장 시 coord2regioncode로 시군구 코드 저장 → 색칠은 코드 매칭만으로 렌더 (GeoJSON 좌표 연산 불필요).

## 4. DB 스키마 (Postgres)

```sql
-- 사용자·커플
create table profiles (
  user_id uuid primary key references auth.users,
  couple_id uuid references couples,
  nickname text not null,
  created_at timestamptz default now()
);
create table couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  started_at date,                    -- 사귄 날
  day_cutoff smallint default 0,      -- 오늘 마감 시각(0~23시), 커플별 설정
  ratio_a smallint default 50,        -- 부담 비율 (user_a %)
  status text default 'active',       -- active | pending | closed
  created_at timestamptz default now()
);

-- 데이트 기록 (1기록 = 스팟 1~5)
create table records (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples,
  date date not null,
  memo text,
  status text not null default 'visited',  -- visited | planned (회색 핀)
  created_by uuid references profiles(user_id),
  created_at timestamptz default now()
);
create table spots (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records on delete cascade,
  seq smallint not null,              -- 방문 순서 (v3 코스의 원천)
  name text not null,
  lat double precision, lng double precision,
  sigungu_code text,                  -- 정복 판정 키 (coord2regioncode)
  kakao_place_id text
);
create table record_photos (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records on delete cascade,
  storage_path text not null,
  seq smallint default 0
);
create table expenses (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records on delete cascade,
  category text not null check (category in ('meal','cafe','play','move','gift')),
  amount int not null,
  paid_by uuid references profiles(user_id)
);

-- 오늘 (일 단위 참여)
create table daily_entries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples,
  user_id uuid not null references profiles(user_id),
  entry_date date not null,           -- 커플 마감 기준으로 계산된 '그날'
  mood text,
  question_id int references questions(id),
  answer text,
  unique (user_id, entry_date)
);
create table daily_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references daily_entries on delete cascade,
  storage_path text not null,
  lat double precision, lng double precision,   -- 위치 태그(선택) → 핀 승격용
  created_at timestamptz default now()
);

-- 콘텐츠·기타
create table questions (
  id int primary key, stage text not null,      -- early | mid | long
  day_index int not null, text text not null
);
create table anniversaries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples,
  title text not null, date date not null,
  kind text default 'custom'                    -- auto | custom
);
create table sigungu (                          -- 정적 229행 시드
  code text primary key, name text, sido text
);
```

- 정복률 = `count(distinct spots.sigungu_code where records.status='visited') / 229` — 뷰 또는 클라이언트 계산 (커플당 행 수가 작아 실시간 계산으로 충분).
- 잔디 = `daily_entries`에서 (user, entry_date)별 참여 여부: 사진 존재 or mood or answer 중 1+.
- 스트릭 = 둘 다 참여한 날의 연속 — 클라이언트 계산 + 표시용 (조작 무의미, 서버 캐시는 v2 퍼센타일 때 도입).
- `entry_date` 산출: 클라이언트가 `now() - day_cutoff시간`으로 계산해 저장, 서버 트리거로 검증. 마감 변경 익일 적용은 `day_cutoff_next` 컬럼 + 자정 배치로 처리(v1은 단순히 "다음 날부터 적용" 안내 후 즉시 반영도 허용 가능 — 구현 단계 결정).

## 5. 상호 잠금은 RLS로 강제한다 (핵심 보안 설계)

잠금을 클라이언트 로직으로만 구현하면 API 직접 호출로 우회된다. Postgres RLS 정책으로 DB 레벨에서 강제:

```sql
-- 상대의 오늘 사진: 내가 그날 사진을 1장 이상 올렸을 때만 SELECT 허용
create policy "daily_mutual_unlock" on daily_photos for select using (
  entry_id in (select id from daily_entries where user_id = auth.uid())  -- 내 것
  or exists (                                                            -- 상대 것: 내 참여 조건
    select 1 from daily_entries me
    join daily_entries yours on yours.id = daily_photos.entry_id
    where me.user_id = auth.uid()
      and me.couple_id = yours.couple_id
      and me.entry_date = yours.entry_date
      and exists (select 1 from daily_photos p where p.entry_id = me.id)
  )
);
```

- 질문 답변(`daily_entries.answer`)도 동일 패턴: 상대 answer는 내 answer 존재 시에만 노출 (컬럼 분리 뷰 또는 RPC로 처리).
- 기본 원칙: 모든 테이블 `couple_id = 내 couple_id` RLS. 커플 외부에서는 어떤 행도 보이지 않는다.
- Storage 정책: 버킷 경로 `couples/{couple_id}/...` — 경로 기반 RLS 동일 적용.

## 6. 사진 파이프라인

1. 클라이언트: `browser-image-compression`으로 장변 1,600px·WebP 변환 (무료 티어. 구독 v2에서 원본 병행 업로드).
2. 업로드: Supabase Storage `couples/{couple_id}/records/{record_id}/{uuid}.webp` (오늘 사진은 `/daily/{entry_date}/`).
3. DB에 storage_path 기록. 표시용 URL은 signed URL (비공개 버킷).
4. EXIF의 GPS는 업로드 전 클라이언트에서 제거(프라이버시), 위치 태그는 별도 필드로만.
5. 상한 검증: 핀당 10장·일 30장은 클라 + RLS insert 정책(count 서브쿼리) 이중.

## 7. 알림

- v1 (앱인토스): 앱인토스 플랫폼 푸시/알림 SDK 사용 (플랫폼이 푸시·마케팅 채널 제공). 트리거(상대 첫 업로드 등)는 DB 웹훅 → Edge Function → 앱인토스 알림 API. 정확한 API 범위는 §12 확인 항목.
- v2 (네이티브): FCM + Capacitor Push. 트리거 로직은 Edge Function 공유.
- 총량 제한(일 3건)은 `notifications_log` 테이블로 서버에서 강제.

## 8. 개발 워크플로우 (모바일 단독)

```
Claude Code(모바일 앱/웹) 또는 GitHub Codespaces(브라우저 VS Code)
   → GitHub push → GitHub Actions (lint·typecheck·build)
   → Vercel 자동 배포 (preview URL per PR / production)
   → 폰 브라우저에서 preview URL로 즉시 확인
   → 앱인토스: WebView 대상 URL = Vercel production
```

- 앱인토스 공식 문서가 Claude Code 등 AI 도구 기반 개발 가이드를 제공 — 현 워크플로우와 정합.
- 앱인토스 제출물(.ait 번들)·granite CLI 실행이 필요한 단계는 Codespaces 터미널에서 수행.
- 샌드박스 앱 테스트: 폰에 토스 샌드박스 설치 후 진행. 로컬 dev 서버-기기 연결이 같은 네트워크를 전제할 경우 Codespaces 원격과 충돌 가능 → 회피책: Vercel preview URL을 WebView 대상으로 지정해 테스트 (§12 확인 항목).

## 9. 레포 구조

```
dohwaji/
├─ src/
│  ├─ app/            # 라우팅, 레이아웃(3탭 셸)
│  ├─ features/
│  │  ├─ map/         # SVG 정복지도, 핀/클러스터/덧칠, 기록 CRUD
│  │  ├─ today/       # 업로드, 잠금, 질문, 잔디, 스트릭
│  │  ├─ us/          # 디데이, 가계부, 설정
│  │  └─ couple/      # 연결(초대 코드), 온보딩
│  ├─ shared/         # ui(도화지 토큰), lib(supabase, kakao, image)
│  └─ styles/
├─ public/geo/        # 시군구 GeoJSON(단순화), 서울 25구
├─ supabase/
│  ├─ migrations/     # 스키마 SQL
│  └─ seed/           # questions 730, sigungu 229
├─ .github/workflows/ci.yml
└─ docs/              # 기능 명세 v0.4, 본 문서
```

## 10. 비용 (v1)

| 항목 | 플랜 | 월 비용 |
|---|---|---|
| Supabase | Free (DB 500MB, Storage 1GB, Edge Fn) | 0원 |
| Vercel | Hobby | 0원 |
| Kakao API | 무료 쿼터 (첫 앱) | 0원 |
| GeoJSON | 공공데이터 | 0원 |
| 도메인 (선택) | — | ~1만원/년 |

**고정비 0원 시작.** 유료 전환 트리거: Storage 1GB 초과 (압축 300KB 기준 약 3,300장 ≈ 활성 커플 수십 쌍 시점) → Supabase Pro($25) 또는 Storage만 Cloudflare R2 분리($0.015/GB). 이 시점이면 검증 성공 신호이므로 정당한 지출.

## 11. 구현 순서 (v1 내부 마일스톤)

1. **M0 기반**: 레포·CI·Vercel·Supabase 프로젝트, 스키마 마이그레이션, 카카오 OAuth 로그인, 커플 연결(초대 코드).
2. **M1 지도**: GeoJSON 준비, SVG 정복지도 렌더(색칠·덧칠), 기록 CRUD(다스팟·분기·가계부 입력), Kakao 검색·coord2regioncode 연동, 클러스터, 타임라인.
3. **M2 오늘**: 업로드 파이프라인, RLS 상호 잠금, 질문(시드 730), 기분, 잔디·스트릭, 커플별 마감.
4. **M3 우리 + 마감**: 디데이·기념일, 가계부 월간 카드, 설정, 알림 연동, 앱인토스 패키징·샌드박스 테스트 → 검토 요청.

## 12. 리스크 & 앱인토스 확인 필요 항목

| # | 항목 | 리스크 | 대응 |
|---|---|---|---|
| 1 | 앱인토스 로그인 정책 | 토스 로그인 강제 시 카카오 OAuth와 이중화 필요 | 개발자센터 정책 확인 → 강제 시 토스ID↔자체계정 매핑 테이블 |
| 2 | WebView 외부 도메인/API 호출 제한 | Supabase·Kakao REST 호출 차단 가능성 | 커뮤니티 사례상 외부 API 웹뷰 통신 가능 확인됨 — 샌드박스에서 조기 검증 (M0 직후 스파이크 테스트) |
| 3 | WebView 내 위치 권한(GPS) | "지금 여기" 기능 불가 가능성 | 앱인토스 권한 API 확인, 불가 시 장소 검색만으로 v1 |
| 4 | 푸시 API 범위 | 트리거형 개별 푸시 미지원 가능성 | 미지원 시 v1은 인앱 배지만, 푸시는 네이티브 v2로 |
| 5 | 샌드박스 테스트의 로컬 의존 | 모바일 단독 환경과 충돌 | Vercel URL 지정 테스트로 회피 시도, granite CLI는 Codespaces |
| 6 | 카카오 무료 쿼터 "첫 앱" 정책 | 기존 계정에 지도 활성화 이력 시 유료 | 계정 이력 확인, 필요 시 신규 계정 |
| 7 | 검수 기간 1~3개월 | 출시 일정 지연 | M3 완료 즉시 제출, 검수 기간에 v1.5 개발 병행 |

## 13. 미결정 (구현 단계 확정)

1. 마감 변경 "익일 적용"의 구현 방식 (즉시 반영+안내 vs next 컬럼 배치).
2. 서울 25구 GeoJSON 소스 및 단순화 수준.
3. 앱인토스 §12 확인 결과에 따른 로그인·알림 최종 구조.
