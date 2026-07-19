-- 우리의 도화지 — 기본 스키마 (tech-design §4)
-- 원칙: 모든 커플 데이터는 couple_id로 격리하고 RLS로 강제한다 (0002_rls.sql).

-- 커플
create table couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  started_at date,                    -- 사귄 날
  day_cutoff smallint not null default 0
    check (day_cutoff between 0 and 23),  -- '오늘' 마감 시각(시), 커플별 설정
  ratio_a smallint not null default 50
    check (ratio_a between 0 and 100),    -- 부담 비율 (user_a %)
  status text not null default 'pending'  -- pending(한 명만 입장) | active | closed
    check (status in ('pending', 'active', 'closed')),
  created_at timestamptz not null default now()
);

-- 프로필 (auth.users 1:1)
create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  couple_id uuid references couples,
  nickname text not null,
  created_at timestamptz not null default now()
);

-- 데이트 기록 (1기록 = 스팟 1~5, 같은 날)
create table records (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples,
  date date not null,
  memo text,
  status text not null default 'visited'   -- visited | planned(가고 싶어요, 회색 핀)
    check (status in ('visited', 'planned')),
  created_by uuid references profiles(user_id),
  created_at timestamptz not null default now()
);

create table spots (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records on delete cascade,
  seq smallint not null,              -- 방문 순서 (v3 코스 발행의 원천)
  name text not null,
  lat double precision,
  lng double precision,
  sigungu_code text,                  -- 정복 판정 키 (coord2regioncode 앞 5자리 → 일반구는 모시 코드로 정규화)
  kakao_place_id text,
  unique (record_id, seq)
);

create table record_photos (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records on delete cascade,
  storage_path text not null,
  seq smallint not null default 0
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records on delete cascade,
  category text not null check (category in ('meal', 'cafe', 'play', 'move', 'gift')),
  amount int not null check (amount > 0),
  paid_by uuid references profiles(user_id)
);

-- 질문 콘텐츠 (시드 730, 전역 공용 읽기 전용)
create table questions (
  id int primary key,
  stage text not null check (stage in ('early', 'mid', 'long')),  -- D+ 기반 분기
  day_index int not null,
  text text not null
);

-- 오늘 (일 단위 참여)
create table daily_entries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples,
  user_id uuid not null references profiles(user_id),
  entry_date date not null,           -- 커플 마감(day_cutoff) 기준으로 계산된 '그날'
  mood text,
  question_id int references questions(id),
  answer text,
  created_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create table daily_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references daily_entries on delete cascade,
  storage_path text not null,
  lat double precision,               -- 위치 태그(선택) → 핀 승격용. EXIF GPS는 업로드 전 제거
  lng double precision,
  created_at timestamptz not null default now()
);

-- 디데이·기념일
create table anniversaries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples,
  title text not null,
  date date not null,
  kind text not null default 'custom' check (kind in ('auto', 'custom'))
);

-- 정복 단위 시군구 (정적 229행 시드)
create table sigungu (
  code text primary key,              -- 행안부 법정동코드 앞 5자리 (일반구 제외, 모시 기준)
  name text not null,
  sido text not null
);

-- 알림 총량 제한(일 3건) 로그 — M3에서 Edge Function이 기록
create table notifications_log (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples,
  user_id uuid not null references profiles(user_id),
  kind text not null,
  sent_at timestamptz not null default now()
);

-- 조회 패턴 인덱스
create index idx_profiles_couple on profiles (couple_id);
create index idx_records_couple_date on records (couple_id, date desc);
create index idx_spots_record on spots (record_id);
create index idx_spots_sigungu on spots (sigungu_code);
create index idx_record_photos_record on record_photos (record_id);
create index idx_expenses_record on expenses (record_id);
create index idx_daily_entries_couple_date on daily_entries (couple_id, entry_date desc);
create index idx_daily_photos_entry on daily_photos (entry_id);
create index idx_anniversaries_couple on anniversaries (couple_id, date);
create index idx_notifications_log_user_day on notifications_log (user_id, sent_at desc);
