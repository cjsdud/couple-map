-- 카카오 고유 id ↔ 자체 계정 매핑 (Supabase 내장 provider의 account_email 강제 우회)
-- toss_users(0004)와 동일 패턴. service role(Vercel 함수)만 접근한다.
create table kakao_users (
  kakao_id text primary key,
  user_id uuid not null unique references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

-- RLS 활성화 + 정책 없음 = anon/authenticated 전면 차단 (service role만 통과)
alter table kakao_users enable row level security;
