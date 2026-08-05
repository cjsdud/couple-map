import { useEffect, useState } from 'react';
import { useSession } from '../../shared/lib/auth';
import BottomSheet from '../../shared/ui/BottomSheet';
import { useCoupleMembers } from '../map/useRecords';
import {
  ACTIVITY_ICONS,
  loadReadAt,
  onFeedChanged,
  relativeTime,
  saveReadAt,
  useActivityFeed,
  type ActivityItem,
} from './useActivity';

/**
 * 종 아이콘 + 알림 보관함 (backlog §6 — 인스타 하트 탭처럼).
 *
 * 세 탭 헤더에 같은 종이 뜬다. 새 화면 금지(절대 규칙 1)라 바텀시트 레이어로만 연다.
 * 뱃지는 "마지막으로 열어 본 뒤 새로 생긴 것" 개수 — 읽음은 기기별(localStorage)로 기억한다.
 * 0017 미적용 환경에서는 종 자체가 뜨지 않는다 (조용한 실패).
 */
export default function ActivityBell() {
  const feed = useActivityFeed();
  const members = useCoupleMembers().data ?? [];
  const { session } = useSession();
  const myId = new URLSearchParams(window.location.search).has('mock')
    ? 'mock-me'
    : session?.user.id;
  const [open, setOpen] = useState(false);
  const [readAt, setReadAt] = useState(loadReadAt);

  // logActivity가 React Query 밖에서 insert하므로 직접 신호를 받아 새로고침한다
  const refetch = feed.refetch;
  useEffect(() => onFeedChanged(() => void refetch()), [refetch]);

  if (!feed.available) return null;

  const unread = feed.items.filter((i) => i.created_at > readAt).length;
  const nameOf = (userId: string) => {
    // 내 줄은 기념일 예외로만 남는다 (useActivityFeed 필터) — 닉네임 대신 '나'로
    if (userId === myId) return '나';
    return members.find((m) => m.user_id === userId)?.nickname?.trim() || '짝꿍';
  };

  const openSheet = () => {
    setOpen(true);
    // 여는 순간 읽음으로 — 개별 읽음 처리는 과하다 (설계 메모)
    const now = new Date().toISOString();
    saveReadAt(now);
    setReadAt(now);
  };

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-label={unread > 0 ? `알림 ${unread}개` : '알림 보관함'}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/15 bg-white/60 text-base active:translate-y-px"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-pink px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="알림">
        {feed.items.length === 0 ? (
          <div className="space-y-1 py-10 text-center">
            <p className="text-3xl" aria-hidden>
              🔔
            </p>
            <p className="break-keep text-sm opacity-60">
              아직 소식이 없어요 — 짝꿍이 무언가 남기면 여기에 쌓여요
            </p>
          </div>
        ) : (
          <ul className="space-y-1 pb-2">
            {feed.items.map((item) => (
              <ActivityRow key={item.id} item={item} name={nameOf(item.actor_id)} />
            ))}
          </ul>
        )}
      </BottomSheet>
    </>
  );
}

function ActivityRow({ item, name }: { item: ActivityItem; name: string }) {
  return (
    <li className="flex items-start gap-2.5 rounded-xl rounded-tl-sm px-2 py-2.5">
      <span aria-hidden className="mt-0.5 text-lg">
        {ACTIVITY_ICONS[item.kind] ?? '🖍️'}
      </span>
      <p className="min-w-0 flex-1 break-keep text-sm leading-snug">
        <b>{name}</b>
        <span className="opacity-80"> · {item.title}</span>
      </p>
      <span className="shrink-0 pt-0.5 text-xs opacity-40">{relativeTime(item.created_at)}</span>
    </li>
  );
}
