-- 실 DB e2e에서 발견된 결함 수정 (2026-07-20):
-- daily_photos의 select(상호 잠금)·insert(일 30장 상한) 정책이 daily_photos 자신을
-- 서브쿼리로 재조회 → 정책 평가가 자기 정책을 다시 타면서 무한 재귀(42P17).
-- security definer 함수로 자기 참조를 끊는다 (함수 내부는 RLS 미적용).

-- 내가 특정 날짜에 올린 오늘 사진 수 (잠금 해제 판정 + 상한 검증 공용)
create or replace function my_daily_photo_count(d date) returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int
  from public.daily_photos p
  join public.daily_entries e on e.id = p.entry_id
  where e.user_id = auth.uid()
    and e.entry_date = d
$$;

revoke all on function my_daily_photo_count(date) from public;
grant execute on function my_daily_photo_count(date) to authenticated;

drop policy daily_photos_select on daily_photos;
drop policy daily_photos_insert on daily_photos;

-- 내 것은 항상, 짝꿍 것은 "내가 그날 1장 이상"일 때만 (의미는 0002와 동일)
create policy daily_photos_select on daily_photos for select using (
  entry_id in (select id from daily_entries where user_id = auth.uid())
  or exists (
    select 1
    from daily_entries yours
    where yours.id = daily_photos.entry_id
      and yours.couple_id = my_couple_id()
      and my_daily_photo_count(yours.entry_date) > 0
  )
);

-- 업로드: 내 엔트리에만 + 1일 30장 상한
create policy daily_photos_insert on daily_photos for insert with check (
  entry_id in (select id from daily_entries where user_id = auth.uid())
  and my_daily_photo_count(
    (select entry_date from daily_entries where id = daily_photos.entry_id)
  ) < 30
);

-- Storage 쪽 상호 잠금 판정도 동일 함수로 통일 (경로 [4] = entry_date)
drop policy photos_read on storage.objects;
create policy photos_read on storage.objects for select
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'couples'
    and (storage.foldername(name))[2]::uuid = my_couple_id()
    and (
      (storage.foldername(name))[3] <> 'daily'
      or (storage.foldername(name))[5]::uuid = auth.uid()
      or my_daily_photo_count(((storage.foldername(name))[4])::date) > 0
    )
  );
