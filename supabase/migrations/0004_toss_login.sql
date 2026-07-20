-- 앱인토스 채널 인증: 토스 userKey ↔ 자체 계정 매핑 (tech-design §12-1, spike-result §4)
-- 토스 로그인은 mTLS 서버 교환이 필수라 Edge Function(service role)만 이 테이블을 만진다.

create table toss_users (
  user_key text primary key,          -- 토스 login-me가 주는 앱 단위 고유 식별값
  user_id uuid not null unique references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

-- RLS 활성화 + 정책 없음 = anon/authenticated 접근 전면 차단 (service role만 통과)
alter table toss_users enable row level security;
