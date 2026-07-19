-- RLS — 절대 규칙 2·5 (CLAUDE.md): couple_id 밖의 데이터는 어떤 경로로도 노출 금지,
-- 상호 잠금은 클라이언트 분기가 아니라 여기서 강제한다.

-- 내 couple_id 헬퍼. security definer로 profiles RLS 재귀를 끊는다.
create function my_couple_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select couple_id from public.profiles where user_id = auth.uid()
$$;

alter table couples enable row level security;
alter table profiles enable row level security;
alter table records enable row level security;
alter table spots enable row level security;
alter table record_photos enable row level security;
alter table expenses enable row level security;
alter table questions enable row level security;
alter table daily_entries enable row level security;
alter table daily_photos enable row level security;
alter table anniversaries enable row level security;
alter table sigungu enable row level security;
alter table notifications_log enable row level security;

-- 커플: 내 커플 행만. 생성·참여는 RPC(0003)로만 (초대 코드 무차별 대입으로 타 커플 조회 방지).
create policy couples_select on couples for select
  using (id = my_couple_id());
create policy couples_update on couples for update
  using (id = my_couple_id());

-- 프로필: 내 것 + 짝꿍 것 읽기, 내 것만 쓰기
create policy profiles_select on profiles for select
  using (user_id = auth.uid() or (couple_id is not null and couple_id = my_couple_id()));
create policy profiles_insert on profiles for insert
  with check (user_id = auth.uid());
create policy profiles_update on profiles for update
  using (user_id = auth.uid());

-- 데이트 기록 계열: couple_id 격리 (spots/photos/expenses는 records 경유)
create policy records_all on records for all
  using (couple_id = my_couple_id())
  with check (couple_id = my_couple_id());
create policy spots_all on spots for all
  using (record_id in (select id from records where couple_id = my_couple_id()))
  with check (record_id in (select id from records where couple_id = my_couple_id()));
create policy expenses_all on expenses for all
  using (record_id in (select id from records where couple_id = my_couple_id()))
  with check (record_id in (select id from records where couple_id = my_couple_id()));

-- 기록 사진: 격리 + 핀당 10장 상한(무료 티어, 명세 §8) 이중 방어
create policy record_photos_select on record_photos for select
  using (record_id in (select id from records where couple_id = my_couple_id()));
create policy record_photos_insert on record_photos for insert
  with check (
    record_id in (select id from records where couple_id = my_couple_id())
    and (select count(*) from record_photos p where p.record_id = record_photos.record_id) < 10
  );
create policy record_photos_delete on record_photos for delete
  using (record_id in (select id from records where couple_id = my_couple_id()));

-- 오늘 참여: 같은 커플이면 행 자체는 보임 (기분·잔디 표시용).
-- 단, answer 컬럼은 컬럼 권한에서 제외하고 상호 잠금 뷰(아래)로만 노출한다.
create policy daily_entries_select on daily_entries for select
  using (couple_id = my_couple_id());
create policy daily_entries_insert on daily_entries for insert
  with check (user_id = auth.uid() and couple_id = my_couple_id());
create policy daily_entries_update on daily_entries for update
  using (user_id = auth.uid());

-- 오늘 사진: 상호 잠금의 본체 (tech-design §5).
-- 내 것은 항상, 짝꿍 것은 "내가 그날 사진 1장 이상"일 때만.
create policy daily_photos_select on daily_photos for select
  using (
    entry_id in (select id from daily_entries where user_id = auth.uid())
    or exists (
      select 1
      from daily_entries me
      join daily_entries yours on yours.id = daily_photos.entry_id
      where me.user_id = auth.uid()
        and me.couple_id = yours.couple_id
        and me.entry_date = yours.entry_date
        and exists (select 1 from daily_photos p where p.entry_id = me.id)
    )
  );
-- 업로드: 내 엔트리에만 + 1일 30장 기술 상한 (명세 §3.2) 이중 방어
create policy daily_photos_insert on daily_photos for insert
  with check (
    entry_id in (select id from daily_entries where user_id = auth.uid())
    and (
      select count(*)
      from daily_photos p
      join daily_entries e on e.id = p.entry_id
      where e.user_id = auth.uid()
        and e.entry_date = (select entry_date from daily_entries where id = daily_photos.entry_id)
    ) < 30
  );
create policy daily_photos_delete on daily_photos for delete
  using (entry_id in (select id from daily_entries where user_id = auth.uid()));

-- 기념일: 커플 격리
create policy anniversaries_all on anniversaries for all
  using (couple_id = my_couple_id())
  with check (couple_id = my_couple_id());

-- 공용 읽기 전용 콘텐츠
create policy questions_read on questions for select to authenticated using (true);
create policy sigungu_read on sigungu for select using (true);

-- 알림 로그: 본인 조회만 (기록은 service role의 Edge Function이 수행)
create policy notifications_log_select on notifications_log for select
  using (user_id = auth.uid());

-- ── 질문 답변 상호 잠금 (컬럼 레벨) ─────────────────────────────
-- answer 컬럼은 테이블 직접 조회 권한에서 제외한다.
revoke select on daily_entries from authenticated, anon;
grant select (id, couple_id, user_id, entry_date, mood, question_id, created_at)
  on daily_entries to authenticated;

-- 정의자(definer) 뷰: 짝꿍의 answer는 내가 같은 날 답했을 때만.
-- 소유자 권한으로 실행되어 기저 RLS를 우회하므로 커플 격리를 뷰 안에서 다시 강제한다.
create view daily_entries_unlocked as
select
  e.id, e.couple_id, e.user_id, e.entry_date, e.mood, e.question_id, e.created_at,
  case
    when e.user_id = auth.uid() then e.answer
    when exists (
      select 1 from daily_entries me
      where me.user_id = auth.uid()
        and me.couple_id = e.couple_id
        and me.entry_date = e.entry_date
        and me.answer is not null
    ) then e.answer
    else null
  end as answer,
  (e.answer is not null) as has_answer
from daily_entries e
where e.couple_id = my_couple_id();

grant select on daily_entries_unlocked to authenticated;

-- ── Storage: 비공개 photos 버킷, couples/{couple_id}/ 경로 격리 ──
insert into storage.buckets (id, name, public) values ('photos', 'photos', false);

-- 경로 규칙:
--   couples/{couple_id}/records/{record_id}/{uuid}.webp
--   couples/{couple_id}/daily/{entry_date}/{user_id}/{uuid}.webp
-- 읽기: 커플 격리 + daily 경로는 상호 잠금을 경로 레벨에서도 강제
create policy photos_read on storage.objects for select
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'couples'
    and (storage.foldername(name))[2]::uuid = my_couple_id()
    and (
      (storage.foldername(name))[3] <> 'daily'
      or (storage.foldername(name))[5]::uuid = auth.uid()
      or exists (
        select 1 from daily_entries me
        join daily_photos p on p.entry_id = me.id
        where me.user_id = auth.uid()
          and me.entry_date = ((storage.foldername(name))[4])::date
      )
    )
  );
-- 쓰기: 내 커플 경로 + daily는 내 user_id 폴더에만
create policy photos_insert on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'couples'
    and (storage.foldername(name))[2]::uuid = my_couple_id()
    and (
      (storage.foldername(name))[3] <> 'daily'
      or (storage.foldername(name))[5]::uuid = auth.uid()
    )
  );
create policy photos_delete on storage.objects for delete
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'couples'
    and (storage.foldername(name))[2]::uuid = my_couple_id()
    and (
      (storage.foldername(name))[3] <> 'daily'
      or (storage.foldername(name))[5]::uuid = auth.uid()
    )
  );
