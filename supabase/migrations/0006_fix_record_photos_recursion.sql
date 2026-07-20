-- 0005와 동일 계열 결함: record_photos insert 정책(핀당 10장 상한)이
-- record_photos 자신을 서브쿼리로 재조회 → 무한 재귀(42P17)로 insert 차단.
-- security definer 함수로 고리를 끊는다.

create or replace function record_photo_count(rid uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.record_photos where record_id = rid
$$;

revoke all on function record_photo_count(uuid) from public;
grant execute on function record_photo_count(uuid) to authenticated;

drop policy record_photos_insert on record_photos;

create policy record_photos_insert on record_photos for insert
  with check (
    record_id in (select id from records where couple_id = my_couple_id())
    and record_photo_count(record_id) < 10
  );
