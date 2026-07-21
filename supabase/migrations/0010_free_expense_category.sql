-- 지출 카테고리 자유화 (사용자 결정 2026-07-21 — 명세 §4의 '5개 고정'을 '기본 5종 + 자유 입력'으로 완화)
-- 기존 데이터(meal/cafe/play/move/gift)는 그대로 유효. 커스텀은 사용자가 입력한 한글 텍스트를 그대로 저장.
alter table expenses drop constraint expenses_category_check;
