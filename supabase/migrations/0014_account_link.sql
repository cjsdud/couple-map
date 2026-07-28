-- 채널 간 계정 연동 (사용자 결정 2026-07-25)
--
-- 배경: 같은 사람이 앱인토스(토스 로그인)와 웹·스토어 앱(카카오 로그인)으로 각각 들어오면
-- 서로 다른 auth.users가 만들어진다. toss_users(0004)·kakao_users(0009)는 이미 같은 계정을
-- 가리킬 수 있는 구조라, 빠진 건 "두 로그인 수단을 한 계정에 묶는 절차"뿐이다.
--
-- 방식: 이미 쓰던 계정에서 연결 코드를 발급 → 다른 로그인 수단으로 들어온 세션에서 입력.
-- 초대 코드와 같은 감각(6자리)이라 사용자가 새로 배울 게 없다.
-- 이메일·연락처 매칭 방식은 계정 탈취 위험이 있어 쓰지 않는다.

create table account_link_codes (
  code text primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index account_link_codes_user_idx on account_link_codes (user_id);

alter table account_link_codes enable row level security;

-- 본인이 발급한 코드만 조회 가능 (입력 측 검증은 service role 함수가 수행)
create policy account_link_codes_select_own on account_link_codes
  for select using (user_id = auth.uid());

-- 연결 코드 발급: 유효기간 10분, 계정당 최신 1개만 유지
create function issue_link_code() returns table (code text, expires_at timestamptz)
language plpgsql volatile security definer set search_path = public
as $$
declare
  chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  new_code text;
  ttl constant interval := interval '10 minutes';
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- 계정당 활성 코드는 하나 — 새로 발급하면 이전 것은 무효
  delete from account_link_codes where user_id = auth.uid();

  loop
    new_code := (
      select string_agg(substr(chars, 1 + floor(random() * length(chars))::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from account_link_codes c where c.code = new_code);
  end loop;

  insert into account_link_codes (code, user_id, expires_at)
  values (new_code, auth.uid(), now() + ttl);

  return query select new_code, now() + ttl;
end;
$$;
