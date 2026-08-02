import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { prepareUpload } from '../../shared/lib/image';
import { supabase } from '../../shared/lib/supabase';
import { logActivity } from '../activity/useActivity';
import { notifyPartner } from '../push/notifyPartner';

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
  /** 스팟별 한마디 (백로그 §4, 0016) — 120자, 안 쓰면 null */
  note: string | null;
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

/**
 * ?mock=1 데모 데이터 — 검증용으로 실제 반년치 데이트를 흉내 낸다 (2026-07-24 확충).
 * 포인트: ①시군구 15곳 색칠(도화지·실지도) ②소금집 델리 재방문 → ×2 클러스터 뱃지
 * ③1박2일(부산)·2박3일(제주) 여행 ④커스텀 지출 카테고리('숙소') ⑤가고 싶어요 핀 3개
 * ⑥스팟별 한마디(0016) — 있는 스팟·없는 스팟을 섞어 둔다.
 * sigungu_code는 public/geo/sigungu.json의 코드 기준 (대전 중구=30140, 여수=12130).
 */
const MOCK_RECORDS: RecordRow[] = [
  {
    id: 'mock-15',
    date: '2026-08-15',
    memo: '여수 밤바다 들으면서 걷기로 약속',
    status: 'planned',
    spots: [
      { id: 'm15s1', seq: 1, name: '여수 낭만포차거리', lat: 34.7407, lng: 127.7382, sigungu_code: '12130', kakao_place_id: 'p-yeosu', note: null },
    ],
    expenses: [],
  },
  {
    id: 'mock-9',
    date: '2026-07-20',
    memo: '결국 또 왔다 소금집… 우리 단골 확정',
    status: 'visited',
    spots: [
      { id: 'm9s1', seq: 1, name: '소금집 델리', lat: 37.5561, lng: 126.9042, sigungu_code: '11440', kakao_place_id: 'p-deli', note: null },
    ],
    expenses: [{ id: 'm9e1', category: 'meal', amount: 31000, paid_by: 'mock-me' }],
  },
  {
    id: 'mock-3',
    date: '2026-07-19',
    memo: null,
    status: 'planned',
    spots: [
      { id: 'm3s1', seq: 1, name: '전주 한옥마을', lat: 35.8143, lng: 127.1522, sigungu_code: '52110', kakao_place_id: 'p-hanok', note: null },
    ],
    expenses: [],
  },
  {
    id: 'mock-4',
    date: '2026-07-18',
    memo: '성수 카페 웨이팅 40분… 그래도 서울숲 산책으로 만회',
    status: 'visited',
    spots: [
      { id: 'm4s1', seq: 1, name: '성수동 카페거리', lat: 37.5446, lng: 127.0559, sigungu_code: '11200', kakao_place_id: 'p-seongsu', note: '웨이팅 40분… 근데 크림 라떼는 인정' },
      { id: 'm4s2', seq: 2, name: '서울숲', lat: 37.5444, lng: 127.0374, sigungu_code: '11200', kakao_place_id: 'p-forest', note: '해 질 무렵 산책로가 최고, 여기 우리 코스 고정' },
    ],
    expenses: [
      { id: 'm4e1', category: 'meal', amount: 42000, paid_by: 'mock-partner' },
      { id: 'm4e2', category: 'cafe', amount: 18000, paid_by: null },
    ],
  },
  {
    id: 'mock-1',
    date: '2026-07-12',
    memo: '한강 보고 걷다가 발견한 집, 또 가자고 약속함',
    status: 'visited',
    spots: [
      { id: 'm1s1', seq: 1, name: '망원한강공원', lat: 37.5556, lng: 126.8958, sigungu_code: '11440', kakao_place_id: 'p-hangang', note: null },
      { id: 'm1s2', seq: 2, name: '소금집 델리', lat: 37.5561, lng: 126.9042, sigungu_code: '11440', kakao_place_id: 'p-deli', note: '창가 자리 앉아서 두 시간 수다 떨었다' },
    ],
    expenses: [
      { id: 'm1e1', category: 'meal', amount: 34000, paid_by: 'mock-me' },
      { id: 'm1e2', category: 'cafe', amount: 11000, paid_by: 'mock-partner' },
    ],
  },
  {
    id: 'mock-5',
    date: '2026-07-05',
    memo: '한복 입고 경복궁! 사진 200장 찍음',
    status: 'visited',
    spots: [
      { id: 'm5s1', seq: 1, name: '경복궁', lat: 37.5796, lng: 126.977, sigungu_code: '11110', kakao_place_id: 'p-palace', note: '한복 빌려 입으면 입장료 무료! 다음에도 이렇게' },
      { id: 'm5s2', seq: 2, name: '삼청동 카페골목', lat: 37.5826, lng: 126.9816, sigungu_code: '11110', kakao_place_id: 'p-samcheong', note: null },
    ],
    expenses: [
      { id: 'm5e1', category: 'play', amount: 6000, paid_by: null },
      { id: 'm5e2', category: 'cafe', amount: 15000, paid_by: 'mock-me' },
    ],
  },
  {
    id: 'mock-2',
    date: '2026-06-28',
    memo: '춘천 당일치기! 닭갈비 정복',
    status: 'visited',
    spots: [
      { id: 'm2s1', seq: 1, name: '소양강 스카이워크', lat: 37.9219, lng: 127.6976, sigungu_code: '51110', kakao_place_id: 'p-sky', note: null },
    ],
    expenses: [{ id: 'm2e1', category: 'play', amount: 5000, paid_by: 'mock-partner' }],
  },
  {
    id: 'mock-6',
    date: '2026-06-14',
    memo: '비 오는 날엔 실내 데이트 — 별마당에서 책 고르다 두 시간',
    status: 'visited',
    spots: [
      { id: 'm6s1', seq: 1, name: '별마당도서관', lat: 37.5101, lng: 127.0605, sigungu_code: '11680', kakao_place_id: 'p-starfield', note: null },
      { id: 'm6s2', seq: 2, name: '봉은사', lat: 37.5148, lng: 127.0577, sigungu_code: '11680', kakao_place_id: 'p-bongeunsa', note: null },
    ],
    expenses: [
      { id: 'm6e1', category: 'meal', amount: 38000, paid_by: null },
      { id: 'm6e2', category: 'move', amount: 8000, paid_by: 'mock-me' },
    ],
  },
  {
    id: 'mock-10',
    date: '2026-05-24',
    memo: '가평 쁘띠프랑스 — 어린왕자 굿즈 참기 실패',
    status: 'visited',
    spots: [
      { id: 'm10s1', seq: 1, name: '쁘띠프랑스', lat: 37.7169, lng: 127.4907, sigungu_code: '41820', kakao_place_id: 'p-petite', note: null },
    ],
    expenses: [
      { id: 'm10e1', category: 'play', amount: 24000, paid_by: 'mock-partner' },
      { id: 'm10e2', category: 'gift', amount: 18000, paid_by: null },
    ],
  },
  {
    id: 'mock-8',
    date: '2026-05-06',
    memo: '둘째 날은 광안리 — 대교 야경 보면서 회 먹기 성공',
    status: 'visited',
    spots: [
      { id: 'm8s1', seq: 1, name: '광안리해수욕장', lat: 35.1532, lng: 129.1188, sigungu_code: '26500', kakao_place_id: 'p-gwangan', note: null },
    ],
    expenses: [{ id: 'm8e1', category: 'meal', amount: 61000, paid_by: 'mock-me' }],
  },
  {
    id: 'mock-7',
    date: '2026-05-05',
    memo: '첫 부산 여행 1일차! 해운대 → 더베이 불꽃 마무리',
    status: 'visited',
    spots: [
      { id: 'm7s1', seq: 1, name: '해운대해수욕장', lat: 35.1587, lng: 129.1604, sigungu_code: '26350', kakao_place_id: 'p-haeundae', note: null },
      { id: 'm7s2', seq: 2, name: '더베이101', lat: 35.1568, lng: 129.1522, sigungu_code: '26350', kakao_place_id: 'p-thebay', note: '불꽃 터지는 시간에 딱 맞춰 도착, 소름' },
    ],
    expenses: [
      { id: 'm7e1', category: 'meal', amount: 52000, paid_by: 'mock-partner' },
      { id: 'm7e2', category: '숙소', amount: 89000, paid_by: null },
    ],
  },
  {
    id: 'mock-11',
    date: '2026-04-11',
    memo: '영종도 드라이브 — 마시안해변 노을이 미쳤다',
    status: 'visited',
    spots: [
      { id: 'm11s1', seq: 1, name: '마시안해변', lat: 37.4423, lng: 126.3735, sigungu_code: '28155', kakao_place_id: 'p-masian', note: null },
    ],
    expenses: [
      { id: 'm11e1', category: 'cafe', amount: 21000, paid_by: 'mock-me' },
      { id: 'm11e2', category: 'move', amount: 12000, paid_by: 'mock-partner' },
    ],
  },
  {
    id: 'mock-12',
    date: '2026-04-04',
    memo: '여의도 벚꽃 — 사람 반 꽃 반이었지만 그래도 예뻤어',
    status: 'visited',
    spots: [
      { id: 'm12s1', seq: 1, name: '여의도한강공원', lat: 37.5285, lng: 126.9327, sigungu_code: '11560', kakao_place_id: 'p-yeouido', note: null },
    ],
    expenses: [{ id: 'm12e1', category: 'move', amount: 5600, paid_by: null }],
  },
  {
    id: 'mock-13',
    date: '2026-03-21',
    memo: '성심당 원정 — 튀소 4봉지 사서 기차에서 다 먹음',
    status: 'visited',
    spots: [
      { id: 'm13s1', seq: 1, name: '성심당 본점', lat: 36.3276, lng: 127.4273, sigungu_code: '30140', kakao_place_id: 'p-sungsimdang', note: '튀소는 뜨거울 때 먹어야 한다는 걸 배웠다' },
    ],
    expenses: [
      { id: 'm13e1', category: 'meal', amount: 24000, paid_by: 'mock-me' },
      { id: 'm13e2', category: 'move', amount: 47000, paid_by: 'mock-partner' },
    ],
  },
  {
    id: 'mock-14',
    date: '2026-03-01',
    memo: '경주 황리단길 — 한옥 카페에서 십원빵',
    status: 'visited',
    spots: [
      { id: 'm14s1', seq: 1, name: '황리단길', lat: 35.8375, lng: 129.2098, sigungu_code: '47130', kakao_place_id: 'p-hwangridan', note: null },
      { id: 'm14s2', seq: 2, name: '대릉원', lat: 35.8397, lng: 129.2117, sigungu_code: '47130', kakao_place_id: 'p-daereungwon', note: null },
    ],
    expenses: [
      { id: 'm14e1', category: 'cafe', amount: 16000, paid_by: null },
      { id: 'm14e2', category: 'play', amount: 6000, paid_by: 'mock-me' },
    ],
  },
  {
    id: 'mock-17',
    date: '2026-02-15',
    memo: '제주 2일차 — 성산일출봉 올라가서 소원 빌었다',
    status: 'visited',
    spots: [
      { id: 'm17s1', seq: 1, name: '성산일출봉', lat: 33.4587, lng: 126.9425, sigungu_code: '50130', kakao_place_id: 'p-seongsan', note: null },
      { id: 'm17s2', seq: 2, name: '섭지코지', lat: 33.424, lng: 126.9294, sigungu_code: '50130', kakao_place_id: 'p-seopjikoji', note: null },
    ],
    expenses: [
      { id: 'm17e1', category: 'play', amount: 10000, paid_by: 'mock-partner' },
      { id: 'm17e2', category: 'cafe', amount: 14000, paid_by: null },
    ],
  },
  {
    id: 'mock-16',
    date: '2026-02-14',
    memo: '발렌타인에 제주라니! 동문시장 야시장 털기',
    status: 'visited',
    spots: [
      { id: 'm16s1', seq: 1, name: '동문시장', lat: 33.5121, lng: 126.5279, sigungu_code: '50110', kakao_place_id: 'p-dongmun', note: null },
      { id: 'm16s2', seq: 2, name: '용두암', lat: 33.5163, lng: 126.5119, sigungu_code: '50110', kakao_place_id: 'p-yongduam', note: null },
    ],
    expenses: [
      { id: 'm16e1', category: 'meal', amount: 28000, paid_by: 'mock-me' },
      { id: 'm16e2', category: 'move', amount: 92000, paid_by: 'mock-partner' },
    ],
  },
  {
    id: 'mock-18',
    date: '2026-01-17',
    memo: '겨울 바다는 강릉이지 — 안목해변 커피거리',
    status: 'visited',
    spots: [
      { id: 'm18s1', seq: 1, name: '안목해변 커피거리', lat: 37.7724, lng: 128.9473, sigungu_code: '51150', kakao_place_id: 'p-anmok', note: null },
    ],
    expenses: [{ id: 'm18e1', category: 'cafe', amount: 13000, paid_by: null }],
  },
];

export function isMock() {
  return new URLSearchParams(window.location.search).has('mock');
}

/** 기록 조회 컬럼 — note는 0016 마이그레이션 이후에만 존재한다 */
const SPOT_COLS = 'id, seq, name, lat, lng, sigungu_code, kakao_place_id';
const recordSelect = (withNote: boolean) =>
  `id, date, memo, status, spots (${SPOT_COLS}${withNote ? ', note' : ''}), expenses (id, category, amount, paid_by)`;

/** 없는 컬럼을 고른 경우인가 (PostgREST 42703) — 마이그레이션 전 프로젝트 판별용 */
function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '');
}

export function useRecords() {
  return useQuery({
    queryKey: ['records'],
    queryFn: async (): Promise<RecordRow[]> => {
      if (isMock()) return MOCK_RECORDS;
      if (!supabase) return [];
      const sb = supabase;
      const run = (withNote: boolean) =>
        sb
          .from('records')
          .select(recordSelect(withNote))
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });

      const { data, error } = await run(true);
      if (!error) return data as unknown as RecordRow[];
      // 0016(spots.note)을 아직 적용하지 않은 프로젝트 — 한마디 없이라도 기록은 보여야 한다.
      //   이 방어가 없으면 컬럼 하나 때문에 지도·타임라인이 통째로 비어 버린다.
      if (!isMissingColumn(error)) throw error;
      const retry = await run(false);
      if (retry.error) throw retry.error;
      type LegacyRow = Omit<RecordRow, 'spots'> & { spots: Omit<SpotRow, 'note'>[] };
      return (retry.data as unknown as LegacyRow[]).map((r) => ({
        ...r,
        spots: r.spots.map((sp) => ({ ...sp, note: null })),
      }));
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
  /**
   * 스팟별 한마디 (선택, 0016).
   * null/undefined = 입력칸을 접어 둔 상태, '' = 열어 두고 비운 상태 — 저장할 땐 둘 다 null.
   */
  note?: string | null;
}

/** 스팟 한마디 정리 — 공백만 남은 값은 저장하지 않는다 */
function spotNote(s: SpotDraft): string | null {
  return s.note?.trim() || null;
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
      note: spotNote(s),
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
              note: spotNote(s),
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
    onSuccess: (recordId, draft) => {
      void queryClient.invalidateQueries({ queryKey: ['records'] });
      void queryClient.invalidateQueries({ queryKey: ['conquest'] });
      // 보관함 + 푸시 (푸시 여부는 서버 화이트리스트가 정한다)
      const spot = draft.spots[0]?.name?.trim();
      void logActivity(
        'record_create',
        draft.status === 'planned'
          ? `${spot ?? '새 장소'}, 가고 싶은 곳으로 콕 찍었어요`
          : `${spot ?? '새'} 데이트를 남겼어요`,
        { coupleId, targetId: recordId },
      );
      void notifyPartner('record_create');
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
      note: spotNote(s),
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
            note: spotNote(s),
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
      const spot = draft.spots[0]?.name?.trim();
      void logActivity('record_update', `${spot ?? draft.date} 기록을 고쳤어요`, {
        coupleId,
        targetId: draft.recordId,
      });
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
      // invalidate 전에 캐시에서 이름을 건진다 — 지운 뒤에는 서버에 물어볼 수 없다
      const gone = queryClient
        .getQueryData<RecordRow[]>(['records'])
        ?.find((r) => r.id === recordId);
      const label = gone?.spots[0]?.name?.trim() || gone?.date;
      void logActivity('record_delete', `${label ?? '기록'} 기록을 지웠어요`);
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

/**
 * ?mock=1 데모 사진 — 그라데이션+원으로 만든 가짜 사진 (외부 요청 없음).
 * 스팟 태그를 섞어 둬서 '사진 가득' 카드가 고른 사진의 장소를 따라가는지 눈으로 확인할 수 있다.
 */
const MOCK_PHOTO_SPECS: Record<string, { spot: string | null; a: string; b: string }[]> = {
  'mock-1': [
    { spot: 'm1s1', a: '#f7b267', b: '#e8637c' }, // 한강 노을
    { spot: 'm1s1', a: '#9ec3d8', b: '#54748c' },
    { spot: 'm1s2', a: '#e8d9b8', b: '#a3743d' }, // 델리
    { spot: null, a: '#c9a6e0', b: '#f4a6c0' },
  ],
  'mock-4': [
    { spot: 'm4s1', a: '#d9c7b3', b: '#6b4f3a' },
    { spot: 'm4s2', a: '#8cab68', b: '#3c5c33' },
  ],
};

function mockRecordPhotos(recordId: string): RecordPhoto[] {
  const specs = MOCK_PHOTO_SPECS[recordId] ?? [];
  return specs.map((sp, i) => {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 1200;
    const x = c.getContext('2d');
    if (x) {
      const g = x.createLinearGradient(0, 0, 900, 1200);
      g.addColorStop(0, sp.a);
      g.addColorStop(1, sp.b);
      x.fillStyle = g;
      x.fillRect(0, 0, 900, 1200);
      x.globalAlpha = 0.3;
      for (let k = 0; k < 8; k++) {
        x.beginPath();
        x.arc((k * 173 + i * 97) % 900, (k * 251 + i * 131) % 1200, 70 + ((k * 53 + i * 29) % 130), 0, Math.PI * 2);
        x.fillStyle = k % 2 ? '#ffffff' : '#00000033';
        x.fill();
      }
    }
    const url = c.toDataURL('image/jpeg', 0.8);
    return { id: `${recordId}-p${i}`, storage_path: '', seq: i + 1, spot_id: sp.spot, signedUrl: url };
  });
}

/** 기록 상세 사진 조회 — record_photos → storage signed URL. 목이면 데모 사진, 미연결이면 빈 배열 */
export function useRecordPhotos(recordId: string | undefined) {
  return useQuery({
    queryKey: ['record-photos', recordId],
    queryFn: async (): Promise<RecordPhoto[]> => {
      if (isMock()) return recordId ? mockRecordPhotos(recordId) : [];
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
    enabled: Boolean(recordId) && (isMock() || Boolean(supabase)),
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
/** 미리보기용 두 사람 — mockTodayPair의 user_id와 맞춰 둔다 */
export const MOCK_MEMBERS = [
  { user_id: 'mock-me', nickname: '체리' },
  { user_id: 'mock-partner', nickname: '두부' },
];

export function useCoupleMembers() {
  return useQuery({
    queryKey: ['couple-members'],
    queryFn: async (): Promise<{ user_id: string; nickname: string }[]> => {
      if (isMock()) return MOCK_MEMBERS;
      if (!supabase) return [];
      const { data, error } = await supabase.from('profiles').select('user_id, nickname');
      if (error) throw error;
      return data;
    },
    enabled: isMock() || supabase !== null,
  });
}
