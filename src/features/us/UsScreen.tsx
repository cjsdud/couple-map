import { useEffect, useState } from 'react';
import { signOut, useSession } from '../../shared/lib/auth';
import { calcStreak, entryDateFor, toDateString } from '../../shared/lib/daily';
import { supabase } from '../../shared/lib/supabase';
import {
  BETA_ALL_UNLOCKED,
  isUnlocked,
  PAPER_TONES,
  PIN_STYLES,
  pinStyle,
  type CoupleTheme,
} from '../../shared/lib/theme';
import { useCoupleState, useUpdateNickname, type Couple } from '../couple/useCoupleState';
import { useStreakDays } from '../today/useToday';
import { categoryLabel, useCoupleMembers } from '../map/useRecords';
import {
  dPlus,
  nextOccurrence,
  upcomingMilestones,
  useAddAnniversary,
  useAnniversaries,
  useDeleteAnniversary,
  useMonthlyExpenses,
  useUpdateCouple,
} from './useUs';

/** 우리 탭: 디데이·기념일 / 가계부 월간 카드 / 설정 (명세 §3.3) */
export default function UsScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const coupleQuery = useCoupleState(userId);
  const couple = coupleQuery.data?.couple ?? null;
  const profile = coupleQuery.data?.profile ?? null;
  const isMock = new URLSearchParams(window.location.search).has('mock');
  const startedAt = couple?.started_at ?? (isMock ? '2026-01-24' : null);
  const today = toDateString(new Date());

  return (
    <main className="space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">우리</h1>
      <DdayCard startedAt={startedAt} today={today} coupleId={couple?.id} mock={isMock} />
      <ExpenseMonthCard today={today} />
      <ThemeCard couple={couple} userId={userId} mock={isMock} />
      <SettingsCard
        coupleId={couple?.id}
        userId={userId}
        nickname={profile?.nickname ?? (isMock ? '체리' : '')}
        mock={isMock}
        dayCutoff={couple?.day_cutoff ?? 0}
        startedAt={startedAt}
      />
    </main>
  );
}

// ── 디데이 + 다가오는 기념일 (100일 단위·주년 자동 + 우리만의 기념일) ──
function DdayCard({
  startedAt,
  today,
  coupleId,
  mock,
}: {
  startedAt: string | null;
  today: string;
  coupleId: string | undefined;
  mock: boolean;
}) {
  const anniversaries = useAnniversaries(coupleId).data ?? [];
  const addAnniversary = useAddAnniversary(coupleId);
  const deleteAnniversary = useDeleteAnniversary();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const canEdit = !mock && Boolean(supabase && coupleId);
  const draftValid = title.trim().length >= 1 && title.trim().length <= 16 && Boolean(date);

  // 자동(100일·주년) + 커스텀(지난 날짜는 매년 반복) 병합, 가까운 순 5개
  const auto = startedAt ? upcomingMilestones(startedAt, today) : [];
  const custom = anniversaries
    .filter((a) => a.kind === 'custom')
    .map((a) => {
      const next = nextOccurrence(a.date, today);
      return { id: a.id as string | null, title: a.title, date: next.date, dDay: next.dDay };
    });
  const list = [...auto.map((m) => ({ ...m, id: null as string | null })), ...custom]
    .sort((a, b) => a.dDay - b.dDay)
    .slice(0, 5);

  const submit = () => {
    if (!draftValid || addAnniversary.isPending) return;
    addAnniversary.mutate(
      { title: title.trim(), date },
      {
        onSuccess: () => {
          setAdding(false);
          setTitle('');
          setDate('');
        },
      },
    );
  };

  return (
    <section className="space-y-3 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/60 p-5">
      <div className="text-center">
        <p className="text-sm opacity-60">함께한 지</p>
        <p className="text-4xl font-bold text-pink">{startedAt ? `D+${dPlus(startedAt, today)}` : 'D+?'}</p>
        <p className="mt-0.5 text-xs opacity-50">
          {startedAt ?? '아래 설정에서 사귄 날을 알려주시면 세어 드려요'}
          {startedAt && '부터'}
        </p>
      </div>

      {list.length > 0 && (
        <ul className="space-y-1.5 border-t border-ink/10 pt-3">
          {list.map((m) => (
            <li key={m.id ?? m.title} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-semibold">
                {m.title}
                <span className="ml-1.5 text-xs font-normal opacity-50">{m.date}</span>
              </span>
              <span className={m.dDay <= 7 ? 'shrink-0 font-bold text-pink' : 'shrink-0 opacity-60'}>
                {m.dDay === 0 ? '오늘!' : `D-${m.dDay}`}
              </span>
              {m.id !== null && (
                <button
                  type="button"
                  aria-label={`${m.title} 기념일 지우기`}
                  disabled={!canEdit || deleteAnniversary.isPending}
                  onClick={() => deleteAnniversary.mutate(m.id as string)}
                  className="-my-1 -mr-1.5 shrink-0 p-1.5 text-xs opacity-40 disabled:opacity-15"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="space-y-2 border-t border-ink/10 pt-3">
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={16}
              placeholder="기념일 이름 (16자까지)"
              className="min-w-0 flex-1 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-pink"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-36 shrink-0 rounded-2xl border-2 border-ink/15 bg-white/70 px-2 py-2 text-sm outline-none focus:border-pink"
            />
          </div>
          {addAnniversary.isError && (
            <p className="text-xs text-pink">넣지 못했어요. 다시 시도해 주세요.</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="flex-1 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 py-2 text-sm font-bold active:translate-y-px"
            >
              그만두기
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!draftValid || !canEdit || addAnniversary.isPending}
              className="flex-1 rounded-2xl rounded-br-md bg-pink py-2 text-sm font-bold text-white active:translate-y-px disabled:opacity-40"
            >
              {addAnniversary.isPending ? '넣는 중…' : '기념일 넣기'}
            </button>
          </div>
          <p className="break-keep text-xs opacity-45">
            지난 날짜(생일·처음 만난 날 등)는 매년 돌아오는 기념일로 세어 드려요
          </p>
          {mock && <p className="text-xs opacity-50">미리보기예요 — 저장은 짝꿍과 연결한 뒤에 할 수 있어요</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-2xl rounded-tl-md border-2 border-dashed border-ink/20 bg-white/50 py-2 text-sm font-semibold"
        >
          + 우리만의 기념일 넣기
        </button>
      )}
    </section>
  );
}

// ── 도화지 꾸미기: 핀 모양·배경 톤 (A안 — 스트릭으로 해금, 명세 §3.2 보상) ──
const PIN_SYMBOL: Record<string, string> = { dot: '📍', heart: '♥', star: '★', tape: '▬' };

function ThemeCard({
  couple,
  userId,
  mock,
}: {
  couple: Couple | null;
  userId: string | undefined;
  mock: boolean;
}) {
  const update = useUpdateCouple(couple?.id, userId);
  const theme: CoupleTheme = couple?.theme ?? {};
  const entryDate = entryDateFor(new Date(), couple?.day_cutoff ?? 0);
  const streakDays = useStreakDays(couple?.id, entryDate).data ?? [];
  const streak = calcStreak(streakDays.map((g) => ({ date: g.date, bothFilled: g.level === 'both' })));

  // 최고 스트릭 영구 기록 — 한 번 해금된 꾸미기는 스트릭이 끊겨도 유지된다
  useEffect(() => {
    if (!supabase || !couple?.id || mock || update.isPending) return;
    if (streak > (theme.maxStreak ?? 0)) {
      update.mutate({ theme: { ...theme, maxStreak: streak } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak, theme.maxStreak, couple?.id, mock]);

  const disabled = !supabase || !couple?.id || mock || update.isPending;
  const pick = (patch: Partial<CoupleTheme>) => update.mutate({ theme: { ...theme, ...patch } });
  const currentPin = pinStyle(theme);
  const currentPaper = theme.paper ?? 'paper';

  return (
    <section className="space-y-3 rounded-2xl rounded-tr-md border-2 border-ink/15 bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">도화지 꾸미기</h2>
        <span className="text-xs opacity-50">둘이 함께 쓰는 테마예요</span>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm">핀 모양</span>
        <div className="flex flex-wrap gap-1.5">
          {PIN_STYLES.map((p) => {
            const unlocked = isUnlocked(p, theme, streak);
            const selected = currentPin === p.key;
            return (
              <button
                key={p.key}
                type="button"
                disabled={disabled || !unlocked}
                onClick={() => pick({ pin: p.key })}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                  selected ? 'bg-pink font-bold text-white' : 'border border-ink/15 bg-white/60'
                } ${!unlocked ? 'opacity-45' : ''}`}
              >
                <span aria-hidden className={selected ? '' : 'text-pink'}>{PIN_SYMBOL[p.key]}</span>
                {p.label}
                {!unlocked && <span className="text-[11px] opacity-70">🔒 {p.unlock}일</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm">도화지 톤</span>
        <div className="flex flex-wrap gap-2">
          {PAPER_TONES.map((t) => {
            const unlocked = isUnlocked(t, theme, streak);
            const selected = currentPaper === t.key;
            return (
              <button
                key={t.key}
                type="button"
                disabled={disabled || !unlocked}
                onClick={() => pick({ paper: t.key })}
                aria-label={`도화지 톤 ${t.label}`}
                className={`flex flex-col items-center gap-1 ${!unlocked ? 'opacity-45' : ''}`}
              >
                <span
                  className={`h-9 w-9 rounded-full rounded-tl-md border-2 ${
                    selected ? 'border-pink' : 'border-ink/15'
                  }`}
                  style={{ backgroundColor: t.color }}
                />
                <span className="text-[11px] opacity-70">
                  {unlocked ? t.label : `🔒 ${t.unlock}일`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="break-keep text-xs opacity-50">
        {BETA_ALL_UNLOCKED
          ? '베타 기간이라 모든 꾸미기가 열려 있어요'
          : `둘 다 채운 날이 이어지면 새 꾸미기가 열려요 — 지금까지 최고 ${Math.max(theme.maxStreak ?? 0, streak)}일`}
      </p>
      {mock && <p className="text-xs opacity-50">미리보기예요 — 저장은 짝꿍과 연결한 뒤에 할 수 있어요</p>}
    </section>
  );
}

// ── 가계부 월간 카드: 합계·횟수·평균·밸런스 (정산 압박·경고색 금지) ──
function ExpenseMonthCard({ today }: { today: string }) {
  const [y, m] = today.split('-').map(Number);
  const { data: rows = [] } = useMonthlyExpenses(y, m);
  const members = useCoupleMembers();

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const dateCount = new Set(rows.map((r) => r.record_id)).size;
  const average = dateCount > 0 ? Math.round(total / dateCount) : 0;

  const byPayer = new Map<string, number>();
  for (const r of rows) {
    if (r.paid_by) byPayer.set(r.paid_by, (byPayer.get(r.paid_by) ?? 0) + r.amount);
  }
  const paidTotal = [...byPayer.values()].reduce((a, b) => a + b, 0);
  let balanceLine = '이번 달은 사이좋게 나눠 내고 있어요';
  if (paidTotal > 0) {
    const [topId, topAmount] = [...byPayer.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topAmount / paidTotal >= 0.6) {
      const nick = members.data?.find((mem) => mem.user_id === topId)?.nickname ?? '짝꿍';
      balanceLine = `이번 달엔 ${nick} 쪽에서 좀 더 자주 냈어요`;
    }
  }

  const byCategory = new Map<string, number>();
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);

  return (
    <section className="space-y-3 rounded-2xl border-2 border-ink/15 bg-white/60 p-4">
      <h2 className="text-sm font-semibold">{m}월 데이트 가계부</h2>
      {rows.length === 0 ? (
        <p className="text-sm opacity-60">이번 달 지출 기록이 아직 없어요 — 데이트 기록에 살짝 적어 두면 여기에 모아 드려요</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl rounded-tl-sm bg-paper p-2.5">
              <p className="text-xs opacity-50">합계</p>
              <p className="text-sm font-bold">{total.toLocaleString()}원</p>
            </div>
            <div className="rounded-xl bg-paper p-2.5">
              <p className="text-xs opacity-50">데이트</p>
              <p className="text-sm font-bold">{dateCount}번</p>
            </div>
            <div className="rounded-xl rounded-br-sm bg-paper p-2.5">
              <p className="text-xs opacity-50">평균</p>
              <p className="text-sm font-bold">{average.toLocaleString()}원</p>
            </div>
          </div>
          <p className="text-sm opacity-70">
            {[...byCategory.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([c, v]) => `${categoryLabel(c)} ${Math.round((v / total) * 100)}%`)
              .join(' · ')}
          </p>
          <p className="rounded-xl rounded-tl-sm bg-sky/25 px-3 py-2 text-sm">{balanceLine}</p>
        </>
      )}
    </section>
  );
}

// ── 설정: 닉네임 · 사귄 날 · 마감 시각 · 부담 비율 · 로그아웃 ─────
function SettingsCard({
  coupleId,
  userId,
  nickname,
  mock,
  dayCutoff,
  startedAt,
}: {
  coupleId: string | undefined;
  userId: string | undefined;
  nickname: string;
  mock: boolean;
  dayCutoff: number;
  startedAt: string | null;
}) {
  const update = useUpdateCouple(coupleId, userId);
  const updateNickname = useUpdateNickname(userId);
  const [dateDraft, setDateDraft] = useState(startedAt ?? '');
  // 닉네임 초안: 건드리기 전엔 서버 값을 그대로 프리필 (프로필 로딩 후에도 자연 반영)
  const [nickDraft, setNickDraft] = useState<string | null>(null);
  const nickValue = nickDraft ?? nickname;
  const nickTrimmed = nickValue.trim();
  // 온보딩 NicknameStep과 동일 규칙: 1~12자
  const nickValid = nickTrimmed.length >= 1 && nickTrimmed.length <= 12;
  const disabled = !supabase || !coupleId || update.isPending;

  return (
    <section className="space-y-4 rounded-2xl rounded-br-md border-2 border-ink/15 bg-white/60 p-4">
      <h2 className="text-sm font-semibold">설정</h2>

      <label className="block space-y-1.5">
        <span className="text-sm">
          내 닉네임 <span className="text-xs opacity-50">— 짝꿍에게 보이는 이름이에요</span>
        </span>
        <div className="flex gap-2">
          <input
            value={nickValue}
            onChange={(e) => setNickDraft(e.target.value)}
            maxLength={12}
            placeholder="닉네임 (12자까지)"
            className="min-w-0 flex-1 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink"
          />
          <button
            type="button"
            disabled={
              !supabase ||
              !userId ||
              mock ||
              updateNickname.isPending ||
              !nickValid ||
              nickTrimmed === nickname
            }
            onClick={() =>
              updateNickname.mutate(nickTrimmed, { onSuccess: () => setNickDraft(null) })
            }
            className="shrink-0 rounded-2xl rounded-br-md bg-pink px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {updateNickname.isPending ? '저장하는 중…' : '저장'}
          </button>
        </div>
        {updateNickname.isError && (
          <p className="text-xs text-pink">닉네임을 바꾸지 못했어요. 다시 시도해 주세요.</p>
        )}
        {updateNickname.isSuccess && nickDraft === null && (
          <p className="text-xs opacity-60">닉네임을 바꿨어요 — 짝꿍에게도 곧 새 이름으로 보여요</p>
        )}
        {mock && (
          <p className="text-xs opacity-50">미리보기예요 — 저장은 짝꿍과 연결한 뒤에 할 수 있어요</p>
        )}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm">사귄 날</span>
        <div className="flex gap-2">
          <input
            type="date"
            value={dateDraft}
            onChange={(e) => setDateDraft(e.target.value)}
            max={toDateString(new Date())}
            className="min-w-0 flex-1 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink"
          />
          <button
            type="button"
            disabled={disabled || !dateDraft || dateDraft === startedAt}
            onClick={() => update.mutate({ started_at: dateDraft })}
            className="shrink-0 rounded-2xl rounded-br-md bg-pink px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            저장
          </button>
        </div>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm">
          &lsquo;오늘&rsquo; 마감 시각 <span className="text-xs opacity-50">— 새벽까지 이어진 하루도 어제로 담아 줘요</span>
        </span>
        <select
          value={dayCutoff}
          disabled={disabled}
          onChange={(e) => update.mutate({ day_cutoff: Number(e.target.value) })}
          className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink disabled:opacity-50"
        >
          {Array.from({ length: 7 }, (_, h) => (
            <option key={h} value={h}>
              {h === 0 ? '자정 (기본)' : `새벽 ${h}시`}
            </option>
          ))}
        </select>
      </label>

      {/* '데이트 비용 나누기' 설정은 제거 — 낸 사람은 지출 입력 때 이미 고르므로 (사용자 결정 2026-07-23) */}
      {supabase && (
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full py-2.5 text-center text-xs opacity-40 underline underline-offset-2"
        >
          로그아웃
        </button>
      )}
      {!supabase && <p className="text-xs opacity-50">데모 모드예요 — 서버와 연결되면 바꿀 수 있어요</p>}
      <a
        href="/privacy.html"
        className="block text-center text-xs opacity-30 underline underline-offset-2"
      >
        개인정보 처리방침
      </a>
    </section>
  );
}
