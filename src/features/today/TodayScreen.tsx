import { useRef, useState } from 'react';
import { calcStreak, monthGrid } from '../../shared/lib/daily';
import { coordToRegion } from '../../shared/lib/kakao';
import { supabase } from '../../shared/lib/supabase';
import RecordSheet from '../map/RecordSheet';
import type { SpotDraft } from '../map/useRecords';
import {
  isMock,
  useDailyEntries,
  useDailyPhotos,
  useGrass,
  useQuestionOfDay,
  useSetAnswer,
  useSetMood,
  useTodayContext,
  useUploadPhoto,
  type DailyEntry,
  type DailyPhoto,
} from './useToday';

const MOODS = ['😊', '🥰', '😆', '😴', '😢', '😤'];
const DAILY_PHOTO_LIMIT = 30;

/** 오늘 탭: 상호 잠금 업로드 · 오늘의 질문 · 기분 · 잔디 · 스트릭 (명세 §3.2) */
export default function TodayScreen() {
  const { userId, couple, entryDate } = useTodayContext();
  const entriesQuery = useDailyEntries(couple?.id, entryDate);
  const entries = entriesQuery.data ?? [];
  const myEntry = entries.find((e) => e.user_id === userId) ?? null;
  const partnerEntry = entries.find((e) => e.user_id !== userId) ?? null;
  const photosQuery = useDailyPhotos(entries.map((e) => e.id));
  const photos = photosQuery.data ?? [];
  const myPhotos = myEntry ? photos.filter((p) => p.entry_id === myEntry.id) : [];
  const partnerPhotos = partnerEntry ? photos.filter((p) => p.entry_id === partnerEntry.id) : [];
  const unlocked = isMock() ? true : myPhotos.length > 0;

  const grassQuery = useGrass(couple?.id, entryDate);
  const grass = grassQuery.data ?? [];
  const streak = calcStreak(
    grass.map((g) => ({ date: g.date, bothFilled: g.level === 'both' })),
  );

  const ctx = { coupleId: couple?.id, userId, entryDate };

  // 핀 승격: 위치 태그 있는 오늘 사진 → 기록 시트 프리필 (승격 전엔 지도 미표시, 절대 규칙 6)
  const [promoteInitial, setPromoteInitial] = useState<SpotDraft[] | null>(null);
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
      setPromoteInitial([{ name, lat: photo.lat, lng: photo.lng, sigunguCode, kakaoPlaceId: null }]);
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

      <UploadCard myCount={isMock() ? 2 : myPhotos.length} photos={myPhotos} ctx={ctx} onPromote={promote} />
      <PartnerCard unlocked={unlocked} urls={partnerPhotos.map((p) => p.signedUrl ?? '')} hasPartnerEntry={partnerEntry !== null} />
      <QuestionCard myEntry={myEntry} partnerEntry={partnerEntry} startedAt={couple?.started_at ?? null} entryDate={entryDate} ctx={ctx} />
      <MoodCard myEntry={myEntry} partnerEntry={partnerEntry} ctx={ctx} />
      <GrassCard entryDate={entryDate} grass={grass} />

      <RecordSheet
        open={promoteInitial !== null}
        onClose={() => setPromoteInitial(null)}
        coupleId={couple?.id}
        initial={{ status: 'visited', date: entryDate, spots: promoteInitial ?? [] }}
      />
    </main>
  );
}

type Ctx = { coupleId?: string; userId?: string; entryDate: string };

// ── 내 오늘 업로드 (위치 태그 선택 → 핀 승격 가능) ───────────────
function UploadCard({
  myCount,
  photos,
  ctx,
  onPromote,
}: {
  myCount: number;
  photos: DailyPhoto[];
  ctx: Ctx;
  onPromote: (photo: DailyPhoto) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadPhoto(ctx);
  const [withLocation, setWithLocation] = useState(false);
  const canUpload = Boolean(supabase) && myCount < DAILY_PHOTO_LIMIT;

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
        <h2 className="text-sm font-semibold">나의 오늘</h2>
        <span className="text-xs opacity-50">{myCount}/{DAILY_PHOTO_LIMIT}장</span>
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {p.signedUrl && (
                <img src={p.signedUrl} alt="오늘 사진" className="aspect-square w-full rounded-xl rounded-tl-sm object-cover" />
              )}
              {p.lat !== null && p.lng !== null && (
                // 위치 태그 있는 사진만 승격 가능 — 승격 전에는 지도에 올라가지 않는다
                <button
                  type="button"
                  onClick={() => onPromote(p)}
                  className="absolute bottom-1 right-1 rounded-full bg-pink px-2 py-0.5 text-[10px] font-bold text-white shadow"
                >
                  📍 핀으로
                </button>
              )}
            </div>
          ))}
        </div>
      )}
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
      {upload.isError && (
        <p className="text-xs text-pink">올리다 문제가 있었어요. 다시 시도해 주세요.</p>
      )}
      {!supabase && <p className="text-xs opacity-50">Supabase 연결 후 올릴 수 있어요 (데모 모드)</p>}
    </section>
  );
}

// ── 짝꿍의 오늘 (상호 잠금 — 잠금 상태 카드에 상시 설명 문구) ────
function PartnerCard({
  unlocked,
  urls,
  hasPartnerEntry,
}: {
  unlocked: boolean;
  urls: string[];
  hasPartnerEntry: boolean;
}) {
  if (!unlocked) {
    return (
      <section className="space-y-2 rounded-2xl rounded-bl-md border-2 border-dashed border-ink/25 bg-white/50 p-5 text-center">
        <p className="text-3xl" aria-hidden>🔒</p>
        <p className="font-semibold">짝꿍의 오늘이 잠겨 있어요</p>
        {/* 상시 설명 문구 — 사용자 검증으로 확정된 카피, 잠금 상태에서 항상 노출 */}
        <p className="text-sm opacity-70">내 사진을 올리면 짝꿍의 오늘이 열려요</p>
      </section>
    );
  }
  return (
    <section className="space-y-3 rounded-2xl rounded-bl-md border-2 border-ink/15 bg-white/60 p-4">
      <h2 className="text-sm font-semibold">짝꿍의 오늘</h2>
      {urls.filter(Boolean).length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {urls.filter(Boolean).map((u) => (
            <img key={u} src={u} alt="짝꿍의 오늘 사진" className="aspect-square w-full rounded-xl rounded-tl-sm object-cover" />
          ))}
        </div>
      ) : (
        <p className="text-sm opacity-60">
          {hasPartnerEntry ? '짝꿍이 아직 사진은 안 올렸어요' : '짝꿍의 오늘을 기다리는 중이에요'}
        </p>
      )}
    </section>
  );
}

// ── 오늘의 질문 (양방 잠금 — DB 뷰가 강제) ───────────────────────
function QuestionCard({
  myEntry,
  partnerEntry,
  startedAt,
  entryDate,
  ctx,
}: {
  myEntry: DailyEntry | null;
  partnerEntry: DailyEntry | null;
  startedAt: string | null;
  entryDate: string;
  ctx: Ctx;
}) {
  const question = useQuestionOfDay(startedAt, entryDate);
  const setAnswer = useSetAnswer({ ...ctx, questionId: question.data?.id ?? null });
  const [draft, setDraft] = useState('');
  const myAnswer = myEntry?.answer ?? null;

  return (
    <section className="space-y-3 rounded-2xl border-2 border-ink/15 bg-white/60 p-4">
      <h2 className="text-sm font-semibold">오늘의 질문</h2>
      <p className="text-base font-semibold leading-relaxed">
        {question.data?.text ?? '질문을 가져오는 중…'}
      </p>

      {myAnswer === null ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim() && !setAnswer.isPending) setAnswer.mutate(draft);
          }}
          className="space-y-2"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={280}
            placeholder="내 답 적기"
            className="w-full resize-none rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-pink"
          />
          <button
            type="submit"
            disabled={!draft.trim() || setAnswer.isPending || !supabase}
            className="w-full rounded-2xl rounded-tl-md bg-green px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {setAnswer.isPending ? '적는 중…' : '답 남기기'}
          </button>
        </form>
      ) : (
        <p className="rounded-xl rounded-tl-sm bg-paper px-3 py-2 text-sm">{myAnswer}</p>
      )}

      {partnerEntry?.answer ? (
        <div className="rounded-xl rounded-br-sm bg-sky/25 px-3 py-2">
          <p className="text-xs font-semibold opacity-60">짝꿍의 답</p>
          <p className="text-sm">{partnerEntry.answer}</p>
        </div>
      ) : partnerEntry?.has_answer ? (
        <p className="text-xs opacity-60">짝꿍이 먼저 답했어요 — 내가 답하면 열려요</p>
      ) : null}

      {/* 상시 설명 문구 — 양방 잠금 규칙을 그 자리에서 설명 (IA 원칙 4) */}
      <p className="text-xs opacity-50">둘 다 답하면 서로의 답이 열려요</p>
    </section>
  );
}

// ── 기분 이모지 (1탭 참여) ───────────────────────────────────────
function MoodCard({
  myEntry,
  partnerEntry,
  ctx,
}: {
  myEntry: DailyEntry | null;
  partnerEntry: DailyEntry | null;
  ctx: Ctx;
}) {
  const setMood = useSetMood(ctx);
  return (
    <section className="space-y-2.5 rounded-2xl rounded-tr-md border-2 border-ink/15 bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">오늘 기분</h2>
        {partnerEntry?.mood && (
          <span className="text-sm">
            짝꿍 <span className="text-lg" aria-hidden>{partnerEntry.mood}</span>
          </span>
        )}
      </div>
      <div className="flex justify-between">
        {MOODS.map((m) => (
          <button
            key={m}
            type="button"
            disabled={setMood.isPending || !supabase}
            onClick={() => setMood.mutate(m)}
            className={`h-11 w-11 rounded-full text-2xl transition ${
              myEntry?.mood === m ? 'bg-yellow/60 ring-2 ring-yellow' : 'active:bg-ink/5'
            } disabled:opacity-50`}
            aria-label={`기분 ${m}`}
          >
            {m}
          </button>
        ))}
      </div>
    </section>
  );
}

// ── 커플 잔디 (월 그리드) ────────────────────────────────────────
function GrassCard({ entryDate, grass }: { entryDate: string; grass: { date: string; level: 'both' | 'one' | null }[] }) {
  const [y, m] = entryDate.split('-').map(Number);
  const weeks = monthGrid(y, m);
  const levelByDate = new Map(grass.map((g) => [g.date, g.level]));

  return (
    <section className="space-y-2.5 rounded-2xl border-2 border-ink/15 bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{m}월의 잔디</h2>
        <p className="text-xs opacity-50">사진·질문·기분 중 하나면 채워져요</p>
      </div>
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((date, di) => {
              const level = date ? levelByDate.get(date) ?? null : null;
              return (
                <div
                  key={di}
                  title={date ?? undefined}
                  className={`aspect-square rounded-md rounded-tl-sm ${
                    date === null
                      ? ''
                      : level === 'both'
                        ? 'bg-green'
                        : level === 'one'
                          ? 'bg-green/35'
                          : 'border border-ink/10 bg-white/50'
                  } ${date === entryDate ? 'ring-2 ring-pink' : ''}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs opacity-50">
        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-green/35 align-middle" /> 한 명
        <span className="mx-2 inline-block h-2.5 w-2.5 rounded-sm bg-green align-middle" /> 둘 다 — 둘 다 채우면 스트릭이 이어져요
      </p>
    </section>
  );
}
