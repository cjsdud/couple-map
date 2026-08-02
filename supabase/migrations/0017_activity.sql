-- 알림 보관함 (backlog §6, 2026-08-02)
--
-- 미는 알림(푸시)과 쌓이는 기록(보관함)을 나눈다:
-- 커플에게 일어난 일(CUD)은 전부 여기 남고, 푸시는 서버 화이트리스트(api/send-push)의
-- 몇 가지만 나간다. 지난 알림을 놓쳐도 종 아이콘 → 보관함에서 다시 본다.
--
-- 읽음 표시는 서버에 두지 않는다 — 기기별 localStorage로 충분하고(뱃지는 편의 기능),
-- 컬럼을 늘리면 마이그레이션 전 클라이언트가 깨진다 (0016의 교훈).

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples on delete cascade,
  actor_id uuid not null references profiles(user_id) on delete cascade,
  kind text not null check (kind in (
    'record_create', 'record_update', 'record_delete',
    'anniversary_create', 'anniversary_delete',
    'today', 'couple_theme', 'couple_settings'
  )),
  -- 행위자 이름은 넣지 않는다 — 표시할 때 profiles 닉네임을 붙인다 (닉네임 변경에도 안전)
  title text not null check (char_length(title) <= 120),
  target_id uuid,                     -- 기록/기념일 id (이동용, 지워진 대상은 null일 수 있다)
  created_at timestamptz not null default now()
);

create index activity_log_feed_idx on activity_log (couple_id, created_at desc);

alter table activity_log enable row level security;

-- 읽기: 내 커플 것만. 쓰기: 내 이름으로, 내 커플에만. 고치기·지우기 없음 (append-only).
create policy activity_log_select on activity_log for select
  using (couple_id = my_couple_id());
create policy activity_log_insert on activity_log for insert
  with check (actor_id = auth.uid() and couple_id = my_couple_id());
