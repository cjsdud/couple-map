-- 기록 저장 원자화 RPC (M1 후속 — 클라이언트 순차 insert의 반쪽 기록 문제 해소)
--
-- 기록(records) + 스팟(diff: 유지는 update로 사진 태그 보존) + 지출을
-- 한 트랜잭션으로 묶는다. 사진 업로드(Storage)는 여전히 클라이언트 몫.
-- security invoker(기본) — 호출자의 RLS가 그대로 적용된다.
--
-- p_record_id: null이면 새 기록, 있으면 수정
-- p_spots:    [{ id?, name, lat, lng, sigungu_code, kakao_place_id }] (순서 = seq)
-- p_expenses: [{ category, amount, paid_by }]
create or replace function save_record(
  p_record_id uuid,
  p_date date,
  p_memo text,
  p_status text,
  p_spots jsonb,
  p_expenses jsonb
) returns uuid
language plpgsql
as $$
declare
  rid uuid;
  s jsonb;
  i int := 0;
begin
  if p_record_id is null then
    insert into records (couple_id, date, memo, status)
    values (my_couple_id(), p_date, p_memo, p_status)
    returning id into rid;
  else
    update records set date = p_date, memo = p_memo, status = p_status
    where id = p_record_id
    returning id into rid;
    if rid is null then
      raise exception 'record not found';
    end if;
  end if;

  -- 스팟 diff: 빠진 것 삭제 → 남은 것 seq 비켜두기(unique 충돌 방지) → 정식 seq 부여/삽입
  delete from spots
  where record_id = rid
    and id not in (
      select (e->>'id')::uuid from jsonb_array_elements(p_spots) e where e->>'id' is not null
    );
  update spots set seq = seq + 100 where record_id = rid;

  for s in select * from jsonb_array_elements(p_spots) loop
    i := i + 1;
    if s->>'id' is not null then
      update spots set
        seq = i,
        name = s->>'name',
        lat = (s->>'lat')::double precision,
        lng = (s->>'lng')::double precision,
        sigungu_code = s->>'sigungu_code',
        kakao_place_id = s->>'kakao_place_id'
      where id = (s->>'id')::uuid and record_id = rid;
    else
      insert into spots (record_id, seq, name, lat, lng, sigungu_code, kakao_place_id)
      values (
        rid, i, s->>'name',
        (s->>'lat')::double precision, (s->>'lng')::double precision,
        s->>'sigungu_code', s->>'kakao_place_id'
      );
    end if;
  end loop;

  delete from expenses where record_id = rid;
  insert into expenses (record_id, category, amount, paid_by)
  select rid, e->>'category', (e->>'amount')::int, nullif(e->>'paid_by', '')::uuid
  from jsonb_array_elements(p_expenses) e;

  return rid;
end;
$$;
