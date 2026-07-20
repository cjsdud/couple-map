import { useRef, useState } from 'react';
import BottomSheet from '../../shared/ui/BottomSheet';
import { coordToRegion, searchPlaces, type KakaoPlace } from '../../shared/lib/kakao';
import { toDateString } from '../../shared/lib/daily';
import { supabase } from '../../shared/lib/supabase';
import {
  CATEGORY_LABEL,
  useCoupleMembers,
  useCreateRecord,
  type ExpenseCategory,
  type ExpenseDraft,
  type PhotoDraft,
  type SpotDraft,
} from './useRecords';

interface Props {
  open: boolean;
  onClose: () => void;
  coupleId: string | undefined;
  /** 핀 승격 등 프리필 진입 (열릴 때 1회 적용) */
  initial?: {
    status?: 'visited' | 'planned';
    date?: string;
    spots?: SpotDraft[];
    /** 핀 승격 시 오늘 사진을 기록 사진으로 함께 가져오기 */
    photos?: PhotoDraft[];
  };
}

const MAX_SPOTS = 5;
const MAX_PHOTOS = 10;
const CATEGORIES = Object.keys(CATEGORY_LABEL) as ExpenseCategory[];

/**
 * 기록 작성 바텀시트 (명세 §3.1).
 * 첫 단계에서 다녀왔어요/가고 싶어요 분기 → 스팟(1~5)·메모·지출 입력.
 * 사진 첨부는 M2 업로드 파이프라인 연동 후속.
 */
export default function RecordSheet({ open, onClose, coupleId, initial }: Props) {
  const [status, setStatus] = useState<'visited' | 'planned' | null>(null);
  const [date, setDate] = useState(() => toDateString(new Date()));
  const [memo, setMemo] = useState('');
  const [spots, setSpots] = useState<SpotDraft[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDraft[]>([]);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const createRecord = useCreateRecord(coupleId);

  // 열릴 때 프리필 적용 (핀 승격: 오늘 사진 위치 → 스팟 + 사진 동반)
  const [appliedOpen, setAppliedOpen] = useState(false);
  if (open && !appliedOpen) {
    setAppliedOpen(true);
    if (initial) {
      if (initial.status) setStatus(initial.status);
      if (initial.date) setDate(initial.date);
      if (initial.spots) setSpots(initial.spots);
      if (initial.photos) setPhotos(initial.photos);
    }
  }

  const reset = () => {
    setStatus(null);
    setDate(toDateString(new Date()));
    setMemo('');
    setSpots([]);
    setExpenses([]);
    setPhotos([]);
    setAppliedOpen(false);
    createRecord.reset();
  };
  const close = () => {
    reset();
    onClose();
  };

  const canSave = status !== null && spots.length >= 1 && Boolean(supabase) && Boolean(coupleId);

  const save = () => {
    if (!status || createRecord.isPending) return;
    createRecord.mutate(
      { status, date, memo, spots, expenses, photos },
      { onSuccess: close },
    );
  };

  return (
    <BottomSheet open={open} onClose={close} title={status === null ? '새 기록' : undefined}>
      {status === null ? (
        <div className="space-y-3 pb-2">
          <button
            type="button"
            onClick={() => setStatus('visited')}
            className="w-full rounded-2xl rounded-tl-md border-2 border-pink/40 bg-white/70 p-5 text-left active:translate-y-px"
          >
            <p className="text-base font-bold text-pink">다녀왔어요</p>
            <p className="mt-1 text-sm opacity-60">지도에 콕 — 이 동네가 우리 색으로 칠해져요</p>
          </button>
          <button
            type="button"
            onClick={() => setStatus('planned')}
            className="w-full rounded-2xl rounded-br-md border-2 border-ink/15 bg-white/70 p-5 text-left active:translate-y-px"
          >
            <p className="text-base font-bold">가고 싶어요</p>
            <p className="mt-1 text-sm opacity-60">회색 핀으로 저장해 두고, 다녀오면 색이 칠해져요</p>
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-5 pb-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">
              {status === 'visited' ? '다녀왔어요' : '가고 싶어요'}
            </h2>
            <button type="button" onClick={() => setStatus(null)} className="text-sm opacity-50">
              ← 분기 다시 고르기
            </button>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">{status === 'visited' ? '데이트한 날' : '기억해 둘 날'}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink"
            />
          </label>

          <SpotEditor spots={spots} onChange={setSpots} />

          {status === 'visited' && <PhotoPicker photos={photos} spots={spots} onChange={setPhotos} />}

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">한 줄 메모</span>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={80}
              placeholder="오늘 어땠는지 한 줄로!"
              className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink"
            />
          </label>

          {status === 'visited' && <ExpenseEditor expenses={expenses} onChange={setExpenses} />}

          {createRecord.isError && (
            <p className="text-sm text-pink">
              저장하다 문제가 있었어요. 다시 한 번 시도해 주세요.
            </p>
          )}
          {!supabase && (
            <p className="text-sm opacity-50">Supabase 연결 후 저장할 수 있어요 (데모 모드)</p>
          )}
          <button
            type="submit"
            disabled={!canSave || createRecord.isPending}
            className="w-full rounded-2xl rounded-tl-md bg-pink px-6 py-3.5 text-base font-bold text-white shadow-sm active:translate-y-px disabled:opacity-40"
          >
            {createRecord.isPending ? '콕 찍는 중…' : '도화지에 콕!'}
          </button>
        </form>
      )}
    </BottomSheet>
  );
}

// ── 사진 첨부 (핀당 10장, 업로드 시 압축·EXIF 제거) ──────────────
// 스팟 태그는 선택 사항 — 달면 상세에서 스팟별로 묶여 보인다 (plan-multi-region B안)
function PhotoPicker({
  photos,
  spots,
  onChange,
}: {
  photos: PhotoDraft[];
  spots: SpotDraft[];
  onChange: (f: PhotoDraft[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const setSpotIndex = (i: number, spotIndex: number | null) =>
    onChange(photos.map((p, j) => (j === i ? { ...p, spotIndex } : p)));
  return (
    <div className="space-y-2">
      <span className="text-sm font-semibold">
        사진 <span className="opacity-50">({photos.length}/{MAX_PHOTOS})</span>
      </span>
      {photos.length > 0 && (
        <ul className="space-y-1.5">
          {photos.map((p, i) => (
            <li key={`${p.file.name}-${i}`} className="space-y-1 rounded-xl rounded-tl-sm border border-ink/10 bg-white/70 px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <span aria-hidden>🖼️</span>
                <span className="flex-1 truncate">{p.file.name}</span>
                <button
                  type="button"
                  aria-label={`${p.file.name} 빼기`}
                  onClick={() => onChange(photos.filter((_, j) => j !== i))}
                  className="px-1 opacity-40"
                >
                  ✕
                </button>
              </div>
              {spots.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setSpotIndex(i, null)}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      p.spotIndex === null ? 'bg-ink text-paper' : 'border border-ink/15 opacity-60'
                    }`}
                  >
                    어디든
                  </button>
                  {spots.map((s, si) => (
                    <button
                      key={si}
                      type="button"
                      onClick={() => setSpotIndex(i, si)}
                      className={`max-w-28 truncate rounded-full px-2 py-0.5 text-[11px] ${
                        p.spotIndex === si ? 'bg-green font-bold text-white' : 'border border-ink/15 opacity-60'
                      }`}
                    >
                      {si + 1} {s.name}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])].map((file): PhotoDraft => ({ file, spotIndex: null }));
          onChange([...photos, ...picked].slice(0, MAX_PHOTOS));
          e.target.value = '';
        }}
      />
      {photos.length < MAX_PHOTOS && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-2xl rounded-tl-md border-2 border-dashed border-ink/20 bg-white/50 py-2.5 text-sm font-semibold"
        >
          📷 사진 고르기
        </button>
      )}
    </div>
  );
}

// ── 스팟 입력 (1~5개): 장소 검색 + 지금 여기 ─────────────────────
function SpotEditor({ spots, onChange }: { spots: SpotDraft[]; onChange: (s: SpotDraft[]) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KakaoPlace[] | null>(null);
  const [busy, setBusy] = useState<'search' | 'here' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const full = spots.length >= MAX_SPOTS;

  const runSearch = async () => {
    if (!query.trim() || busy) return;
    setBusy('search');
    setError(null);
    try {
      setResults(await searchPlaces(query.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const addPlace = (p: KakaoPlace) => {
    void (async () => {
      let sigunguCode: string | null = null;
      try {
        sigunguCode = (await coordToRegion(p.lng, p.lat)).sigunguCode;
      } catch {
        // 판정 실패해도 스팟 저장은 진행 (정복 색칠만 빠짐)
      }
      onChange([
        ...spots,
        { name: p.placeName, lat: p.lat, lng: p.lng, sigunguCode, kakaoPlaceId: p.id },
      ]);
      setResults(null);
      setQuery('');
    })();
  };

  const addHere = () => {
    if (busy) return;
    setBusy('here');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void (async () => {
          const { latitude: lat, longitude: lng } = pos.coords;
          try {
            const region = await coordToRegion(lng, lat);
            onChange([
              ...spots,
              { name: `지금 여기 (${region.sigunguName})`, lat, lng, sigunguCode: region.sigunguCode, kakaoPlaceId: null },
            ]);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(null);
          }
        })();
      },
      () => {
        setError('위치를 가져오지 못했어요. 장소 검색으로 넣어 주세요.');
        setBusy(null);
      },
      { timeout: 10000 },
    );
  };

  return (
    <div className="space-y-2">
      <span className="text-sm font-semibold">
        스팟 <span className="opacity-50">({spots.length}/{MAX_SPOTS} · 같은 날 코스 순서대로)</span>
      </span>

      {spots.length > 0 && (
        <ol className="space-y-1.5">
          {spots.map((s, i) => (
            <li
              key={`${s.name}-${i}`}
              className="flex items-center gap-2 rounded-xl rounded-tl-sm border border-ink/10 bg-white/70 px-3 py-2 text-sm"
            >
              <span className="font-bold text-pink">{i + 1}</span>
              <span className="flex-1 truncate">{s.name}</span>
              <button
                type="button"
                aria-label={`${s.name} 빼기`}
                onClick={() => onChange(spots.filter((_, j) => j !== i))}
                className="px-1 opacity-40"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      {!full && (
        <>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void runSearch();
                }
              }}
              placeholder="장소 이름으로 검색"
              className="min-w-0 flex-1 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink"
            />
            <button
              type="button"
              onClick={() => void runSearch()}
              disabled={busy !== null || !query.trim()}
              className="shrink-0 rounded-2xl rounded-br-md bg-sky px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-40"
            >
              {busy === 'search' ? '찾는 중…' : '검색'}
            </button>
          </div>
          <button
            type="button"
            onClick={addHere}
            disabled={busy !== null}
            className="w-full rounded-2xl rounded-tl-md border-2 border-dashed border-ink/20 bg-white/50 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            {busy === 'here' ? '위치 확인 중…' : '📍 지금 여기'}
          </button>
        </>
      )}

      {error && <p className="text-xs text-pink">{error}</p>}

      {results && (
        <ul className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-ink/10 bg-white/80 p-1.5">
          {results.length === 0 && <li className="px-2 py-1.5 text-sm opacity-50">검색 결과가 없어요</li>}
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => addPlace(p)}
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm active:bg-ink/5"
              >
                <p className="font-semibold">{p.placeName}</p>
                <p className="text-xs opacity-50">{p.roadAddressName || p.addressName}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 지출 입력 (카테고리 5 고정, 다건, 10초 이내 입력 목표) ────────
function ExpenseEditor({
  expenses,
  onChange,
}: {
  expenses: ExpenseDraft[];
  onChange: (e: ExpenseDraft[]) => void;
}) {
  const members = useCoupleMembers();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('meal');
  const [paidBy, setPaidBy] = useState<string | null>(null);

  const parsed = Number(amount.replace(/[^0-9]/g, ''));
  const add = () => {
    if (!parsed) return;
    onChange([...expenses, { amount: parsed, category, paidBy }]);
    setAmount('');
  };

  return (
    <div className="space-y-2">
      <span className="text-sm font-semibold">
        지출 <span className="opacity-50">(선택)</span>
      </span>

      {expenses.length > 0 && (
        <ul className="space-y-1.5">
          {expenses.map((e, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-xl rounded-tl-sm border border-ink/10 bg-white/70 px-3 py-2 text-sm"
            >
              <span className="rounded-full bg-yellow/40 px-2 py-0.5 text-xs">{CATEGORY_LABEL[e.category]}</span>
              <span className="flex-1">{e.amount.toLocaleString()}원</span>
              <button
                type="button"
                aria-label="지출 빼기"
                onClick={() => onChange(expenses.filter((_, j) => j !== i))}
                className="px-1 opacity-40"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              category === c ? 'bg-green font-bold text-white' : 'border border-ink/15 bg-white/60'
            }`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="금액 (원)"
          className="min-w-0 flex-1 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink"
        />
        <button
          type="button"
          onClick={add}
          disabled={!parsed}
          className="shrink-0 rounded-2xl rounded-br-md bg-green px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          담기
        </button>
      </div>
      {(members.data?.length ?? 0) > 0 && (
        <div className="flex items-center gap-1.5 text-sm">
          <span className="opacity-60">낸 사람:</span>
          <button
            type="button"
            onClick={() => setPaidBy(null)}
            className={`rounded-full px-2.5 py-1 ${paidBy === null ? 'bg-sky font-bold' : 'border border-ink/15'}`}
          >
            함께
          </button>
          {members.data?.map((m) => (
            <button
              key={m.user_id}
              type="button"
              onClick={() => setPaidBy(m.user_id)}
              className={`rounded-full px-2.5 py-1 ${paidBy === m.user_id ? 'bg-sky font-bold' : 'border border-ink/15'}`}
            >
              {m.nickname}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
