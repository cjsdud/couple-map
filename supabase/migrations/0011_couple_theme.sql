-- 도화지 꾸미기 (백로그 1번, A안 확정 2026-07-21)
-- 커플 공유 테마: { pin: 'dot'|'heart'|'star'|'tape', paper: 'paper'|'cream'|'sky'|'blossom', maxStreak: n }
-- maxStreak는 해금 판정용 최고 스트릭 기록 (한 번 열리면 계속 열림)
alter table couples add column theme jsonb not null default '{}'::jsonb;
