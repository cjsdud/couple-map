import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../shared/lib/auth';
import { daysAgo, entryDateFor, toDateString } from '../../shared/lib/daily';
import { prepareUpload } from '../../shared/lib/image';
import { supabase } from '../../shared/lib/supabase';
import { useCoupleState } from '../couple/useCoupleState';

/** daily_entries_unlocked 뷰 행 — answer 상호 잠금은 DB가 강제 (0002_rls.sql) */
export interface DailyEntry {
  id: string;
  couple_id: string;
  user_id: string;
  entry_date: string;
  mood: string | null;
  question_id: number | null;
  /** 잠겨 있으면 null — has_answer로 "먼저 답했는지"만 알 수 있다 */
  answer: string | null;
  has_answer: boolean;
}

export interface DailyPhoto {
  id: string;
  entry_id: string;
  storage_path: string;
  /** 위치 태그(선택) — 있으면 "핀으로 승격" 가능 (명세 §3.2) */
  lat: number | null;
  lng: number | null;
  signedUrl?: string;
}

export function isMock() {
  return new URLSearchParams(window.location.search).has('mock');
}

/** 오늘 탭 공통 컨텍스트: 내 계정·커플·오늘(entry_date) */
export function useTodayContext() {
  const { session } = useSession();
  const userId = session?.user.id;
  const coupleQuery = useCoupleState(userId);
  const couple = coupleQuery.data?.couple ?? null;
  const entryDate = entryDateFor(new Date(), couple?.day_cutoff ?? 0);
  return { userId, couple, entryDate };
}

export function useDailyEntries(coupleId: string | undefined, entryDate: string) {
  return useQuery({
    queryKey: ['daily-entries', coupleId, entryDate],
    queryFn: async (): Promise<DailyEntry[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('daily_entries_unlocked')
        .select('*')
        .eq('entry_date', entryDate);
      if (error) throw error;
      return data as DailyEntry[];
    },
    enabled: Boolean(supabase && coupleId),
  });
}

/** 오늘 사진 (RLS가 상호 잠금을 강제 — 잠겨 있으면 짝꿍 행 자체가 안 온다) */
export function useDailyPhotos(entryIds: string[]) {
  return useQuery({
    queryKey: ['daily-photos', ...entryIds.slice().sort()],
    queryFn: async (): Promise<DailyPhoto[]> => {
      if (!supabase || entryIds.length === 0) return [];
      const { data, error } = await supabase
        .from('daily_photos')
        .select('id, entry_id, storage_path, lat, lng')
        .in('entry_id', entryIds)
        .order('created_at');
      if (error) throw error;
      const rows = data as DailyPhoto[];
      if (rows.length === 0) return rows;
      const { data: signed, error: signError } = await supabase.storage
        .from('photos')
        .createSignedUrls(rows.map((r) => r.storage_path), 3600);
      if (signError) throw signError;
      return rows.map((r, i) => ({ ...r, signedUrl: signed[i]?.signedUrl ?? undefined }));
    },
    enabled: entryIds.length > 0,
  });
}

/** 내 오늘 엔트리 upsert 후 id 반환 (사진·기분·답변의 공통 선행) */
async function ensureMyEntry(
  coupleId: string,
  userId: string,
  entryDate: string,
  questionId: number | null,
): Promise<string> {
  if (!supabase) throw new Error('Supabase 미연결');
  const { data, error } = await supabase
    .from('daily_entries')
    .upsert(
      { couple_id: coupleId, user_id: userId, entry_date: entryDate, question_id: questionId },
      { onConflict: 'user_id,entry_date', ignoreDuplicates: false },
    )
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export function useUploadPhoto(ctx: { coupleId?: string; userId?: string; entryDate: string }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, coords }: { file: File; coords?: { lat: number; lng: number } }) => {
      if (!supabase || !ctx.coupleId || !ctx.userId) throw new Error('Supabase 연결 후 올릴 수 있어요');
      const entryId = await ensureMyEntry(ctx.coupleId, ctx.userId, ctx.entryDate, null);
      const blob = await prepareUpload(file); // 압축 + EXIF(GPS) 제거 — 위치는 아래 별도 필드로만
      const path = `couples/${ctx.coupleId}/daily/${ctx.entryDate}/${ctx.userId}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(path, blob, { contentType: 'image/webp' });
      if (uploadError) throw uploadError;
      const { error } = await supabase
        .from('daily_photos')
        .insert({ entry_id: entryId, storage_path: path, lat: coords?.lat ?? null, lng: coords?.lng ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['daily-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['daily-photos'] });
      void queryClient.invalidateQueries({ queryKey: ['grass'] });
    },
  });
}

export function useSetMood(ctx: { coupleId?: string; userId?: string; entryDate: string }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mood: string) => {
      if (!supabase || !ctx.coupleId || !ctx.userId) throw new Error('Supabase 연결 후 남길 수 있어요');
      const entryId = await ensureMyEntry(ctx.coupleId, ctx.userId, ctx.entryDate, null);
      const { error } = await supabase.from('daily_entries').update({ mood }).eq('id', entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['daily-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['grass'] });
    },
  });
}

export function useSetAnswer(ctx: {
  coupleId?: string;
  userId?: string;
  entryDate: string;
  questionId: number | null;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (answer: string) => {
      if (!supabase || !ctx.coupleId || !ctx.userId) throw new Error('Supabase 연결 후 답할 수 있어요');
      const entryId = await ensureMyEntry(ctx.coupleId, ctx.userId, ctx.entryDate, ctx.questionId);
      const { error } = await supabase
        .from('daily_entries')
        .update({ answer: answer.trim(), question_id: ctx.questionId })
        .eq('id', entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['daily-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['grass'] });
    },
  });
}

/** 오늘의 질문: 사귄 D+ 기반 day_index (started_at 없으면 연중 일수로 폴백), 730 순환 */
export function useQuestionOfDay(startedAt: string | null, entryDate: string) {
  return useQuery({
    queryKey: ['question', startedAt, entryDate],
    queryFn: async (): Promise<{ id: number; text: string } | null> => {
      const base = startedAt ? new Date(`${startedAt}T12:00:00`) : new Date(`${entryDate.slice(0, 4)}-01-01T12:00:00`);
      const today = new Date(`${entryDate}T12:00:00`);
      const diff = Math.max(0, Math.floor((today.getTime() - base.getTime()) / 86_400_000));
      const dayIndex = (diff % 730) + 1;
      if (isMock() || !supabase) {
        return { id: dayIndex, text: '요즘 짝꿍 덕분에 새로 좋아하게 된 게 있나요?' };
      }
      const { data, error } = await supabase
        .from('questions')
        .select('id, text')
        .eq('day_index', dayIndex)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export interface GrassDay {
  date: string;
  /** 그날 참여: 둘 다 / 한 명 / 없음 */
  level: 'both' | 'one' | null;
}

/** 타임라인 '오늘 기록' 통합용 일자별 요약 (명세 §3.1 뷰 토글) */
export interface DailyDaySummary {
  date: string;
  photoCount: number;
  moods: string[];
  answeredCount: number;
}

export function useDailyTimeline(coupleId: string | undefined, entryDate: string) {
  return useQuery({
    queryKey: ['daily-timeline', coupleId, entryDate],
    queryFn: async (): Promise<DailyDaySummary[]> => {
      if (isMock()) {
        return [
          { date: '2026-07-19', photoCount: 3, moods: ['🥰', '😊'], answeredCount: 2 },
          { date: '2026-07-13', photoCount: 1, moods: ['😴'], answeredCount: 1 },
        ];
      }
      if (!supabase || !coupleId) return [];
      const from = daysAgo(entryDate, 61);
      const [{ data: entries, error }, { data: photoRows, error: photoError }] = await Promise.all([
        supabase
          .from('daily_entries_unlocked')
          .select('id, entry_date, mood, has_answer')
          .gte('entry_date', from)
          .lte('entry_date', entryDate),
        supabase.from('daily_photos').select('entry_id'),
      ]);
      if (error) throw error;
      if (photoError) throw photoError;
      const photoCountByEntry = new Map<string, number>();
      for (const p of photoRows ?? [])
        photoCountByEntry.set(p.entry_id as string, (photoCountByEntry.get(p.entry_id as string) ?? 0) + 1);
      const byDate = new Map<string, DailyDaySummary>();
      for (const e of (entries ?? []) as { id: string; entry_date: string; mood: string | null; has_answer: boolean }[]) {
        const s = byDate.get(e.entry_date) ?? { date: e.entry_date, photoCount: 0, moods: [], answeredCount: 0 };
        s.photoCount += photoCountByEntry.get(e.id) ?? 0;
        if (e.mood) s.moods.push(e.mood);
        if (e.has_answer) s.answeredCount += 1;
        byDate.set(e.entry_date, s);
      }
      return [...byDate.values()].filter((s) => s.photoCount + s.moods.length + s.answeredCount > 0);
    },
  });
}

const MOCK_GRASS_FILLED = [1, 2, 3, 5, 6, 8, 11, 12, 13, 14, 15, 17, 18];
const MOCK_GRASS_HALF = [4, 9, 16];

/**
 * 잔디 데이터: 최근 62일 참여 현황 (이번 달 그리드 + 스트릭 계산 겸용).
 * 채움 = 사진·질문·기분 중 1+ (tech-design §4).
 */
export function useGrass(coupleId: string | undefined, entryDate: string) {
  return useQuery({
    queryKey: ['grass', coupleId, entryDate],
    queryFn: async (): Promise<GrassDay[]> => {
      if (isMock() || !supabase || !coupleId) {
        if (!isMock()) return [];
        const [y, m] = entryDate.split('-').map(Number);
        return [
          ...MOCK_GRASS_FILLED.map((d) => ({
            date: toDateString(new Date(y, m - 1, d)),
            level: 'both' as const,
          })),
          ...MOCK_GRASS_HALF.map((d) => ({
            date: toDateString(new Date(y, m - 1, d)),
            level: 'one' as const,
          })),
        ];
      }
      const from = daysAgo(entryDate, 61);
      const [{ data: entries, error }, { data: photoRows, error: photoError }] = await Promise.all([
        supabase
          .from('daily_entries_unlocked')
          .select('id, user_id, entry_date, mood, has_answer')
          .gte('entry_date', from)
          .lte('entry_date', entryDate),
        supabase.from('daily_photos').select('entry_id'),
      ]);
      if (error) throw error;
      if (photoError) throw photoError;
      const entriesWithPhoto = new Set((photoRows ?? []).map((p) => p.entry_id as string));
      const byDate = new Map<string, Set<string>>();
      for (const e of (entries ?? []) as (DailyEntry & { id: string })[]) {
        const participated = e.mood !== null || e.has_answer || entriesWithPhoto.has(e.id);
        if (!participated) continue;
        if (!byDate.has(e.entry_date)) byDate.set(e.entry_date, new Set());
        byDate.get(e.entry_date)!.add(e.user_id);
      }
      return [...byDate.entries()].map(([date, users]) => ({
        date,
        level: users.size >= 2 ? 'both' : 'one',
      }));
    },
  });
}
