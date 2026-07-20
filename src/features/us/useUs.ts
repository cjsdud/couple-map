import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toDateString } from '../../shared/lib/daily';
import { supabase } from '../../shared/lib/supabase';
import { coupleStateKey } from '../couple/useCoupleState';
import type { ExpenseCategory } from '../map/useRecords';

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

export interface MonthlyExpenseRow {
  amount: number;
  category: ExpenseCategory;
  paid_by: string | null;
  record_id: string;
}

/** 이번 달 가계부: 합계·횟수·평균·밸런스 입력 데이터 (명세 §4) */
export function useMonthlyExpenses(year: number, month: number) {
  return useQuery({
    queryKey: ['monthly-expenses', year, month],
    queryFn: async (): Promise<MonthlyExpenseRow[]> => {
      if (new URLSearchParams(window.location.search).has('mock')) {
        return [
          { amount: 34000, category: 'meal', paid_by: 'a', record_id: 'r1' },
          { amount: 11000, category: 'cafe', paid_by: 'b', record_id: 'r1' },
          { amount: 28000, category: 'play', paid_by: 'a', record_id: 'r2' },
          { amount: 15000, category: 'meal', paid_by: 'b', record_id: 'r3' },
        ];
      }
      if (!supabase) return [];
      const first = `${year}-${String(month).padStart(2, '0')}-01`;
      const last = toDateString(new Date(year, month, 0));
      const { data, error } = await supabase
        .from('expenses')
        .select('amount, category, paid_by, record_id, records!inner(date)')
        .gte('records.date', first)
        .lte('records.date', last);
      if (error) throw error;
      return data as unknown as MonthlyExpenseRow[];
    },
  });
}

export interface CoupleSettingsPatch {
  day_cutoff?: number;
  ratio_a?: number;
  started_at?: string;
}

export function useUpdateCouple(coupleId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: CoupleSettingsPatch) => {
      if (!supabase || !coupleId) throw new Error('Supabase 연결 후 바꿀 수 있어요');
      const { error } = await supabase.from('couples').update(patch).eq('id', coupleId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: coupleStateKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['daily-entries'] });
    },
  });
}
