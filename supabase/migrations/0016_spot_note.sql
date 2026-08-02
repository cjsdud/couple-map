-- 스팟별 한마디 (백로그 §4 — 사용자 결정 2026-08-02: 스팟별이 주, 사진별 캡션은 하지 않는다)
--
-- 지금까지 기록에는 memo 한 칸뿐이라 "어느 장소가 어땠는지"가 한 줄 안에서 뭉개졌다.
-- 데이트 코스의 스팟마다 한 줄씩 남길 수 있게 spots에 note를 더한다.
-- records.memo(그날 전체 한 줄)는 그대로 둔다 — 둘은 층이 다르다.
--
-- nullable: 안 쓰는 사람에게는 지금과 똑같아야 한다 (입력 UI도 기본 접힘 상태).
-- 120자 상한: 한 줄을 넘기면 기록 상세·공유 카드의 스팟 줄 레이아웃이 무너진다.
--             RecordSheet 입력칸의 maxLength와 같은 값으로 맞춰 둔다.
alter table spots
  add column note text check (char_length(note) <= 120);

-- RLS는 더 손댈 것이 없다.
-- spots_all(0002)은 record_id 경유로 커플 격리를 '행 단위'로 걸어 두었고,
-- daily_entries처럼 컬럼 권한을 따로 revoke/grant 한 테이블이 아니다
-- (그건 answer 상호 잠금 때문에 필요했던 예외다).
-- 따라서 새 컬럼은 기존 테이블 권한·정책을 그대로 물려받는다 — 추가 정책 불필요.

-- save_record(0012) 재정의 — 스팟 diff 경로에 note를 함께 태운다.
-- 시그니처가 같아 create or replace로 갈아끼우면 클라이언트 호출부는 그대로다.
-- 빈 문자열은 nullif로 null로 눕힌다 (입력칸을 열었다 비운 채로 저장한 경우).
--
-- p_record_id: null이면 새 기록, 있으면 수정
-- p_spots:    [{ id?, name, lat, lng, sigungu_code, kakao_place_id, note }] (순서 = seq)
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
        kakao_place_id = s->>'kakao_place_id',
        note = nullif(s->>'note', '')
      where id = (s->>'id')::uuid and record_id = rid;
    else
      insert into spots (record_id, seq, name, lat, lng, sigungu_code, kakao_place_id, note)
      values (
        rid, i, s->>'name',
        (s->>'lat')::double precision, (s->>'lng')::double precision,
        s->>'sigungu_code', s->>'kakao_place_id', nullif(s->>'note', '')
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
