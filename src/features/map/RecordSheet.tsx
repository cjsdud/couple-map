import { useRef, useState } from 'react';
import BottomSheet from '../../shared/ui/BottomSheet';
import { coordToRegion, searchPlaces, type KakaoPlace } from '../../shared/lib/kakao';
import { toDateString } from '../../shared/lib/daily';
import { supabase } from '../../shared/lib/supabase';
import {
  categoryLabel,
  isMock,
  PRESET_CATEGORIES,
  useCoupleMembers,
  useCreateRecord,
  useRecords,
  useUpdateRecord,
  type ExpenseCategory,
  type ExpenseDraft,
  type PhotoDraft,
  type RecordRow,
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
  /**
   * 수정 모드 — 있으면 분기 화면 없이 폼으로 직행하고 기존 값을 프리필한다.
   * 사진은 새로 추가만 가능 (기존 사진 관리는 상세 시트의 개별 지우기).
   */
  editRecord?: RecordRow;
}

const MAX_SPOTS = 5;
const MAX_PHOTOS = 10;

/**
 * 기록 작성 바텀시트 (명세 §3.1).
 * 첫 화면에서 다녀왔어요/가고 싶어요 선택 → 폼 안 세그먼트로 작성 중에도 전환 가능
 * (입력값 유지, 지출·사진은 가고 싶어요에서 숨김 — 저장 시에도 제외).
 */
export default function RecordSheet({ open, onClose, coupleId, initial, editRecord }: Props) {
  const [status, setStatus] = useState<'visited' | 'planned' | null>(null);
  const [date, setDate] = useState(() => toDateString(new Date()));
  const [memo, setMemo] = useState('');
  const [spots, setSpots] = useState<SpotDraft[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDraft[]>([]);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const createRecord = useCreateRecord(coupleId);
  const updateRecord = useUpdateRecord(coupleId);
  const mutation = editRecord ? updateRecord : createRecord;

  // 열릴 때 프리필 적용 (수정 모드: 기존 값 전체 / 핀 승격: 오늘 사진 위치 → 스팟 + 사진 동반)
  const [appliedOpen, setAppliedOpen] = useState(false);
  if (open && !appliedOpen) {
    setAppliedOpen(true);
    if (editRecord) {
      setStatus(editRecord.status);
      setDate(editRecord.date);
      setMemo(editRecord.memo ?? '');
      setSpots(
        editRecord.spots
          .slice()
          .sort((a, b) => a.seq - b.seq)
          .map((s) => ({
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            sigunguCode: s.sigungu_code,
            kakaoPlaceId: s.kakao_place_id,
          })),
      );
      setExpenses(
        editRecord.expenses.map((e) => ({ amount: e.amount, category: e.category, paidBy: e.paid_by })),
      );
    } else if (initial) {
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
    updateRecord.reset();
  };
  const close = () => {
    reset();
    onClose();
  };

  // 수정은 ?mock=1에서도 캐시로 동작 (useUpdateRecord의 목 처리) — 새 기록은 연결 필요
  const canSave =
    status !== null &&
    spots.length >= 1 &&
    (editRecord ? isMock() || Boolean(supabase) : Boolean(supabase) && Boolean(coupleId));

  const save = () => {
    if (!status || mutation.isPending) return;
    // 가고 싶어요로 저장할 땐 숨겨 둔 지출·사진은 보내지 않는다 (토글로 되돌리면 입력값은 그대로)
    const draft = {
      status,
      date,
      memo,
      spots,
      expenses: status === 'visited' ? expenses : [],
      photos: status === 'visited' ? photos : [],
    };
    if (editRecord) {
      updateRecord.mutate({ recordId: editRecord.id, ...draft }, { onSuccess: close });
    } else {
      createRecord.mutate(draft, { onSuccess: close });
    }
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
            <p className="mt-1 break-keep text-sm opacity-60">지도에 콕 — 이 동네가 우리 색으로 칠해져요</p>
          </button>
          <button
            type="button"
            onClick={() => setStatus('planned')}
            className="w-full rounded-2xl rounded-br-md border-2 border-ink/15 bg-white/70 p-5 text-left active:translate-y-px"
          >
            <p className="text-base font-bold">가고 싶어요</p>
            <p className="mt-1 break-keep text-sm opacity-60">회색 핀으로 저장해 두고, 다녀오면 색이 칠해져요</p>
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
          {/* 작성 중에도 전환 가능한 세그먼트 — 입력값은 유지, 지출·사진은 가고 싶어요에서 숨김(보존) */}
          <div className="space-y-3">
            <h2 className="pr-10 text-lg font-bold">{editRecord ? '기록 수정하기' : '새 기록'}</h2>
            <div className="flex rounded-full border border-ink/15 bg-white/60 p-0.5 text-sm">
              <button
                type="button"
                aria-pressed={status === 'visited'}
                onClick={() => setStatus('visited')}
                className={`flex-1 rounded-full py-2 ${
                  status === 'visited' ? 'bg-pink font-bold text-white' : 'font-semibold opacity-60'
                }`}
              >
                다녀왔어요
              </button>
              <button
                type="button"
                aria-pressed={status === 'planned'}
                onClick={() => setStatus('planned')}
                className={`flex-1 rounded-full py-2 ${
                  status === 'planned' ? 'bg-ink font-bold text-paper' : 'font-semibold opacity-60'
                }`}
              >
                가고 싶어요
              </button>
            </div>
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

          <SpotEditor spots={spots} onChange={setSpots} status={status} />

          {status === 'visited' && (
            <div className="space-y-1">
              <PhotoPicker photos={photos} spots={spots} onChange={setPhotos} />
              {editRecord && (
                <p className="break-keep text-xs opacity-50">
                  여기서는 새 사진만 더할 수 있어요 — 이미 넣은 사진은 기록을 열어서 지울 수 있어요
                </p>
              )}
            </div>
          )}

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">한 줄 메모</span>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={80}
              placeholder={status === 'visited' ? '오늘 어땠는지 한 줄로!' : '왜 가고 싶은지 한 줄로!'}
              className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink"
            />
          </label>

          {status === 'visited' && <ExpenseEditor expenses={expenses} onChange={setExpenses} />}

          {mutation.isError && (
            <p className="text-sm text-pink">
              저장하다가 문제가 생겼어요. 다시 한 번 해 주세요.
            </p>
          )}
          {!supabase &&
            (editRecord && isMock() ? (
              <p className="text-sm opacity-50">미리보기라서 수정한 내용은 이 화면에서만 보여요</p>
            ) : (
              <p className="text-sm opacity-50">미리보기라서 아직 저장은 안 돼요</p>
            ))}
          <button
            type="submit"
            disabled={!canSave || mutation.isPending}
            className="w-full rounded-2xl rounded-tl-md bg-pink px-6 py-3.5 text-base font-bold text-white shadow-sm active:translate-y-px disabled:opacity-40"
          >
            {mutation.isPending
              ? editRecord
                ? '저장하는 중…'
                : '콕 찍는 중…'
              : editRecord
                ? '이대로 저장하기'
                : '도화지에 콕!'}
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
                <span className="min-w-0 flex-1 truncate">{p.file.name}</span>
                <button
                  type="button"
                  aria-label={`${p.file.name} 빼기`}
                  onClick={() => onChange(photos.filter((_, j) => j !== i))}
                  className="-my-1 -mr-1.5 shrink-0 p-1.5 opacity-40"
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
                    스팟 없이
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
function SpotEditor({
  spots,
  onChange,
  status,
}: {
  spots: SpotDraft[];
  onChange: (s: SpotDraft[]) => void;
  status: 'visited' | 'planned';
}) {
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
        스팟{' '}
        <span className="opacity-50">
          ({spots.length}/{MAX_SPOTS} · {status === 'visited' ? '함께 간 순서대로' : '가고 싶은 순서대로'})
        </span>
      </span>

      {spots.length > 0 && (
        <ol className="space-y-1.5">
          {spots.map((s, i) => (
            <li
              key={`${s.name}-${i}`}
              className="flex items-center gap-2 rounded-xl rounded-tl-sm border border-ink/10 bg-white/70 px-3 py-2 text-sm"
            >
              <span className="font-bold text-pink">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <button
                type="button"
                aria-label={`${s.name} 빼기`}
                onClick={() => onChange(spots.filter((_, j) => j !== i))}
                className="-my-1.5 -mr-1.5 shrink-0 p-1.5 opacity-40"
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
          {results.length === 0 && (
            <li className="px-2 py-1.5 text-sm opacity-50">
              검색 결과가 없어요 — 다른 이름으로 찾아볼까요?
            </li>
          )}
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => addPlace(p)}
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm active:bg-ink/5"
              >
                <p className="truncate font-semibold">{p.placeName}</p>
                <p className="truncate text-xs opacity-50">{p.roadAddressName || p.addressName}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 지출 입력 (기본 5종 + 직접 추가, 다건, 10초 이내 입력 목표) ────
function ExpenseEditor({
  expenses,
  onChange,
}: {
  expenses: ExpenseDraft[];
  onChange: (e: ExpenseDraft[]) => void;
}) {
  const members = useCoupleMembers();
  const { data: records = [] } = useRecords();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('meal');
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState('');

  // 우리 커플이 전에 쓴 커스텀 카테고리 + 방금 만든 것(선택 상태)도 칩으로
  const customUsed = [
    ...new Set(
      [...records.flatMap((r) => r.expenses.map((e) => e.category)), ...expenses.map((e) => e.category), category].filter(
        (c) => !(PRESET_CATEGORIES as readonly string[]).includes(c),
      ),
    ),
  ];

  const parsed = Number(amount.replace(/[^0-9]/g, ''));
  const add = () => {
    if (!parsed) return;
    onChange([...expenses, { amount: parsed, category, paidBy }]);
    setAmount('');
  };

  const addCustom = () => {
    const name = customDraft.trim();
    if (!name || name.length > 8) return;
    setCategory(name);
    setCustomDraft('');
    setCustomOpen(false);
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
              <span className="max-w-24 truncate rounded-full bg-yellow/40 px-2 py-0.5 text-xs">{categoryLabel(e.category)}</span>
              <span className="flex-1">{e.amount.toLocaleString()}원</span>
              <button
                type="button"
                aria-label="지출 빼기"
                onClick={() => onChange(expenses.filter((_, j) => j !== i))}
                className="-my-1.5 -mr-1.5 shrink-0 p-1.5 opacity-40"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {[...PRESET_CATEGORIES, ...customUsed].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`max-w-28 truncate rounded-full px-3 py-1.5 text-sm ${
              category === c ? 'bg-green font-bold text-white' : 'border border-ink/15 bg-white/60'
            }`}
          >
            {categoryLabel(c)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-sm ${
            customOpen ? 'bg-ink text-paper' : 'border border-dashed border-ink/25 bg-white/60'
          }`}
        >
          + 직접
        </button>
      </div>
      {customOpen && (
        <div className="flex gap-2">
          <input
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            maxLength={8}
            placeholder="카테고리 이름 (8자까지)"
            className="min-w-0 flex-1 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!customDraft.trim()}
            className="shrink-0 rounded-2xl rounded-br-md bg-sky px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-40"
          >
            만들기
          </button>
        </div>
      )}
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
