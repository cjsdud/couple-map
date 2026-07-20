import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';

export interface Profile {
  user_id: string;
  nickname: string;
  couple_id: string | null;
}

export interface Couple {
  id: string;
  invite_code: string;
  status: 'pending' | 'active' | 'closed';
  started_at: string | null;
  /** '오늘' 마감 시각 (0~23시, 기본 0=자정) — entry_date 계산 기준 */
  day_cutoff: number;
  /** 부담 비율 (user_a %) — 가계부 밸런스(M3) */
  ratio_a: number;
}

export interface CoupleState {
  profile: Profile | null;
  couple: Couple | null;
}

export const coupleStateKey = (userId: string) => ['couple-state', userId] as const;

function requireSupabase() {
  if (!supabase) throw new Error('Supabase가 연결되지 않았어요');
  return supabase;
}

async function fetchCoupleState(userId: string): Promise<CoupleState> {
  const sb = requireSupabase();
  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('user_id, nickname, couple_id')
    .eq('user_id', userId)
    .maybeSingle<Profile>();
  if (profileError) throw profileError;
  if (!profile?.couple_id) return { profile: profile ?? null, couple: null };

  const { data: couple, error: coupleError } = await sb
    .from('couples')
    .select('id, invite_code, status, started_at, day_cutoff, ratio_a')
    .eq('id', profile.couple_id)
    .maybeSingle<Couple>();
  if (coupleError) throw coupleError;
  return { profile, couple: couple ?? null };
}

/**
 * 프로필·커플 상태 쿼리.
 * pending(내가 코드를 만들고 대기 중)이면 짝꿍이 코드를 입력하는 순간을 잡기 위해 폴링한다.
 */
export function useCoupleState(userId: string | undefined) {
  return useQuery({
    queryKey: coupleStateKey(userId ?? 'anon'),
    queryFn: () => fetchCoupleState(userId as string),
    enabled: Boolean(userId) && supabase !== null,
    refetchInterval: (query) =>
      query.state.data?.couple?.status === 'pending' ? 4000 : false,
  });
}

export function useCreateProfile(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nickname: string) => {
      const sb = requireSupabase();
      const { error } = await sb
        .from('profiles')
        .insert({ user_id: userId, nickname: nickname.trim() });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: coupleStateKey(userId) }),
  });
}

/** RPC create_couple() — pending 커플 생성 후 6자리 초대 코드를 돌려받는다. */
export function useCreateCouple(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc('create_couple');
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as
        | { couple_id: string; invite_code: string }
        | undefined;
      if (!row) throw new Error('초대 코드를 만들지 못했어요');
      return row;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: coupleStateKey(userId) }),
  });
}

/** RPC join_couple(code) — pending 커플에 합류하면 둘 다 active가 된다. */
export function useJoinCouple(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const sb = requireSupabase();
      const { error } = await sb.rpc('join_couple', { code: code.trim() });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: coupleStateKey(userId) }),
  });
}

export function useSetStartedAt(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ coupleId, startedAt }: { coupleId: string; startedAt: string }) => {
      const sb = requireSupabase();
      const { error } = await sb
        .from('couples')
        .update({ started_at: startedAt })
        .eq('id', coupleId);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: coupleStateKey(userId) }),
  });
}

// ── 사귄 날 입력 "나중에 할게요" 로컬 플래그 ──────────────────────
// started_at은 선택 입력이라, 건너뛴 커플은 재진입 때 다시 막지 않는다.
// (우리 탭 설정에서 언제든 입력 가능 — M3)
const startedAtSkipKey = (coupleId: string) => `dohwaji:startedAtSkipped:${coupleId}`;

export function hasSkippedStartedAt(coupleId: string): boolean {
  try {
    return localStorage.getItem(startedAtSkipKey(coupleId)) === '1';
  } catch {
    return false;
  }
}

export function markStartedAtSkipped(coupleId: string) {
  try {
    localStorage.setItem(startedAtSkipKey(coupleId), '1');
  } catch {
    // localStorage 불가 환경(일부 WebView 프라이빗 모드)이면 세션 내 상태로만 처리
  }
}
