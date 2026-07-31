-- 웹 푸시 알림 (M3, 2026-07-28)
--
-- PWA가 주 채널이 되면서 알림도 웹 푸시로 간다. iOS 16.4+는 "홈 화면에 추가"한
-- PWA에 한해 푸시를 허용하므로, 설치 안내(/install)를 거친 사용자만 받게 된다.
--
-- 보내는 트리거는 "짝꿍이 오늘을 남겼을 때" 하나뿐이다 — 상호 잠금이 풀리는 순간이
-- 이 앱에서 유일하게 시간이 중요한 사건이라서. 마케팅성 알림은 넣지 않는다.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,      -- 브라우저가 준 고유 주소 (기기별로 하나)
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- 본인 구독만 보고 지울 수 있다. 발송은 service role이 담당.
create policy push_subscriptions_select_own on push_subscriptions
  for select using (user_id = auth.uid());
create policy push_subscriptions_insert_own on push_subscriptions
  for insert with check (user_id = auth.uid());
create policy push_subscriptions_delete_own on push_subscriptions
  for delete using (user_id = auth.uid());

-- 발송 로그 — 하루 3건 상한(명세 §5)을 서버가 확인하는 근거이자 과발송 감사 자료
create table push_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now()
);

create index push_log_user_day_idx on push_log (user_id, sent_at);

alter table push_log enable row level security;
create policy push_log_select_own on push_log
  for select using (user_id = auth.uid());
