import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toDateString } from '../../shared/lib/daily';
import { supabase } from '../../shared/lib/supabase';
import { logActivity } from '../activity/useActivity';
import { coupleStateKey } from '../couple/useCoupleState';
import { notifyPartner } from '../push/notifyPartner';

const DAY_MS = 86_400_000;

/** 사귄 지 D+n (사귄 날 = D+1, 국내 커플 관례) */
export function dPlus(startedAt: string, today: string): number {
  return (
    Math.round(
      (new Date(`${today}T12:00:00`).getTime() - new Date(`${startedAt}T12:00:00`).getTime()) / DAY_MS,
    ) + 1
  );
}

export interface Milestone {
  title: string;
  date: string;
  /** 오늘부터 며칠 남았는지 (0 = 오늘) */
  dDay: number;
}

/** 100일 단위 + 주년 자동 기념일 중 다가오는 것 (명세 §3.3 — 커스텀은 M3 후속) */
export function upcomingMilestones(startedAt: string, today: string, limit = 3): Milestone[] {
  const start = new Date(`${startedAt}T12:00:00`).getTime();
  const now = new Date(`${today}T12:00:00`).getTime();
  const out: Milestone[] = [];
  // 사귄 날 = D+1이므로 100일째는 시작일 + 99일
  for (let n = 100; n <= 10000; n += 100) {
    const t = start + (n - 1) * DAY_MS;
    if (t >= now) out.push({ title: `${n}일`, date: toDateString(new Date(t)), dDay: Math.round((t - now) / DAY_MS) });
  }
  for (let y = 1; y <= 30; y += 1) {
    const d = new Date(`${startedAt}T12:00:00`);
    d.setFullYear(d.getFullYear() + y);
    if (d.getTime() >= now)
      out.push({ title: `${y}주년`, date: toDateString(d), dDay: Math.round((d.getTime() - now) / DAY_MS) });
  }
  return out.sort((a, b) => a.dDay - b.dDay).slice(0, limit);
}

// ── 커스텀 기념일 (anniversaries 테이블 — RLS 커플 격리) ─────────
export interface Anniversary {
  id: string;
  title: string;
  date: string;
  kind: 'auto' | 'custom';
}

const isMockMode = () => new URLSearchParams(window.location.search).has('mock');

export function useAnniversaries(coupleId: string | undefined) {
  return useQuery({
    queryKey: ['anniversaries', coupleId],
    queryFn: async (): Promise<Anniversary[]> => {
      if (isMockMode())
        return [
          { id: 'mock-a1', title: '처음 만난 날', date: '2026-01-10', kind: 'custom' },
          { id: 'mock-a2', title: '첫 여행 (부산)', date: '2026-05-05', kind: 'custom' },
          { id: 'mock-a3', title: '짝꿍 생일', date: '2026-09-03', kind: 'custom' },
        ];
      if (!supabase || !coupleId) return [];
      const { data, error } = await supabase
        .from('anniversaries')
        .select('id, title, date, kind')
        .order('date');
      if (error) throw error;
      return data as Anniversary[];
    },
    enabled: isMockMode() || Boolean(supabase && coupleId),
  });
}

export function useAddAnniversary(coupleId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: { title: string; date: string }) => {
      if (!supabase || !coupleId) throw new Error('Supabase 연결 후 넣을 수 있어요');
      const { error } = await supabase
        .from('anniversaries')
        .insert({ couple_id: coupleId, title: draft.title, date: draft.date, kind: 'custom' });
      if (error) throw error;
    },
    onSuccess: (_, draft) => {
      void queryClient.invalidateQueries({ queryKey: ['anniversaries'] });
      void logActivity('anniversary_create', `‘${draft.title}’ 기념일을 달았어요`, { coupleId });
      void notifyPartner('anniversary_create');
    },
  });
}

export function useDeleteAnniversary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error('Supabase 연결 후 지울 수 있어요');
      const { error } = await supabase.from('anniversaries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      // invalidate 전에 캐시에서 이름을 건진다
      const title = queryClient
        .getQueriesData<Anniversary[]>({ queryKey: ['anniversaries'] })
        .flatMap(([, list]) => list ?? [])
        .find((a) => a.id === id)?.title;
      void queryClient.invalidateQueries({ queryKey: ['anniversaries'] });
      void logActivity('anniversary_delete', title ? `‘${title}’ 기념일을 지웠어요` : '기념일 하나를 지웠어요');
    },
  });
}

/** 커스텀 기념일의 다가오는 발생일 — 지난 날짜는 매년 돌아오는 기념일로 센다 */
export function nextOccurrence(date: string, today: string): { date: string; dDay: number } {
  const now = new Date(`${today}T12:00:00`).getTime();
  const [y, m, day] = date.split('-').map(Number);
  let d = new Date(y, m - 1, day, 12);
  if (d.getTime() < now) {
    d = new Date(Number(today.slice(0, 4)), m - 1, day, 12);
    if (d.getTime() < now) d = new Date(d.getFullYear() + 1, m - 1, day, 12);
  }
  return { date: toDateString(d), dDay: Math.round((d.getTime() - now) / DAY_MS) };
}

export interface CoupleSettingsPatch {
  day_cutoff?: number;
  ratio_a?: number;
  started_at?: string;
  /** 도화지 꾸미기 (0011) */
  theme?: import('../../shared/lib/theme').CoupleTheme;
}

export function useUpdateCouple(coupleId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: CoupleSettingsPatch) => {
      if (!supabase || !coupleId) throw new Error('Supabase 연결 후 바꿀 수 있어요');
      const { error } = await supabase.from('couples').update(patch).eq('id', coupleId);
      if (error) throw error;
    },
    onSuccess: (_, patch) => {
      if (userId) void queryClient.invalidateQueries({ queryKey: coupleStateKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['daily-entries'] });
      // 보관함에만 남긴다 — 설정 변경까지 폰을 울리면 성가시다 (backlog §6)
      const isTheme = patch.theme !== undefined;
      void logActivity(
        isTheme ? 'couple_theme' : 'couple_settings',
        isTheme ? '도화지 옷을 갈아입혔어요' : '우리 설정을 매만졌어요',
        { coupleId },
      );
    },
  });
}
