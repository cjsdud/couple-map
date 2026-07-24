import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { prepareUpload } from '../../shared/lib/image';
import { supabase } from '../../shared/lib/supabase';

/** 기본 5종 + 자유 입력 허용 (사용자 결정, 0010 마이그레이션) — 커스텀은 입력한 텍스트 그대로 저장 */
export type ExpenseCategory = string;

export const PRESET_CATEGORIES = ['meal', 'cafe', 'play', 'move', 'gift'] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  meal: '밥',
  cafe: '카페',
  play: '놀이',
  move: '이동',
  gift: '선물',
};

/** 카테고리 표시명 — 기본 5종은 한글 라벨, 커스텀은 저장된 텍스트 그대로 */
export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category;
}

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

export function isMock() {
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
  /** 수정 모드에서 기존 스팟이면 DB id — diff 업데이트로 사진 태그를 보존한다 */
  id?: string | null;
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

/** 첨부 사진 초안 — spotIndex는 "어느 스팟에서 찍었는지" 선택 태그 (미지정 허용, plan-multi-region B안) */
export interface PhotoDraft {
  file: File;
  spotIndex: number | null;
}

export interface RecordDraft {
  status: 'visited' | 'planned';
  date: string;
  memo: string;
  spots: SpotDraft[];
  expenses: ExpenseDraft[];
  /** 첨부 사진 (핀당 10장 무료 상한 — RLS 이중 방어) */
  photos: PhotoDraft[];
}

/** save_record RPC(0012) 인자 — 스팟 배열 순서가 곧 seq */
function saveRecordArgs(recordId: string | null, draft: RecordDraft) {
  return {
    p_record_id: recordId,
    p_date: draft.date,
    p_memo: draft.memo.trim() || null,
    p_status: draft.status,
    p_spots: draft.spots.map((s) => ({
      id: s.id ?? null,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      sigungu_code: s.sigunguCode,
      kakao_place_id: s.kakaoPlaceId,
    })),
    p_expenses: draft.expenses.map((e) => ({
      category: e.category,
      amount: e.amount,
      paid_by: e.paidBy,
    })),
  };
}

/** save_record RPC 미적용(0012 마이그레이션 전) 판별 — 기존 순차 경로로 폴백 */
function isMissingRpc(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || (error.message ?? '').includes('save_record');
}

/** 기록 스팟 id 조회 — RPC 저장 후 사진 스팟 태그 매핑용 */
async function fetchSpotIdBySeq(recordId: string): Promise<Map<number, string>> {
  if (!supabase) return new Map();
  const { data, error } = await supabase.from('spots').select('id, seq').eq('record_id', recordId);
  if (error) throw error;
  return new Map((data ?? []).map((s) => [s.seq as number, s.id as string]));
}

/** 새 사진 업로드 — 압축(EXIF 제거) → couples/{couple_id}/records/{record_id}/ (+선택 스팟 태그) */
async function uploadNewPhotos(
  coupleId: string,
  recordId: string,
  photos: PhotoDraft[],
  spotIdBySeq: Map<number, string>,
  baseSeq: number,
) {
  if (!supabase) return;
  for (const [i, photo] of photos.entries()) {
    const blob = await prepareUpload(photo.file);
    const path = `couples/${coupleId}/records/${recordId}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(path, blob, { contentType: 'image/webp' });
    if (uploadError) throw uploadError;
    const { error: photoError } = await supabase.from('record_photos').insert({
      record_id: recordId,
      storage_path: path,
      seq: baseSeq + i,
      spot_id: photo.spotIndex !== null ? (spotIdBySeq.get(photo.spotIndex + 1) ?? null) : null,
    });
    if (photoError) throw photoError;
  }
}

export function useCreateRecord(coupleId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: RecordDraft) => {
      if (!supabase || !coupleId) throw new Error('Supabase 연결 후 저장할 수 있어요');
      // 원자 저장(save_record RPC, 0012) — 미적용 환경은 기존 순차 insert로 폴백
      let recordId: string;
      let spotIdBySeq: Map<number, string>;
      const { data: rid, error: rpcError } = await supabase.rpc(
        'save_record',
        saveRecordArgs(null, draft),
      );
      if (!rpcError) {
        recordId = rid as string;
        spotIdBySeq = await fetchSpotIdBySeq(recordId);
      } else if (isMissingRpc(rpcError)) {
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
        recordId = record.id as string;
        const { data: spotRows, error: spotsError } = await supabase
          .from('spots')
          .insert(
            draft.spots.map((s, i) => ({
              record_id: recordId,
              seq: i + 1,
              name: s.name,
              lat: s.lat,
              lng: s.lng,
              sigungu_code: s.sigunguCode,
              kakao_place_id: s.kakaoPlaceId,
            })),
          )
          .select('id, seq');
        if (spotsError) throw spotsError;
        spotIdBySeq = new Map((spotRows ?? []).map((s) => [s.seq as number, s.id as string]));

        if (draft.expenses.length > 0) {
          const { error: expensesError } = await supabase.from('expenses').insert(
            draft.expenses.map((e) => ({
              record_id: recordId,
              category: e.category,
              amount: e.amount,
              paid_by: e.paidBy,
            })),
          );
          if (expensesError) throw expensesError;
        }
      } else {
        throw rpcError;
      }

      await uploadNewPhotos(coupleId, recordId, draft.photos, spotIdBySeq, 0);
      return recordId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['records'] });
      void queryClient.invalidateQueries({ queryKey: ['conquest'] });
    },
  });
}

/** 수정 초안 — photos는 "새로 추가할 사진", removePhotos는 "지울 기존 사진" */
export interface RecordUpdateDraft extends RecordDraft {
  recordId: string;
  /** 수정 화면에서 뺀 기존 사진 (행 삭제 + 스토리지 원본 제거 시도) */
  removePhotos?: { id: string; storagePath: string }[];
}

/** ?mock=1 — 수정 초안을 캐시용 RecordRow로 변환 (invalidate하면 목데이터로 되돌아가므로) */
function mockUpdatedRow(prev: RecordRow, draft: RecordUpdateDraft): RecordRow {
  return {
    ...prev,
    date: draft.date,
    memo: draft.memo.trim() || null,
    status: draft.status,
    spots: draft.spots.map((s, i) => ({
      id: s.id ?? `${draft.recordId}-s${i + 1}`,
      seq: i + 1,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      sigungu_code: s.sigunguCode,
      kakao_place_id: s.kakaoPlaceId,
    })),
    expenses: draft.expenses.map((e, i) => ({
      id: `${draft.recordId}-e${i + 1}`,
      category: e.category,
      amount: e.amount,
      paid_by: e.paidBy,
    })),
  };
}

/**
 * 기록 수정 (명세 §3.1): 기록 필드(date·memo·status) update + 스팟은 diff 업데이트 + 지출은 재insert.
 * RLS의 records_all/spots_all/expenses_all `for all` 정책이 update·delete·insert를 모두 커버한다.
 * 스팟 diff: 유지 스팟은 id로 update(기존 사진의 spot_id 태그 보존), 빠진 것만 delete, 새것만 insert.
 */
export function useUpdateRecord(coupleId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: RecordUpdateDraft) => {
      if (isMock()) return draft; // 데모 모드: 캐시만 갱신 (onSuccess)
      if (!supabase) throw new Error('Supabase 연결 후 고칠 수 있어요');
      // 원자 저장(save_record RPC, 0012) — 미적용 환경은 기존 순차 경로로 폴백
      let spotIdBySeq: Map<number, string>;
      const { error: rpcError } = await supabase.rpc(
        'save_record',
        saveRecordArgs(draft.recordId, draft),
      );
      if (!rpcError) {
        spotIdBySeq = await fetchSpotIdBySeq(draft.recordId);
      } else if (isMissingRpc(rpcError)) {
        const { error } = await supabase
          .from('records')
          .update({
            date: draft.date,
            memo: draft.memo.trim() || null,
            status: draft.status,
          })
          .eq('id', draft.recordId);
        if (error) throw error;

        // 스팟 diff — 전삭제·재삽입은 record_photos.spot_id(on delete set null)를 풀어
        // 기존 사진의 스팟 태그가 사라지므로, 유지 스팟은 id로 update한다.
        const keptIds = draft.spots.map((s) => s.id).filter((v): v is string => Boolean(v));
        const { data: existingSpots, error: exSpotsError } = await supabase
          .from('spots')
          .select('id')
          .eq('record_id', draft.recordId);
        if (exSpotsError) throw exSpotsError;
        const dropIds = (existingSpots ?? [])
          .map((r) => r.id as string)
          .filter((id) => !keptIds.includes(id));
        if (dropIds.length > 0) {
          const { error: delSpotsError } = await supabase.from('spots').delete().in('id', dropIds);
          if (delSpotsError) throw delSpotsError;
        }
        // unique(record_id, seq) 임시 충돌 방지 — 유지 스팟을 높은 seq로 비켜 놓고(1-pass)
        // 정식 seq를 부여한다(2-pass). 신규 스팟은 2-pass에서 제자리 insert.
        for (const [i, s] of draft.spots.entries()) {
          if (!s.id) continue;
          const { error: parkError } = await supabase
            .from('spots')
            .update({ seq: 100 + i })
            .eq('id', s.id);
          if (parkError) throw parkError;
        }
        spotIdBySeq = new Map<number, string>();
        for (const [i, s] of draft.spots.entries()) {
          const seq = i + 1;
          const fields = {
            seq,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            sigungu_code: s.sigunguCode,
            kakao_place_id: s.kakaoPlaceId,
          };
          if (s.id) {
            const { error: upError } = await supabase.from('spots').update(fields).eq('id', s.id);
            if (upError) throw upError;
            spotIdBySeq.set(seq, s.id);
          } else {
            const { data: inserted, error: insError } = await supabase
              .from('spots')
              .insert({ record_id: draft.recordId, ...fields })
              .select('id')
              .single();
            if (insError) throw insError;
            spotIdBySeq.set(seq, inserted.id as string);
          }
        }

        const { error: delExpensesError } = await supabase
          .from('expenses')
          .delete()
          .eq('record_id', draft.recordId);
        if (delExpensesError) throw delExpensesError;
        if (draft.expenses.length > 0) {
          const { error: expensesError } = await supabase.from('expenses').insert(
            draft.expenses.map((e) => ({
              record_id: draft.recordId,
              category: e.category,
              amount: e.amount,
              paid_by: e.paidBy,
            })),
          );
          if (expensesError) throw expensesError;
        }
      } else {
        throw rpcError;
      }

      // 수정 화면에서 뺀 기존 사진 삭제 (행 → 스토리지 원본)
      if (draft.removePhotos?.length) {
        const ids = draft.removePhotos.map((p) => p.id);
        const { error: delPhotoError } = await supabase.from('record_photos').delete().in('id', ids);
        if (delPhotoError) throw delPhotoError;
        try {
          await supabase.storage.from('photos').remove(draft.removePhotos.map((p) => p.storagePath));
        } catch {
          // 행 삭제는 반영 — 원본 제거 실패는 무시 (후속 정리 배치)
        }
      }

      // 새 사진만 추가 업로드 — 기존 사진 뒤에 seq 이어붙임 (핀당 10장 상한은 RLS가 이중 방어)
      if (draft.photos.length > 0) {
        if (!coupleId) throw new Error('커플 연결 후 사진을 넣을 수 있어요');
        const { count } = await supabase
          .from('record_photos')
          .select('id', { count: 'exact', head: true })
          .eq('record_id', draft.recordId);
        await uploadNewPhotos(coupleId, draft.recordId, draft.photos, spotIdBySeq, count ?? 0);
      }
      return draft;
    },
    onSuccess: (draft) => {
      if (isMock()) {
        // invalidate하면 목데이터로 되돌아가므로 캐시를 직접 바꾼다 (useMarkVisited와 동일)
        queryClient.setQueryData<RecordRow[]>(['records'], (prev) =>
          prev?.map((r) => (r.id === draft.recordId ? mockUpdatedRow(r, draft) : r)),
        );
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['records'] });
      void queryClient.invalidateQueries({ queryKey: ['conquest'] });
      void queryClient.invalidateQueries({ queryKey: ['record-photos', draft.recordId] });
    },
  });
}

/**
 * 기록 사진 한 장 지우기 — record_photos 행 delete 후 storage 원본 제거 시도.
 * storage 제거가 실패해도 행 삭제는 유지한다 (잔존 파일은 후속 정리 배치 몫).
 */
export function useDeleteRecordPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (photo: { id: string; recordId: string; storagePath: string }) => {
      if (!supabase) throw new Error('Supabase 연결 후 지울 수 있어요');
      const { error } = await supabase.from('record_photos').delete().eq('id', photo.id);
      if (error) throw error;
      try {
        await supabase.storage.from('photos').remove([photo.storagePath]);
      } catch {
        // 행 삭제는 이미 반영 — 원본 제거 실패는 무시 (v1 수용)
      }
      return photo;
    },
    onSuccess: (photo) => {
      void queryClient.invalidateQueries({ queryKey: ['record-photos', photo.recordId] });
    },
  });
}

/**
 * 기록 지우기 — records delete 한 번이면 spots/expenses/record_photos 행은 cascade로 함께 삭제.
 * ⚠️ storage의 사진 원본(webp)은 잔존한다 — v1 수용 (후속: 서버 정리 배치).
 */
export function useDeleteRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recordId: string) => {
      if (isMock()) return recordId; // 데모 모드: 캐시만 갱신 (onSuccess)
      if (!supabase) throw new Error('Supabase 연결 후 지울 수 있어요');
      const { error } = await supabase.from('records').delete().eq('id', recordId);
      if (error) throw error;
      return recordId;
    },
    onSuccess: (recordId) => {
      if (isMock()) {
        queryClient.setQueryData<RecordRow[]>(['records'], (prev) =>
          prev?.filter((r) => r.id !== recordId),
        );
        return;
      }
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
  /** 스팟 태그 (선택) — 상세에서 스팟별 그룹핑 (plan-multi-region B안) */
  spot_id: string | null;
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
        .select('id, storage_path, seq, spot_id')
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
