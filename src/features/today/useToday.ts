import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../shared/lib/auth';
import { daysAgo, entryDateFor, toDateString } from '../../shared/lib/daily';
import { prepareUpload } from '../../shared/lib/image';
import { supabase } from '../../shared/lib/supabase';
import { useCoupleState } from '../couple/useCoupleState';
import { logActivity } from '../activity/useActivity';
import { notifyPartnerToday } from '../push/notifyPartner';

/** daily_entries_unlocked 뷰 행 — answer 상호 잠금은 DB가 강제 (0002_rls.sql, 0008_daily_note.sql) */
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
  /** 한 줄 일기 — 기분처럼 짝꿍에게 바로 보인다 (질문 답만 양방 잠금) */
  note: string | null;
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
      // 사진은 잔디 인정 요소가 아니므로 grass/streak 무효화는 불필요
      void queryClient.invalidateQueries({ queryKey: ['daily-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['daily-photos'] });
      // 내가 올린 순간 짝꿍 쪽 잠금이 풀린다 — 그걸 알린다 (보관함에도 한 줄)
      void logActivity('today', '오늘을 남겼어요', { coupleId: ctx.coupleId });
      void notifyPartnerToday();
    },
  });
}

/**
 * 오늘 사진 지우기 — 행 삭제(RLS: 본인 엔트리만) 후 스토리지 원본 제거 시도.
 * 마지막 장을 지우면 select 정책에 따라 짝꿍 사진이 자동으로 다시 잠긴다.
 */
export function useDeleteDailyPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (photo: { id: string; storagePath: string }) => {
      if (!supabase) throw new Error('Supabase 연결 후 지울 수 있어요');
      const { error } = await supabase.from('daily_photos').delete().eq('id', photo.id);
      if (error) throw error;
      try {
        await supabase.storage.from('photos').remove([photo.storagePath]);
      } catch {
        // 행 삭제는 반영 — 원본 제거 실패는 무시 (후속 정리 배치)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['daily-photos'] });
    },
  });
}

/** 통합 작성 카드의 입력값 — 세 항목 전부 선택 사항, 하나 이상 채우면 저장 */
export interface TodayDraft {
  mood: string | null;
  answer: string;
  note: string;
  /**
   * 수정 모드: 비운 항목도 비운 대로 덮어쓴다 (신규 저장은 채운 항목만 반영).
   * 답을 비우면 has_answer가 풀려 짝꿍의 답도 다시 잠긴다 — 뷰(0002_rls)가 자동 처리.
   */
  overwrite?: boolean;
}

/**
 * 오늘 통합 저장·수정: 기분·질문 답·한 줄 일기를 daily_entries 1행에 한 번에.
 * answer는 컬럼 권한 체계(select 제외 컬럼) 특성상 insert-with-answer가 아닌
 * ensureMyEntry(upsert) → update 경로로만 쓴다.
 * 수정도 같은 경로 — RLS daily_entries_update(본인 행)가 이미 허용하는 검증된 길이다.
 */
export function useSaveToday(ctx: {
  coupleId?: string;
  userId?: string;
  entryDate: string;
  questionId: number | null;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ mood, answer, note, overwrite }: TodayDraft) => {
      if (!supabase || !ctx.coupleId || !ctx.userId) throw new Error('Supabase 연결 후 남길 수 있어요');
      const trimmedAnswer = answer.trim();
      const trimmedNote = note.trim();
      if (!mood && !trimmedAnswer && !trimmedNote)
        throw new Error('기분·답·일기 중 하나는 채워 주세요');
      const patch: {
        mood?: string | null;
        answer?: string | null;
        question_id?: number | null;
        note?: string | null;
      } = {};
      if (overwrite) {
        // 수정: 세 항목 전부 그대로 덮어쓴다 — 비운 항목은 null로 지운다
        patch.mood = mood;
        patch.answer = trimmedAnswer || null;
        patch.question_id = trimmedAnswer ? ctx.questionId : null;
        patch.note = trimmedNote || null;
      } else {
        if (mood) patch.mood = mood;
        if (trimmedAnswer) {
          patch.answer = trimmedAnswer;
          patch.question_id = ctx.questionId;
        }
        if (trimmedNote) patch.note = trimmedNote;
      }
      const entryId = await ensureMyEntry(
        ctx.coupleId,
        ctx.userId,
        ctx.entryDate,
        trimmedAnswer ? ctx.questionId : null,
      );
      const { error } = await supabase.from('daily_entries').update(patch).eq('id', entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['daily-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['grass'] });
      void queryClient.invalidateQueries({ queryKey: ['streak'] });
      void logActivity('today', '오늘을 남겼어요', { coupleId: ctx.coupleId });
      void notifyPartnerToday();
    },
  });
}

/** 사귄 D+ 기반 day_index (started_at 없으면 연중 일수로 폴백), 730 순환 */
function questionDayIndex(startedAt: string | null, entryDate: string): number {
  const base = startedAt ? new Date(`${startedAt}T12:00:00`) : new Date(`${entryDate.slice(0, 4)}-01-01T12:00:00`);
  const today = new Date(`${entryDate}T12:00:00`);
  const diff = Math.max(0, Math.floor((today.getTime() - base.getTime()) / 86_400_000));
  return (diff % 730) + 1;
}

const MOCK_QUESTION_TEXT = '요즘 짝꿍 덕분에 새로 좋아하게 된 게 있나요?';

/** 오늘의 질문 */
export function useQuestionOfDay(startedAt: string | null, entryDate: string) {
  return useQuery({
    queryKey: ['question', startedAt, entryDate],
    queryFn: async (): Promise<{ id: number; text: string } | null> => {
      const dayIndex = questionDayIndex(startedAt, entryDate);
      if (isMock() || !supabase) {
        return { id: dayIndex, text: MOCK_QUESTION_TEXT };
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

/**
 * 지난 날짜의 질문 텍스트 (잔디 상세 시트용).
 * 그날 누군가 답했으면 저장된 question_id가 정답, 아니면 day_index로 재계산.
 */
export function useDayQuestion(startedAt: string | null, date: string, questionId: number | null) {
  return useQuery({
    queryKey: ['day-question', startedAt, date, questionId],
    queryFn: async (): Promise<{ id: number; text: string } | null> => {
      if (isMock() || !supabase) {
        return { id: questionId ?? questionDayIndex(startedAt, date), text: MOCK_QUESTION_TEXT };
      }
      if (questionId !== null) {
        const { data, error } = await supabase
          .from('questions')
          .select('id, text')
          .eq('id', questionId)
          .maybeSingle();
        if (error) throw error;
        if (data) return data;
      }
      const { data, error } = await supabase
        .from('questions')
        .select('id, text')
        .eq('day_index', questionDayIndex(startedAt, date))
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
  /** 한 줄 일기 남긴 사람 수 (타임라인 '오늘' 행 표기용) */
  noteCount: number;
}

/**
 * 타임라인 '오늘 기록' 요약. 사진만 있는 날도 행은 표시한다 —
 * 사진은 자유 요소라 잔디 인정(기분·질문 답)과는 별개지만, 기록 자체는 남기 때문.
 */
export function useDailyTimeline(coupleId: string | undefined, entryDate: string) {
  return useQuery({
    queryKey: ['daily-timeline', coupleId, entryDate],
    queryFn: async (): Promise<DailyDaySummary[]> => {
      if (isMock()) {
        // 검증용 확충 (2026-07-24) — 사진만 있는 날·기분만 있는 날 등 조합을 골고루
        return [
          { date: '2026-07-23', photoCount: 4, moods: ['😊', '🥰'], answeredCount: 2, noteCount: 2 },
          { date: '2026-07-22', photoCount: 0, moods: ['😴'], answeredCount: 1, noteCount: 1 },
          { date: '2026-07-20', photoCount: 2, moods: ['🥰', '😆'], answeredCount: 2, noteCount: 1 },
          { date: '2026-07-18', photoCount: 5, moods: ['😊'], answeredCount: 1, noteCount: 2 },
          { date: '2026-07-15', photoCount: 1, moods: [], answeredCount: 0, noteCount: 1 },
          { date: '2026-07-13', photoCount: 1, moods: ['😴'], answeredCount: 1, noteCount: 1 },
          { date: '2026-07-10', photoCount: 3, moods: ['😆', '😊'], answeredCount: 2, noteCount: 2 },
          { date: '2026-07-06', photoCount: 0, moods: ['🥲'], answeredCount: 1, noteCount: 0 },
        ];
      }
      if (!supabase || !coupleId) return [];
      const from = daysAgo(entryDate, 61);
      const [{ data: entries, error }, { data: photoRows, error: photoError }] = await Promise.all([
        supabase
          .from('daily_entries_unlocked')
          .select('id, entry_date, mood, has_answer, note')
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
      for (const e of (entries ?? []) as { id: string; entry_date: string; mood: string | null; has_answer: boolean; note: string | null }[]) {
        const s = byDate.get(e.entry_date) ?? { date: e.entry_date, photoCount: 0, moods: [], answeredCount: 0, noteCount: 0 };
        s.photoCount += photoCountByEntry.get(e.id) ?? 0;
        if (e.mood) s.moods.push(e.mood);
        if (e.has_answer) s.answeredCount += 1;
        if (e.note) s.noteCount += 1;
        byDate.set(e.entry_date, s);
      }
      return [...byDate.values()].filter(
        (s) => s.photoCount + s.moods.length + s.answeredCount + s.noteCount > 0,
      );
    },
  });
}

const MOCK_GRASS_FILLED = [1, 2, 3, 5, 6, 8, 11, 12, 13, 14, 15, 17, 18];
const MOCK_GRASS_HALF = [4, 9, 16];
/** 지난달 패턴 — 월 이동 데모에서도 잔디가 이어져 보이게 (2026-07-24 검증용 확충) */
const MOCK_PREV_FILLED = [2, 3, 5, 7, 8, 10, 12, 14, 16, 19, 20, 22, 25, 26, 28];
const MOCK_PREV_HALF = [6, 13, 21];

/** 현재 월의 직전 (년, 월) — 1월이면 작년 12월 */
function prevYearMonth(year: number, month: number): [number, number] {
  return month === 1 ? [year - 1, 12] : [year, month - 1];
}

/** 목 잔디: 현재 월 + 지난달을 채워 둔다 (그 이전 달은 빈 그리드) */
function mockGrassMonth(year: number, month: number): GrassDay[] {
  const now = new Date();
  const [py, pm] = prevYearMonth(now.getFullYear(), now.getMonth() + 1);
  if (year === py && month === pm) {
    return [
      ...MOCK_PREV_FILLED.map((d) => ({
        date: toDateString(new Date(year, month - 1, d)),
        level: 'both' as const,
      })),
      ...MOCK_PREV_HALF.map((d) => ({
        date: toDateString(new Date(year, month - 1, d)),
        level: 'one' as const,
      })),
    ];
  }
  if (year !== now.getFullYear() || month !== now.getMonth() + 1) return [];
  const days: GrassDay[] = [
    ...MOCK_GRASS_FILLED.map((d) => ({
      date: toDateString(new Date(year, month - 1, d)),
      level: 'both' as const,
    })),
    ...MOCK_GRASS_HALF.map((d) => ({
      date: toDateString(new Date(year, month - 1, d)),
      level: 'one' as const,
    })),
  ];
  // 데모 일관성: 오늘 카드가 '저장 후' 상태이므로 오늘(같은 달의 어제 포함)도 채워 보여준다
  const today = now.getDate();
  for (const d of [today - 1, today]) {
    if (d >= 1 && !MOCK_GRASS_FILLED.includes(d) && !MOCK_GRASS_HALF.includes(d)) {
      days.push({ date: toDateString(new Date(year, month - 1, d)), level: 'both' });
    }
  }
  return days;
}

/**
 * 기간 내 일자별 참여 현황.
 * 참여 인정 = 기분·질문 답·한 줄 일기 중 1+ — 사진은 자유 요소라 인정하지 않는다.
 * (사진 상호 잠금 규칙과는 무관 — 잠금은 RLS가 계속 강제한다.)
 */
async function fetchParticipation(from: string, to: string): Promise<GrassDay[]> {
  if (!supabase) return [];
  const { data: entries, error } = await supabase
    .from('daily_entries_unlocked')
    .select('user_id, entry_date, mood, has_answer, note')
    .gte('entry_date', from)
    .lte('entry_date', to);
  if (error) throw error;
  const byDate = new Map<string, Set<string>>();
  const rows = (entries ?? []) as Pick<DailyEntry, 'user_id' | 'entry_date' | 'mood' | 'has_answer' | 'note'>[];
  for (const e of rows) {
    const participated = e.mood !== null || e.has_answer || e.note !== null;
    if (!participated) continue;
    if (!byDate.has(e.entry_date)) byDate.set(e.entry_date, new Set());
    byDate.get(e.entry_date)!.add(e.user_id);
  }
  return [...byDate.entries()].map(([date, users]) => ({
    date,
    level: users.size >= 2 ? 'both' : 'one',
  }));
}

/** 잔디 데이터: 해당 월(1일~말일)의 참여 현황 — 월 네비게이션 단위 조회 */
export function useGrass(coupleId: string | undefined, year: number, month: number) {
  return useQuery({
    queryKey: ['grass', coupleId, year, month],
    queryFn: async (): Promise<GrassDay[]> => {
      if (isMock() || !supabase || !coupleId) {
        return isMock() ? mockGrassMonth(year, month) : [];
      }
      const from = toDateString(new Date(year, month - 1, 1));
      const to = toDateString(new Date(year, month, 0));
      return fetchParticipation(from, to);
    },
  });
}

/** 스트릭 계산용: 최근 62일 참여 현황 (잔디 월 조회와 분리 — 월을 넘겨봐도 스트릭은 그대로) */
export function useStreakDays(coupleId: string | undefined, entryDate: string) {
  return useQuery({
    queryKey: ['streak', coupleId, entryDate],
    queryFn: async (): Promise<GrassDay[]> => {
      if (isMock() || !supabase || !coupleId) {
        const now = new Date();
        return isMock() ? mockGrassMonth(now.getFullYear(), now.getMonth() + 1) : [];
      }
      return fetchParticipation(daysAgo(entryDate, 61), entryDate);
    },
  });
}

// ── 잔디 상세 (잔디 칸 탭 → 그날 보기) ──────────────────────────

export interface DayDetail {
  myEntry: DailyEntry | null;
  partnerEntry: DailyEntry | null;
  /** RLS가 상호 잠금을 강제 — 잠긴 짝꿍 사진은 행 자체가 오지 않는다 */
  photos: DailyPhoto[];
  isLoading: boolean;
}

/**
 * 목 오늘 사진 — 미리보기(?mock=1)에서 사진 그리드가 비어 "2/30장인데 썸네일이 없는"
 * 어색함을 없앤다. 기록 목사진과 같은 그라데이션 생성 방식. 첫 장에만 위치 태그를 줘서
 * '핀으로 승격' 버튼까지 데모된다.
 */
const MOCK_DAILY_SPECS: Record<'me' | 'partner', { a: string; b: string; lat: number | null; lng: number | null }[]> = {
  me: [
    { a: '#f7b267', b: '#e8637c', lat: 37.5556, lng: 126.8958 }, // 망원 노을 산책
    { a: '#9ec3d8', b: '#54748c', lat: null, lng: null },
  ],
  partner: [
    { a: '#8cab68', b: '#3c5c33', lat: null, lng: null },
    { a: '#c9a6e0', b: '#f4a6c0', lat: null, lng: null },
  ],
};

const mockDailyCache: Partial<Record<'me' | 'partner', DailyPhoto[]>> = {};

export function mockDailyPhotos(who: 'me' | 'partner'): DailyPhoto[] {
  const cached = mockDailyCache[who];
  if (cached) return cached;
  const made = MOCK_DAILY_SPECS[who].map((sp, i) => {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 900;
    const x = c.getContext('2d');
    if (x) {
      const g = x.createLinearGradient(0, 0, 900, 900);
      g.addColorStop(0, sp.a);
      g.addColorStop(1, sp.b);
      x.fillStyle = g;
      x.fillRect(0, 0, 900, 900);
      x.globalAlpha = 0.25;
      for (let k = 0; k < 7; k++) {
        x.beginPath();
        x.arc((k * 211 + i * 97) % 900, (k * 157 + i * 131) % 900, 60 + ((k * 53 + i * 29) % 120), 0, Math.PI * 2);
        x.fillStyle = k % 2 ? '#ffffff' : '#00000033';
        x.fill();
      }
    }
    return {
      id: `mock-daily-${who}-${i}`,
      entry_id: who === 'me' ? 'mock-me' : 'mock-partner',
      storage_path: '',
      lat: sp.lat,
      lng: sp.lng,
      signedUrl: c.toDataURL('image/jpeg', 0.8),
    };
  });
  mockDailyCache[who] = made;
  return made;
}

/** 목: 둘 다 참여를 마친 날의 엔트리 쌍 — 오늘 카드(저장 후 상태)와 잔디 상세 데모 겸용 */
export function mockTodayPair(date: string): { myEntry: DailyEntry; partnerEntry: DailyEntry } {
  const base = { couple_id: 'mock-couple', entry_date: date, question_id: 1 };
  return {
    myEntry: {
      ...base,
      id: 'mock-me',
      user_id: 'mock-me',
      mood: '😊',
      answer: '같이 걷던 골목이 제일 좋았어',
      has_answer: true,
      note: '퇴근길 하늘이 예뻐서 네 생각 났어',
    },
    partnerEntry: {
      ...base,
      id: 'mock-partner',
      user_id: 'mock-partner',
      mood: '🥰',
      answer: '네가 크게 웃던 순간!',
      has_answer: true,
      note: '오늘은 왠지 하루가 짧았다',
    },
  };
}

/** 한 명만 참여한 날: 짝꿍만 답해서 내 쪽에선 잠겨 있는 상태를 보여준다 */
function mockPartnerOnly(date: string): { myEntry: null; partnerEntry: DailyEntry } {
  return {
    myEntry: null,
    partnerEntry: {
      couple_id: 'mock-couple',
      entry_date: date,
      question_id: 1,
      id: 'mock-partner',
      user_id: 'mock-partner',
      mood: '😴',
      answer: null,
      has_answer: true,
      note: '조금 피곤했던 하루',
    },
  };
}

/** 목 상세: 잔디 목데이터와 같은 날짜(현재 월 + 지난달)만 채워서 시트 데모가 이어지게 */
function mockDayDetail(date: string): { myEntry: DailyEntry | null; partnerEntry: DailyEntry | null } {
  const now = new Date();
  const [y, m, d] = date.split('-').map(Number);
  const currentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
  const today = now.getDate();
  if (currentMonth && !MOCK_GRASS_HALF.includes(d) && (MOCK_GRASS_FILLED.includes(d) || d === today || d === today - 1)) {
    return mockTodayPair(date);
  }
  if (currentMonth && MOCK_GRASS_HALF.includes(d)) return mockPartnerOnly(date);
  const [py, pm] = prevYearMonth(now.getFullYear(), now.getMonth() + 1);
  if (y === py && m === pm) {
    if (MOCK_PREV_FILLED.includes(d)) return mockTodayPair(date);
    if (MOCK_PREV_HALF.includes(d)) return mockPartnerOnly(date);
  }
  return { myEntry: null, partnerEntry: null };
}

/** 그날 상세: 두 사람 엔트리(뷰 — 답 잠금 자동) + 사진(RLS — 잠금 자동) */
export function useDayDetail(
  coupleId: string | undefined,
  userId: string | undefined,
  date: string,
): DayDetail {
  const entriesQuery = useDailyEntries(coupleId, date);
  const entries = entriesQuery.data ?? [];
  const photosQuery = useDailyPhotos(entries.map((e) => e.id));
  if (isMock()) {
    return { ...mockDayDetail(date), photos: [], isLoading: false };
  }
  return {
    myEntry: entries.find((e) => e.user_id === userId) ?? null,
    partnerEntry: entries.find((e) => e.user_id !== userId) ?? null,
    photos: photosQuery.data ?? [],
    isLoading: entriesQuery.isLoading,
  };
}
