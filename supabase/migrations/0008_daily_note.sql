-- 오늘 탭 개편: 한 줄 일기(note) 추가 (사용자 피드백 2026-07-20)
-- 공개 정책: 기분(mood)과 동일하게 짝꿍에게 바로 보임 (질문 답만 양방 잠금 유지).
alter table daily_entries add column note text;

-- answer만 제외하는 컬럼 권한 체계에 note를 추가
grant select (note) on daily_entries to authenticated;

-- 상호 잠금 뷰에도 note 노출 (끝에 컬럼 추가라 create or replace 가능)
create or replace view daily_entries_unlocked as
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
  (e.answer is not null) as has_answer,
  e.note
from daily_entries e
where e.couple_id = my_couple_id();
