-- 다지역 기록의 사진→스팟 귀속 (docs/plan-multi-region.md B안 1단계)
-- nullable: 태그는 선택 사항, 미지정 사진도 1급 데이터.
alter table record_photos
  add column spot_id uuid references spots on delete set null;

create index idx_record_photos_spot on record_photos (spot_id);
