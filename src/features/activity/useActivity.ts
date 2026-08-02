import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';

// useRecords의 isMock와 같은 판정 — 순환 import(기록 훅 ↔ 보관함)를 피해 여기서 직접 본다
const isMock = () => new URLSearchParams(window.location.search).has('mock');

/**
 * 알림 보관함 (backlog §6) — 커플에게 일어난 일을 전부 남기고, 놓친 알림을 다시 본다.
 *
 * 원칙 (설계 메모):
 * - 보관함에는 **모든 CUD**를 남기되, 푸시는 서버 화이트리스트(api/send-push)의 몇 가지만.
 * - 문구는 "무엇을 했는지"만 담고 행위자 이름은 넣지 않는다 — 표시할 때 닉네임을 붙인다.
 * - 기록 실패는 조용히 넘어간다 (0017 미적용 환경 포함) — 보관함은 부가 기능이라
 *   본 기능(저장·수정)을 절대 방해하지 않는다.
 */

export type ActivityKind =
  | 'record_create'
  | 'record_update'
  | 'record_delete'
  | 'anniversary_create'
  | 'anniversary_delete'
  | 'today'
  | 'couple_theme'
  | 'couple_settings';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  actor_id: string;
  title: string;
  target_id: string | null;
  created_at: string;
}

/** 보관함 줄 앞에 붙는 그림 — 종류가 한눈에 갈리게 */
export const ACTIVITY_ICONS: Record<ActivityKind, string> = {
  record_create: '🖍️',
  record_update: '✏️',
  record_delete: '🧽',
  anniversary_create: '💛',
  anniversary_delete: '🗓️',
  today: '📸',
  couple_theme: '🎨',
  couple_settings: '⚙️',
};

/** 보관함 표시 상한 — 무한 스크롤은 과하다 (설계 메모) */
const FEED_LIMIT = 100;

// ── ?mock=1 데모 — 보관함 UI를 실계정 없이 보여준다 ────────────────
const mockFeed: ActivityItem[] = [];
function seedMockFeed() {
  if (mockFeed.length > 0) return;
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  mockFeed.push(
    { id: 'ma1', kind: 'today', actor_id: 'mock-partner', title: '오늘을 남겼어요', target_id: null, created_at: ago(35) },
    { id: 'ma2', kind: 'record_create', actor_id: 'mock-me', title: '망원한강공원 데이트를 남겼어요', target_id: 'mock-1', created_at: ago(60 * 5) },
    { id: 'ma3', kind: 'couple_theme', actor_id: 'mock-partner', title: '도화지 옷을 갈아입혔어요', target_id: null, created_at: ago(60 * 26) },
    { id: 'ma4', kind: 'anniversary_create', actor_id: 'mock-me', title: '‘첫 여행 (부산)’ 기념일을 달았어요', target_id: null, created_at: ago(60 * 24 * 3) },
  );
}

/** 같은 일이 몇 분 안에 반복될 때(사진 여러 장 연속 업로드 등) 보관함 도배 방지 */
const recentLog = new Map<string, number>();
const DEDUP_MS = 10 * 60_000;

/**
 * 보관함에 한 줄 남기기 — 실패해도 조용히.
 * couple_id는 서버 RLS(my_couple_id)와 일치해야 하므로 호출부가 아는 값을 넘긴다.
 * 넘기지 못하는 자리(삭제 훅 등)는 프로필에서 한 번 찾아 쓴다.
 */
export async function logActivity(
  kind: ActivityKind,
  title: string,
  opts: { coupleId?: string; targetId?: string } = {},
): Promise<void> {
  const dedupKey = `${kind}|${title}`;
  const last = recentLog.get(dedupKey);
  const now = Date.now();
  if (last && now - last < DEDUP_MS) return;
  recentLog.set(dedupKey, now);

  if (isMock()) {
    seedMockFeed();
    mockFeed.unshift({
      id: `m-${now}`,
      kind,
      actor_id: 'mock-me',
      title,
      target_id: opts.targetId ?? null,
      created_at: new Date(now).toISOString(),
    });
    notifyFeedChanged();
    return;
  }
  if (!supabase) return;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return;
    let coupleId = opts.coupleId;
    if (!coupleId) {
      const { data } = await supabase
        .from('profiles')
        .select('couple_id')
        .eq('user_id', userId)
        .maybeSingle();
      coupleId = (data?.couple_id as string | null) ?? undefined;
    }
    if (!coupleId) return;
    await supabase.from('activity_log').insert({
      couple_id: coupleId,
      actor_id: userId,
      kind,
      title,
      target_id: opts.targetId ?? null,
    });
    notifyFeedChanged();
  } catch {
    // 0017 미적용 등 — 보관함은 부가 기능, 본 흐름을 막지 않는다
  }
}

// 새 줄이 생기면 열린 화면의 피드를 깨운다 (React Query 밖에서 insert하므로 직접 알린다)
const feedListeners = new Set<() => void>();
function notifyFeedChanged() {
  for (const fn of feedListeners) fn();
}
export function onFeedChanged(fn: () => void): () => void {
  feedListeners.add(fn);
  return () => feedListeners.delete(fn);
}

/**
 * 보관함 피드 — 최근 100건.
 * 0017 미적용 환경에서는 조용히 "없음"으로 (`available: false` → 종 아이콘 숨김).
 */
export function useActivityFeed() {
  const query = useQuery({
    queryKey: ['activity'],
    staleTime: 30_000,
    queryFn: async (): Promise<ActivityItem[] | null> => {
      if (isMock()) {
        seedMockFeed();
        return [...mockFeed].slice(0, FEED_LIMIT);
      }
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('activity_log')
        .select('id, kind, actor_id, title, target_id, created_at')
        .order('created_at', { ascending: false })
        .limit(FEED_LIMIT);
      // 테이블이 아직 없으면(마이그레이션 전) 기능을 조용히 접는다
      if (error) return null;
      return data as ActivityItem[];
    },
    enabled: isMock() || Boolean(supabase),
  });
  return {
    items: query.data ?? [],
    available: query.data !== null && query.data !== undefined,
    refetch: query.refetch,
  };
}

// ── 읽음 표시 — 기기별 localStorage (뱃지는 편의 기능, 서버 컬럼은 두지 않는다) ──
const READ_KEY = 'dohwaji:activity-read-at';

export function loadReadAt(): string {
  try {
    return localStorage.getItem(READ_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveReadAt(iso: string) {
  try {
    localStorage.setItem(READ_KEY, iso);
  } catch {
    // 프라이빗 모드 등 — 뱃지가 계속 떠 있을 뿐, 동작엔 지장 없다
  }
}

/** '3분 전' 같은 상대 시각 — 보관함 줄 오른쪽에 */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  return iso.slice(5, 10).replace('-', '. ');
}
