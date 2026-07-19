-- 커플 생성·연결 RPC — couples 테이블 직접 insert를 막고 이 경로로만.
-- (초대 코드로 타 커플 행을 조회할 수 없게 select 정책을 좁게 유지하기 위함)

-- 사람이 읽어 옮기기 쉬운 6자리 코드 (혼동 문자 제외, 충돌 시 재시도)
create function gen_invite_code() returns text
language plpgsql volatile
as $$
declare
  chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := (
      select string_agg(substr(chars, 1 + floor(random() * length(chars))::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from couples where invite_code = code);
  end loop;
  return code;
end;
$$;

-- 커플 생성: 프로필이 있고 아직 커플이 없는 사용자만. 초대 코드를 반환한다.
create function create_couple() returns table (couple_id uuid, invite_code text)
language plpgsql volatile security definer set search_path = public
as $$
declare
  new_couple couples;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if (select p.couple_id from profiles p where p.user_id = auth.uid()) is not null then
    raise exception 'already in a couple';
  end if;

  insert into couples (invite_code, status)
  values (gen_invite_code(), 'pending')
  returning * into new_couple;

  update profiles set couple_id = new_couple.id where user_id = auth.uid();
  return query select new_couple.id, new_couple.invite_code;
end;
$$;

-- 커플 참여: pending 커플의 초대 코드 입력 → active 전환
create function join_couple(code text) returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  target couples;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if (select p.couple_id from profiles p where p.user_id = auth.uid()) is not null then
    raise exception 'already in a couple';
  end if;

  select * into target
  from couples
  where invite_code = upper(trim(code)) and status = 'pending'
  for update;

  if target.id is null then
    raise exception 'invalid or used invite code';
  end if;

  update profiles set couple_id = target.id where user_id = auth.uid();
  update couples set status = 'active' where id = target.id;
  return target.id;
end;
$$;

revoke all on function create_couple() from public;
revoke all on function join_couple(text) from public;
grant execute on function create_couple() to authenticated;
grant execute on function join_couple(text) to authenticated;
