import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { prepareUpload } from '../../shared/lib/image';
import { supabase } from '../../shared/lib/supabase';

export type ExpenseCategory = 'meal' | 'cafe' | 'play' | 'move' | 'gift';

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  meal: '밥',
  cafe: '카페',
  play: '놀이',
  move: '이동',
  gift: '선물',
};

export interface SpotRow {
  id: string;
  seq: number;
  name: string;
  lat: number | null;
  lng: number | null;
  sigungu_code: string | null;
  kakao_place_id: string | null;
}

export interface ExpenseRow {
  id: string;
  category: ExpenseCategory;
  amount: number;
  paid_by: string | null;
}

export interface RecordRow {
  id: string;
  date: string;
  memo: string | null;
  status: 'visited' | 'planned';
  spots: SpotRow[];
  expenses: ExpenseRow[];
}

const MOCK_RECORDS: RecordRow[] = [
  {
    id: 'mock-1',
    date: '2026-07-12',
    memo: '한강 보고 걷다가 발견한 집, 또 가자고 약속함',
    status: 'visited',
    spots: [
      { id: 'm1s1', seq: 1, name: '망원한강공원', lat: 37.5556, lng: 126.8958, sigungu_code: '11440', kakao_place_id: 'p-hangang' },
      { id: 'm1s2', seq: 2, name: '소금집 델리', lat: 37.5561, lng: 126.9042, sigungu_code: '11440', kakao_place_id: 'p-deli' },
    ],
    expenses: [
      { id: 'm1e1', category: 'meal', amount: 34000, paid_by: null },
      { id: 'm1e2', category: 'cafe', amount: 11000, paid_by: null },
    ],
  },
  {
    id: 'mock-2',
    date: '2026-06-28',
    memo: '춘천 당일치기! 닭갈비 정복',
    status: 'visited',
    spots: [
      { id: 'm2s1', seq: 1, name: '소양강 스카이워크', lat: 37.9219, lng: 127.6976, sigungu_code: '51110', kakao_place_id: 'p-sky' },
    ],
    expenses: [{ id: 'm2e1', category: 'play', amount: 5000, paid_by: null }],
  },
  {
    id: 'mock-3',
    date: '2026-07-19',
    memo: null,
    status: 'planned',
    spots: [
      { id: 'm3s1', seq: 1, name: '전주 한옥마을', lat: 35.8143, lng: 127.1522, sigungu_code: '52110', kakao_place_id: 'p-hanok' },
    ],
    expenses: [],
  },
];

function isMock() {
  return new URLSearchParams(window.location.search).has('mock');
}

export function useRecords() {
  return useQuery({
    queryKey: ['records'],
    queryFn: async (): Promise<RecordRow[]> => {
      if (isMock()) return MOCK_RECORDS;
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('records')
        .select(
          'id, date, memo, status, spots (id, seq, name, lat, lng, sigungu_code, kakao_place_id), expenses (id, category, amount, paid_by)',
        )
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as RecordRow[];
    },
  });
}

/** 동일 장소(kakao_place_id) 방문 횟수 — 클러스터 ×N 뱃지용 (명세 §3.1 재방문 ①) */
export function placeVisitCounts(records: RecordRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of records) {
    if (r.status !== 'visited') continue;
    for (const s of r.spots) {
      if (s.kakao_place_id) counts[s.kakao_place_id] = (counts[s.kakao_place_id] ?? 0) + 1;
    }
  }
  return counts;
}

export interface SpotDraft {
  name: string;
  lat: number | null;
  lng: number | null;
  sigunguCode: string | null;
  kakaoPlaceId: string | null;
}

export interface ExpenseDraft {
  amount: number;
  category: ExpenseCategory;
  paidBy: string | null;
}

export interface RecordDraft {
  status: 'visited' | 'planned';
  date: string;
  memo: string;
  spots: SpotDraft[];
  expenses: ExpenseDraft[];
  /** 첨부 사진 (핀당 10장 무료 상한 — RLS 이중 방어) */
  photos: File[];
}

export function useCreateRecord(coupleId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: RecordDraft) => {
      if (!supabase || !coupleId) throw new Error('Supabase 연결 후 저장할 수 있어요');
      // v1: 클라이언트 순차 insert (원자성은 M1 후속 RPC로 — 실패 시 기록만 남고 재시도 가능)
      const { data: record, error } = await supabase
        .from('records')
        .insert({
          couple_id: coupleId,
          date: draft.date,
          memo: draft.memo.trim() || null,
          status: draft.status,
        })
        .select('id')
        .single();
      if (error) throw error;

      const { error: spotsError } = await supabase.from('spots').insert(
        draft.spots.map((s, i) => ({
          record_id: record.id,
          seq: i + 1,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          sigungu_code: s.sigunguCode,
          kakao_place_id: s.kakaoPlaceId,
        })),
      );
      if (spotsError) throw spotsError;

      if (draft.expenses.length > 0) {
        const { error: expensesError } = await supabase.from('expenses').insert(
          draft.expenses.map((e) => ({
            record_id: record.id,
            category: e.category,
            amount: e.amount,
            paid_by: e.paidBy,
          })),
        );
        if (expensesError) throw expensesError;
      }

      // 사진: 압축(EXIF 제거) → couples/{couple_id}/records/{record_id}/ 업로드
      for (const [i, file] of draft.photos.entries()) {
        const blob = await prepareUpload(file);
        const path = `couples/${coupleId}/records/${record.id}/${crypto.randomUUID()}.webp`;
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(path, blob, { contentType: 'image/webp' });
        if (uploadError) throw uploadError;
        const { error: photoError } = await supabase
          .from('record_photos')
          .insert({ record_id: record.id, storage_path: path, seq: i });
        if (photoError) throw photoError;
      }
      return record.id as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['records'] });
      void queryClient.invalidateQueries({ queryKey: ['conquest'] });
    },
  });
}

/** 기록 사진 행 + 표시용 signed URL (useDailyPhotos와 같은 패턴 — photos 버킷) */
export interface RecordPhoto {
  id: string;
  storage_path: string;
  seq: number;
  signedUrl?: string;
}

/** 기록 상세 사진 조회 — record_photos → storage signed URL. 목/미연결이면 빈 배열 (섹션 생략) */
export function useRecordPhotos(recordId: string | undefined) {
  return useQuery({
    queryKey: ['record-photos', recordId],
    queryFn: async (): Promise<RecordPhoto[]> => {
      if (!supabase || !recordId) return [];
      const { data, error } = await supabase
        .from('record_photos')
        .select('id, storage_path, seq')
        .eq('record_id', recordId)
        .order('seq');
      if (error) throw error;
      const rows = data as RecordPhoto[];
      if (rows.length === 0) return rows;
      const { data: signed, error: signError } = await supabase.storage
        .from('photos')
        .createSignedUrls(rows.map((r) => r.storage_path), 3600);
      if (signError) throw signError;
      return rows.map((r, i) => ({ ...r, signedUrl: signed[i]?.signedUrl ?? undefined }));
    },
    enabled: Boolean(supabase && recordId) && !isMock(),
  });
}

/** 회색 핀(가고 싶어요) → 다녀왔어요 전환 (명세 §3.1) — 지도 색칠·정복률에 바로 반영 */
export function useMarkVisited() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recordId: string) => {
      if (isMock()) return recordId; // 데모 모드: 캐시만 갱신 (onSuccess)
      if (!supabase) throw new Error('Supabase 연결 후 바꿀 수 있어요');
      const { error } = await supabase
        .from('records')
        .update({ status: 'visited' })
        .eq('id', recordId);
      if (error) throw error;
      return recordId;
    },
    onSuccess: (recordId) => {
      if (isMock()) {
        // invalidate하면 목데이터로 되돌아가므로 캐시를 직접 바꾼다
        queryClient.setQueryData<RecordRow[]>(['records'], (prev) =>
          prev?.map((r) => (r.id === recordId ? { ...r, status: 'visited' } : r)),
        );
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['records'] });
      void queryClient.invalidateQueries({ queryKey: ['conquest'] });
    },
  });
}

/** 커플 구성원 (지출 '낸 사람' 선택지) */
export function useCoupleMembers() {
  return useQuery({
    queryKey: ['couple-members'],
    queryFn: async (): Promise<{ user_id: string; nickname: string }[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase.from('profiles').select('user_id, nickname');
      if (error) throw error;
      return data;
    },
    enabled: supabase !== null && !isMock(),
  });
}
