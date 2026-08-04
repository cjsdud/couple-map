-- 친구 커플 소개 귀속 (growth-monetization-v0.1 §1 — 사용자 결정 2026-08-03)
--
-- 소개 링크(/install?ref=<couple_id>)로 들어와 커플이 된 경우, 새 커플 행에
-- 소개해 준 커플의 id를 남긴다. 소개한 커플은 성공 1쌍부터 '단짝 핀'이 열린다.
-- 비교·리더보드는 만들지 않는다 (명세 §3.3) — 보상까지만.
--
-- referred_by는 **새 커플 쪽이 자기 행에** 적는다 (couples_update 정책 그대로 사용).
-- 남의 커플 행은 여전히 아무도 못 만진다.

alter table couples
  add column referred_by uuid references couples,
  add constraint couples_no_self_referral check (referred_by <> id);

-- 소개해 준 커플이 자기 성과를 세는 유일한 경로 — 남의 커플 데이터는 숫자 하나로만 나간다
create function my_referral_count() returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.couples
  where referred_by = public.my_couple_id() and status = 'active'
$$;
