import { useRef, useState } from 'react';
import { calcStreak, monthGrid } from '../../shared/lib/daily';
import { coordToRegion } from '../../shared/lib/kakao';
import { paintDayCard } from '../../shared/lib/shareCard';
import { supabase } from '../../shared/lib/supabase';
import BottomSheet from '../../shared/ui/BottomSheet';
import PhotoViewer from '../../shared/ui/PhotoViewer';
import ShareCardSheet from '../../shared/ui/ShareCardSheet';
import RecordSheet from '../map/RecordSheet';
import type { PhotoDraft, SpotDraft } from '../map/useRecords';
import {
  isMock,
  mockTodayPair,
  useDailyEntries,
  useDailyPhotos,
  useDayDetail,
  useDayQuestion,
  useGrass,
  useQuestionOfDay,
  useSaveToday,
  useStreakDays,
  useTodayContext,
  useUploadPhoto,
  type DailyEntry,
  type DailyPhoto,
} from './useToday';

const MOODS = ['😊', '🥰', '😆', '😴', '😢', '😤'];
const DAILY_PHOTO_LIMIT = 30;

/** 오늘 탭: 통합 작성(기분·질문 답·한 줄 일기) · 사진(저장 후 자유) · 잔디 · 스트릭 (명세 §3.2) */
export default function TodayScreen() {
  const { userId, couple, entryDate } = useTodayContext();
  const entriesQuery = useDailyEntries(couple?.id, entryDate);
  const entries = entriesQuery.data ?? [];
  // ?mock=1 데모는 저장 후 상태로 보여준다 (⑥) — 작성 카드는 실계정 미참여 상태에서만
  const mockPair = isMock() ? mockTodayPair(entryDate) : null;
  const myEntry = mockPair?.myEntry ?? entries.find((e) => e.user_id === userId) ?? null;
  const partnerEntry = mockPair?.partnerEntry ?? entries.find((e) => e.user_id !== userId) ?? null;
  const photosQuery = useDailyPhotos(entries.map((e) => e.id));
  const photos = photosQuery.data ?? [];
  const myPhotos = myEntry ? photos.filter((p) => p.entry_id === myEntry.id) : [];
  const partnerPhotos = partnerEntry ? photos.filter((p) => p.entry_id === partnerEntry.id) : [];
  const unlocked = isMock() ? true : myPhotos.length > 0;

  // 참여 = 기분·질문 답·한 줄 일기 중 1+ (사진은 자유 요소 — 참여 인정과 무관)
  const participated = Boolean(
    myEntry && (myEntry.mood !== null || myEntry.has_answer || myEntry.note !== null),
  );

  const streakQuery = useStreakDays(couple?.id, entryDate);
  const streak = calcStreak(
    (streakQuery.data ?? []).map((g) => ({ date: g.date, bothFilled: g.level === 'both' })),
  );

  const ctx = { coupleId: couple?.id, userId, entryDate };

  // 잔디 칸 탭 → 그날 상세 시트 (새 화면 금지 — 시트로만 확장)
  const [detailDate, setDetailDate] = useState<string | null>(null);
  // 사진 크게 보기 (내/짝꿍/그날 상세 공용)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // 저장 후 수정: 같은 ComposeCard를 기존 값 프리필로 다시 연다 (새 화면 금지)
  const [editing, setEditing] = useState(false);

  // 핀 승격: 위치 태그 있는 오늘 사진 → 기록 시트 프리필 (승격 전엔 지도 미표시, 절대 규칙 6)
  const [promoteInitial, setPromoteInitial] = useState<{
    spots: SpotDraft[];
    photos: PhotoDraft[];
  } | null>(null);
  const promote = (photo: DailyPhoto) => {
    void (async () => {
      if (photo.lat === null || photo.lng === null) return;
      let sigunguCode: string | null = null;
      let name = '오늘의 순간';
      try {
        const region = await coordToRegion(photo.lng, photo.lat);
        sigunguCode = region.sigunguCode;
        name = `오늘의 순간 (${region.sigunguName})`;
      } catch {
        // 판정 실패해도 승격은 진행
      }
      // 오늘 사진을 기록 사진으로 함께 승격 — 스팟 태그 자동 연결 (plan-multi-region B안 2단계)
      const photos: PhotoDraft[] = [];
      if (photo.signedUrl) {
        try {
          const blob = await (await fetch(photo.signedUrl)).blob();
          photos.push({ file: new File([blob], '오늘의 사진.webp', { type: blob.type }), spotIndex: 0 });
        } catch {
          // 사진 가져오기 실패 시 스팟만 프리필
        }
      }
      setPromoteInitial({
        spots: [{ name, lat: photo.lat, lng: photo.lng, sigunguCode, kakaoPlaceId: null }],
        photos,
      });
    })();
  };

  return (
    <main className="space-y-4 px-4 py-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">오늘</h1>
          <p className="text-sm opacity-70">{entryDate}</p>
        </div>
        {streak > 0 && (
          <p className="rounded-full bg-yellow/40 px-3 py-1 text-sm font-bold">🔥 {streak}일째 함께</p>
        )}
      </header>

      {participated && myEntry && !editing ? (
        <MyTodayCard
          myEntry={myEntry}
          partnerEntry={partnerEntry}
          startedAt={couple?.started_at ?? null}
          entryDate={entryDate}
          onEdit={() => setEditing(true)}
        />
      ) : (
        <ComposeCard
          ctx={ctx}
          startedAt={couple?.started_at ?? null}
          entryDate={entryDate}
          partnerEntry={partnerEntry}
          initial={
            editing && myEntry
              ? { mood: myEntry.mood, answer: myEntry.answer ?? '', note: myEntry.note ?? '' }
              : undefined
          }
          onCancel={editing ? () => setEditing(false) : undefined}
          onSaved={() => setEditing(false)}
        />
      )}
      <UploadCard
        participated={participated}
        myCount={isMock() ? 2 : myPhotos.length}
        photos={myPhotos}
        ctx={ctx}
        onPromote={promote}
        onView={setViewerUrl}
      />
      <PartnerCard
        partnerEntry={partnerEntry}
        unlocked={unlocked}
        urls={partnerPhotos.map((p) => p.signedUrl ?? '')}
        onView={setViewerUrl}
      />
      <GrassCard coupleId={couple?.id} entryDate={entryDate} onSelectDay={setDetailDate} />

      <RecordSheet
        open={promoteInitial !== null}
        onClose={() => setPromoteInitial(null)}
        coupleId={couple?.id}
        initial={{
          status: 'visited',
          date: entryDate,
          spots: promoteInitial?.spots ?? [],
          photos: promoteInitial?.photos ?? [],
        }}
      />
      {detailDate !== null && (
        <DayDetailSheet
          coupleId={couple?.id}
          userId={userId}
          startedAt={couple?.started_at ?? null}
          date={detailDate}
          onClose={() => setDetailDate(null)}
          onView={setViewerUrl}
        />
      )}
      <PhotoViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />
    </main>
  );
}

type Ctx = { coupleId?: string; userId?: string; entryDate: string };

// ── 오늘 남기기 (미참여 상태 — 기분·질문 답·한 줄 일기 통합 작성, 저장 버튼 1개)
//    initial이 있으면 수정 모드: 기존 값 프리필 + 덮어쓰기 저장 + 취소로 표시 상태 복귀 ──
function ComposeCard({
  ctx,
  startedAt,
  entryDate,
  partnerEntry,
  initial,
  onCancel,
  onSaved,
}: {
  ctx: Ctx;
  startedAt: string | null;
  entryDate: string;
  partnerEntry: DailyEntry | null;
  initial?: { mood: string | null; answer: string; note: string };
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const editing = initial !== undefined;
  const mock = isMock();
  const question = useQuestionOfDay(startedAt, entryDate);
  const save = useSaveToday({ ...ctx, questionId: question.data?.id ?? null });
  const [mood, setMood] = useState<string | null>(initial?.mood ?? null);
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const filled = mood !== null || answer.trim() !== '' || note.trim() !== '';

  return (
    <section className="space-y-3 rounded-2xl rounded-tr-md border-2 border-ink/15 bg-white/60 p-4">
      <div>
        <h2 className="text-sm font-semibold">{editing ? '오늘 수정하기' : '오늘 남기기'}</h2>
        <p className="text-xs opacity-50">
          {editing
            ? '저장하면 그대로 바뀌어요 — 비운 항목은 지워져요'
            : '전부 자유예요 — 하나만 채워도 저장할 수 있어요'}
        </p>
      </div>

      {/* ① 기분 (다시 누르면 해제) */}
      <div className="flex justify-between">
        {MOODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMood(mood === m ? null : m)}
            className={`h-11 w-11 rounded-full text-2xl transition ${
              mood === m ? 'bg-yellow/60 ring-2 ring-yellow' : 'active:bg-ink/5'
            }`}
            aria-label={`기분 ${m}`}
            aria-pressed={mood === m}
          >
            {m}
          </button>
        ))}
      </div>

      {/* ② 오늘의 질문 */}
      <div className="space-y-2">
        <p className="break-words text-base font-semibold leading-relaxed">
          {question.data?.text ?? '질문을 가져오는 중…'}
        </p>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={2}
          maxLength={280}
          placeholder="내 답 적기 (선택)"
          className="w-full resize-none rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink"
        />
        {partnerEntry?.has_answer && !partnerEntry.answer && (
          <p className="text-xs opacity-60">짝꿍이 먼저 답했어요 — 내가 답하면 열려요</p>
        )}
        {editing && initial?.answer ? (
          // 수정 모드 부드러운 안내 — 이미 열린 답이 바뀔 수 있음을 그 자리에서 설명
          <p className="text-xs opacity-60">답을 수정하면 짝꿍에게 이미 열린 답도 바뀌어요</p>
        ) : (
          // 상시 설명 문구 — 양방 잠금 규칙을 그 자리에서 설명 (IA 원칙 4)
          <p className="text-xs opacity-50">둘 다 답하면 서로의 답이 열려요</p>
        )}
      </div>

      {/* ③ 한 줄 일기 */}
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={120}
        placeholder="한 줄 일기 (선택)"
        className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink"
      />

      {/* ④ 저장 버튼 1개 — 셋 중 하나 이상 채워야 활성 (수정도 같은 저장 경로로 덮어쓰기) */}
      <button
        type="button"
        disabled={!filled || save.isPending || !supabase || mock}
        onClick={() => save.mutate({ mood, answer, note, overwrite: editing }, { onSuccess: onSaved })}
        className="w-full rounded-2xl rounded-tl-md bg-pink px-5 py-3 text-sm font-bold text-white active:translate-y-px disabled:opacity-40"
      >
        {save.isPending
          ? editing
            ? '저장하는 중…'
            : '남기는 중…'
          : editing
            ? '이대로 저장하기'
            : '오늘 남기기'}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2 text-center text-sm opacity-50 active:opacity-70"
        >
          그대로 둘게요
        </button>
      )}
      {save.isError && (
        <p className="text-xs text-pink">저장하지 못했어요. 다시 시도해 주세요.</p>
      )}
      {!editing && <p className="text-xs opacity-50">저장하면 아래에서 사진도 올릴 수 있어요</p>}
      {mock ? (
        <p className="text-xs opacity-50">미리보기예요 — 저장은 짝꿍과 연결한 뒤에 할 수 있어요</p>
      ) : (
        !supabase && <p className="text-xs opacity-50">데모 모드예요 — 서버와 연결되면 남길 수 있어요</p>
      )}
    </section>
  );
}

// ── 나의 오늘 (저장 후 상태 — 남긴 기분·답·일기 표시 + 수정 진입) ──
function MyTodayCard({
  myEntry,
  partnerEntry,
  startedAt,
  entryDate,
  onEdit,
}: {
  myEntry: DailyEntry;
  partnerEntry: DailyEntry | null;
  startedAt: string | null;
  entryDate: string;
  onEdit: () => void;
}) {
  const question = useDayQuestion(
    startedAt,
    entryDate,
    myEntry.question_id ?? partnerEntry?.question_id ?? null,
  );
  const showQuestion = myEntry.has_answer || partnerEntry?.has_answer;

  return (
    <section className="space-y-3 rounded-2xl rounded-tr-md border-2 border-ink/15 bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">나의 오늘</h2>
        <div className="flex items-center gap-2">
          {myEntry.mood && (
            <span className="text-2xl" aria-label={`오늘 기분 ${myEntry.mood}`}>
              {myEntry.mood}
            </span>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border-2 border-ink/15 bg-white/70 px-3 py-1.5 text-xs font-semibold opacity-70 active:translate-y-px"
          >
            수정하기
          </button>
        </div>
      </div>

      {myEntry.note && (
        <div>
          <p className="text-xs font-semibold opacity-60">한 줄 일기</p>
          <p className="mt-1 break-words rounded-xl rounded-tl-sm bg-paper px-3 py-2 text-sm">{myEntry.note}</p>
        </div>
      )}

      {showQuestion && (
        <div className="space-y-2">
          <p className="text-xs font-semibold opacity-60">오늘의 질문</p>
          <p className="break-words text-base font-semibold leading-relaxed">
            {question.data?.text ?? '질문을 가져오는 중…'}
          </p>
          {myEntry.answer && (
            <p className="break-words rounded-xl rounded-tl-sm bg-paper px-3 py-2 text-sm">{myEntry.answer}</p>
          )}
          {partnerEntry?.answer ? (
            <div className="rounded-xl rounded-br-sm bg-sky/25 px-3 py-2">
              <p className="text-xs font-semibold opacity-60">짝꿍의 답</p>
              <p className="break-words text-sm">{partnerEntry.answer}</p>
            </div>
          ) : partnerEntry?.has_answer ? (
            <p className="text-xs opacity-60">짝꿍이 먼저 답했어요 — 내가 답하면 열려요</p>
          ) : myEntry.has_answer ? (
            <p className="text-xs opacity-60">둘 다 답하면 서로의 답이 열려요</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

// ── 오늘 사진 (저장 후 자유 추가 — 위치 태그 선택 → 핀 승격 가능) ──
function UploadCard({
  participated,
  myCount,
  photos,
  ctx,
  onPromote,
  onView,
}: {
  participated: boolean;
  myCount: number;
  photos: DailyPhoto[];
  ctx: Ctx;
  onPromote: (photo: DailyPhoto) => void;
  /** 사진 탭 → 크게 보기 */
  onView: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadPhoto(ctx);
  const [withLocation, setWithLocation] = useState(false);
  const canUpload = Boolean(supabase) && participated && myCount < DAILY_PHOTO_LIMIT;

  const pick = (file: File) => {
    if (!withLocation) {
      upload.mutate({ file });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => upload.mutate({ file, coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      () => upload.mutate({ file }), // 위치 실패 시 태그 없이 업로드
      { timeout: 8000 },
    );
  };

  return (
    <section className="space-y-3 rounded-2xl rounded-tr-md border-2 border-ink/15 bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">오늘 사진</h2>
        <span className="text-xs opacity-50">{myCount}/{DAILY_PHOTO_LIMIT}장</span>
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {p.signedUrl && (
                <button
                  type="button"
                  aria-label="사진 크게 보기"
                  onClick={() => onView(p.signedUrl as string)}
                  className="block w-full"
                >
                  <img src={p.signedUrl} alt="오늘 사진" className="aspect-square w-full rounded-xl rounded-tl-sm object-cover" />
                </button>
              )}
              {p.lat !== null && p.lng !== null && (
                // 위치 태그 있는 사진만 승격 가능 — 승격 전에는 지도에 올라가지 않는다
                <button
                  type="button"
                  onClick={() => onPromote(p)}
                  className="absolute bottom-1 right-1 rounded-full bg-pink px-2.5 py-1 text-[11px] font-bold text-white shadow after:absolute after:-inset-2 after:content-['']"
                >
                  📍 핀으로
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {participated && (
        <div className="space-y-0.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withLocation}
              onChange={(e) => setWithLocation(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-[#e8637c]"
            />
            <span className="whitespace-nowrap">지금 위치 담기</span>
          </label>
          <p className="pl-6 text-xs opacity-50">위치를 담아두면 나중에 핀으로 승격할 수 있어요</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && !upload.isPending) pick(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={!canUpload || upload.isPending}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-2xl rounded-tl-md bg-pink px-5 py-3 text-sm font-bold text-white active:translate-y-px disabled:opacity-40"
      >
        {upload.isPending ? '올리는 중…' : '오늘 사진 올리기'}
      </button>
      {!participated && (
        <p className="text-xs opacity-50">위에서 오늘을 먼저 남기면 사진도 올릴 수 있어요</p>
      )}
      {upload.isError && (
        <p className="text-xs text-pink">사진을 올리지 못했어요. 다시 시도해 주세요.</p>
      )}
      {participated && !supabase && (
        <p className="text-xs opacity-50">데모 모드예요 — 서버와 연결되면 올릴 수 있어요</p>
      )}
    </section>
  );
}

// ── 짝꿍의 오늘 (기분·한 줄 일기는 바로 보임, 사진만 상호 잠금) ────
function PartnerCard({
  partnerEntry,
  unlocked,
  urls,
  onView,
}: {
  partnerEntry: DailyEntry | null;
  unlocked: boolean;
  urls: string[];
  /** 사진 탭 → 크게 보기 */
  onView: (url: string) => void;
}) {
  const shown = urls.filter(Boolean);
  return (
    <section className="space-y-3 rounded-2xl rounded-bl-md border-2 border-ink/15 bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">짝꿍의 오늘</h2>
        {partnerEntry?.mood && (
          <span className="text-2xl" aria-label={`짝꿍 기분 ${partnerEntry.mood}`}>
            {partnerEntry.mood}
          </span>
        )}
      </div>
      {partnerEntry?.note && (
        <div>
          <p className="text-xs font-semibold opacity-60">짝꿍의 한 줄 일기</p>
          <p className="mt-1 break-words rounded-xl rounded-br-sm bg-sky/25 px-3 py-2 text-sm">{partnerEntry.note}</p>
        </div>
      )}
      {!unlocked ? (
        <div className="space-y-1.5 rounded-xl rounded-bl-sm border-2 border-dashed border-ink/25 bg-white/50 p-4 text-center">
          <p className="text-2xl" aria-hidden>🔒</p>
          <p className="text-sm font-semibold">짝꿍의 오늘 사진이 잠겨 있어요</p>
          {/* 상시 설명 문구 — 사용자 검증으로 확정된 카피, 잠금 상태에서 항상 노출 */}
          <p className="text-xs opacity-70">내 사진을 올리면 짝꿍의 오늘이 열려요</p>
        </div>
      ) : shown.length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {shown.map((u) => (
            <button key={u} type="button" aria-label="사진 크게 보기" onClick={() => onView(u)} className="block w-full">
              <img src={u} alt="짝꿍의 오늘 사진" className="aspect-square w-full rounded-xl rounded-tl-sm object-cover" />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm opacity-60">
          {partnerEntry ? '짝꿍이 사진은 아직 안 올렸어요' : '짝꿍의 오늘을 기다리는 중이에요'}
        </p>
      )}
    </section>
  );
}

// ── 지금까지의 잔디 (월 네비게이션 + 칸 탭 → 그날 상세) ───────────
function GrassCard({
  coupleId,
  entryDate,
  onSelectDay,
}: {
  coupleId: string | undefined;
  entryDate: string;
  onSelectDay: (date: string) => void;
}) {
  const [thisYear, thisMonth] = entryDate.split('-').map(Number);
  const [view, setView] = useState({ year: thisYear, month: thisMonth });
  const grassQuery = useGrass(coupleId, view.year, view.month);
  const grass = grassQuery.data ?? [];
  const weeks = monthGrid(view.year, view.month);
  const levelByDate = new Map(grass.map((g) => [g.date, g.level]));
  const isCurrentMonth = view.year === thisYear && view.month === thisMonth;

  const goPrev = () =>
    setView((v) => (v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 }));
  const goNext = () => {
    if (isCurrentMonth) return; // 현재 월 이후로는 이동 불가
    setView((v) => (v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 }));
  };

  return (
    <section className="space-y-2.5 rounded-2xl border-2 border-ink/15 bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">지금까지의 잔디</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            aria-label="이전 달"
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs opacity-60 active:bg-ink/10"
          >
            ◀
          </button>
          <p className="min-w-[6.5rem] text-center text-sm font-semibold">
            {view.year}년 {view.month}월
          </p>
          <button
            type="button"
            onClick={goNext}
            disabled={isCurrentMonth}
            aria-label="다음 달"
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs opacity-60 active:bg-ink/10 disabled:opacity-20"
          >
            ▶
          </button>
        </div>
      </div>
      <p className="text-xs opacity-50">기분·질문 답·한 줄 일기 중 하나만 남겨도 채워져요 · 사진은 자유예요</p>
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((date, di) => {
              if (date === null) return <div key={di} className="aspect-square" />;
              const level = levelByDate.get(date) ?? null;
              const future = date > entryDate;
              return (
                <button
                  key={di}
                  type="button"
                  title={date}
                  aria-label={`${date} 그날 보기`}
                  disabled={future}
                  onClick={() => onSelectDay(date)}
                  className={`aspect-square rounded-md rounded-tl-sm ${
                    level === 'both'
                      ? 'bg-green'
                      : level === 'one'
                        ? 'bg-green/35'
                        : 'border border-ink/10 bg-white/50'
                  } ${date === entryDate ? 'ring-2 ring-pink' : ''} ${
                    future ? 'opacity-40' : 'active:ring-2 active:ring-sky'
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs opacity-50">
        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-green/35 align-middle" /> 한 명
        <span className="mx-2 inline-block h-2.5 w-2.5 rounded-sm bg-green align-middle" /> 둘 다 —
        둘 다 채우면 함께한 날이 이어져요 · 칸을 누르면 그날이 펼쳐져요
      </p>
    </section>
  );
}

// ── 그날 상세 시트 (잔디 칸 탭 — 기분·일기·질문 답·사진) ──────────
function DayDetailSheet({
  coupleId,
  userId,
  startedAt,
  date,
  onClose,
  onView,
}: {
  coupleId: string | undefined;
  userId: string | undefined;
  startedAt: string | null;
  date: string;
  onClose: () => void;
  /** 사진 탭 → 크게 보기 */
  onView: (url: string) => void;
}) {
  const { myEntry, partnerEntry, photos, isLoading } = useDayDetail(coupleId, userId, date);
  const question = useDayQuestion(
    startedAt,
    date,
    myEntry?.question_id ?? partnerEntry?.question_id ?? null,
  );
  const [y, m, d] = date.split('-').map(Number);
  const photoUrls = photos.filter((p) => p.signedUrl);
  const empty = !isLoading && !myEntry && !partnerEntry && photos.length === 0;
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <BottomSheet open onClose={onClose} title={`${y}년 ${m}월 ${d}일`}>
      {isLoading ? (
        <p className="py-8 text-center text-sm opacity-50">그날을 펼치는 중…</p>
      ) : empty ? (
        <div className="space-y-1 py-8 text-center">
          <p className="text-3xl" aria-hidden>🌱</p>
          <p className="text-sm opacity-60">이날은 아직 비어 있어요</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(myEntry?.mood || partnerEntry?.mood) && (
            <section className="rounded-2xl rounded-tr-md border-2 border-ink/15 bg-white/60 p-4">
              <h3 className="text-sm font-semibold">그날의 기분</h3>
              <div className="mt-2 flex gap-6">
                <MoodChip label="나" mood={myEntry?.mood ?? null} />
                <MoodChip label="짝꿍" mood={partnerEntry?.mood ?? null} />
              </div>
            </section>
          )}

          {(myEntry?.note || partnerEntry?.note) && (
            <section className="space-y-2 rounded-2xl rounded-bl-md border-2 border-ink/15 bg-white/60 p-4">
              <h3 className="text-sm font-semibold">한 줄 일기</h3>
              {myEntry?.note && (
                <div>
                  <p className="text-xs font-semibold opacity-60">나</p>
                  <p className="mt-0.5 break-words rounded-xl rounded-tl-sm bg-paper px-3 py-2 text-sm">{myEntry.note}</p>
                </div>
              )}
              {partnerEntry?.note && (
                <div>
                  <p className="text-xs font-semibold opacity-60">짝꿍</p>
                  <p className="mt-0.5 break-words rounded-xl rounded-br-sm bg-sky/25 px-3 py-2 text-sm">{partnerEntry.note}</p>
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl border-2 border-ink/15 bg-white/60 p-4">
            <h3 className="text-sm font-semibold">그날의 질문</h3>
            <p className="mt-1 break-words text-base font-semibold leading-relaxed">
              {question.data?.text ?? '질문을 가져오는 중…'}
            </p>
            {myEntry?.answer && (
              <div className="mt-2 rounded-xl rounded-tl-sm bg-paper px-3 py-2">
                <p className="text-xs font-semibold opacity-60">나의 답</p>
                <p className="break-words text-sm">{myEntry.answer}</p>
              </div>
            )}
            {partnerEntry?.answer ? (
              <div className="mt-2 rounded-xl rounded-br-sm bg-sky/25 px-3 py-2">
                <p className="text-xs font-semibold opacity-60">짝꿍의 답</p>
                <p className="break-words text-sm">{partnerEntry.answer}</p>
              </div>
            ) : partnerEntry?.has_answer ? (
              <p className="mt-2 text-xs opacity-60">짝꿍의 답이 잠겨 있어요 — 내가 답하면 열려요</p>
            ) : null}
            {!myEntry?.answer && !partnerEntry?.has_answer && (
              <p className="mt-2 text-xs opacity-60">이날은 답을 남기지 않았어요</p>
            )}
          </section>

          <section className="rounded-2xl rounded-tr-md border-2 border-ink/15 bg-white/60 p-4">
            <h3 className="text-sm font-semibold">그날의 사진</h3>
            {photoUrls.length > 0 ? (
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {photoUrls.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-label="사진 크게 보기"
                    onClick={() => onView(p.signedUrl as string)}
                    className="block w-full"
                  >
                    <img
                      src={p.signedUrl}
                      alt="그날 사진"
                      className="aspect-square w-full rounded-xl rounded-tl-sm object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm opacity-60">이날 올린 사진이 없어요</p>
            )}
            <p className="mt-2 text-xs opacity-50">사진은 잔디와 상관없이 자유롭게 올릴 수 있어요</p>
          </section>

          {/* 공유 카드 — 그날의 기분·일기·답·사진을 인스타 규격으로 (잠긴 짝꿍 답·사진은 애초에 안 온다) */}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="w-full rounded-2xl rounded-tr-md border-2 border-ink/15 bg-white/70 py-3 text-sm font-bold active:translate-y-px"
          >
            📤 공유 카드 만들기
          </button>

          <ShareCardSheet
            key={date}
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            fileName={`dohwaji-${date}.png`}
            captionPlaceholder="한마디 남기기 (선택)"
            contentKey={`${photoUrls.length}-${question.data ? 1 : 0}`}
            paint={(canvas, theme, caption) =>
              paintDayCard(canvas, {
                theme,
                date,
                myMood: myEntry?.mood ?? null,
                partnerMood: partnerEntry?.mood ?? null,
                myNote: myEntry?.note ?? null,
                partnerNote: partnerEntry?.note ?? null,
                question: question.data?.text ?? null,
                myAnswer: myEntry?.answer ?? null,
                partnerAnswer: partnerEntry?.answer ?? null,
                photoUrls: photoUrls.map((p) => p.signedUrl as string),
                caption: caption || null,
              })
            }
          />
        </div>
      )}
    </BottomSheet>
  );
}

function MoodChip({ label, mood }: { label: string; mood: string | null }) {
  return (
    <p className="text-sm">
      <span className="opacity-60">{label}</span>{' '}
      {mood ? (
        <span className="align-middle text-2xl" aria-label={`${label} 기분 ${mood}`}>
          {mood}
        </span>
      ) : (
        <span className="opacity-40">—</span>
      )}
    </p>
  );
}
