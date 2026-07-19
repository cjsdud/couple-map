-- Phase 0 스파이크용 임시 테이블 (M0 스키마와 무관, 검증 후 삭제해도 됨)
-- Supabase 대시보드 → SQL Editor에 그대로 붙여넣고 Run.
create table if not exists spike_ping (
  id int primary key,
  message text not null
);
insert into spike_ping (id, message)
  values (1, '도화지에 오신 걸 환영해요')
  on conflict (id) do nothing;

alter table spike_ping enable row level security;
-- 익명(anon) 읽기 전용 허용 — 익명 쿼리 fetch 검증 목적
create policy "spike_anon_read" on spike_ping for select to anon using (true);
