import { useEffect, useState } from 'react';
import { signOut, useSession } from '../../shared/lib/auth';
import ActivityBell from '../activity/ActivityBell';
import { useIsAdmin } from '../admin/useIsAdmin';
import { usePush } from '../push/usePush';
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
import InvitePanel from '../couple/InvitePanel';
import { referralLink } from '../../shared/lib/invite';
import { PinShape } from '../map/ConquestMap';
import { useCoupleState, useReferralCount, useUpdateNickname, type Couple } from '../couple/useCoupleState';
import { useStreakDays } from '../today/useToday';
import { categoryLabel, useCoupleMembers, useRecords } from '../map/useRecords';
import RecordDetailSheet from '../map/RecordDetailSheet';
import ExpenseSheet from './ExpenseSheet';
import { balanceLineOf, monthKeyOf, payerNameOf, summarizeMonth } from './expenseSummary';
import {
  dPlus,
  nextOccurrence,
  upcomingMilestones,
  useAddAnniversary,
  useAnniversaries,
  useDeleteAnniversary,
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
  const isAdmin = useIsAdmin();
  const startedAt = couple?.started_at ?? (isMock ? '2026-01-24' : null);
  const today = toDateString(new Date());
  // 가계부: 월간 카드 → 상세 시트 → 그 안에서 기록 상세까지 (새 화면 없이 레이어로만)
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);

  return (
    <main className="space-y-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">우리</h1>
        <ActivityBell />
      </header>
      {/* 아직 짝꿍이 안 들어온 커플(pending) — 연결될 때까지 초대 칸이 맨 위에 떠 있다 */}
      {couple?.status === 'pending' && (
        <section className="rounded-2xl rounded-tl-md border-2 border-pink/40 bg-white/70 p-4 shadow-sm">
          <p className="text-base font-bold">💌 짝꿍을 초대해 주세요</p>
          <p className="mb-3 mt-1 break-keep text-sm opacity-60">
            아직 둘이 연결되지 않았어요. 지금 남기는 기록은 연결되면 짝꿍에게도 보여요.
          </p>
          <InvitePanel code={couple.invite_code} />
        </section>
      )}
      <DdayCard startedAt={startedAt} today={today} coupleId={couple?.id} mock={isMock} />
      <ExpenseMonthCard today={today} onOpen={() => setExpenseOpen(true)} />
      <ThemeCard couple={couple} userId={userId} mock={isMock} />
      <ReferralCard coupleId={couple?.id} mock={isMock} />
      <SettingsCard
        coupleId={couple?.id}
        userId={userId}
        nickname={profile?.nickname ?? (isMock ? '체리' : '')}
        mock={isMock}
        dayCutoff={couple?.day_cutoff ?? 0}
        startedAt={startedAt}
      />

      {/* 관리자 계정에만 보이는 지름길 — 판별·데이터 접근은 전부 서버(ADMIN_USER_IDS)가 한다 */}
      {isAdmin && (
        <a
          href="/admin"
          className="block rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-5 py-3.5 text-center text-sm font-bold shadow-sm active:translate-y-px"
        >
          🛠️ 관리자 현황 보기
        </a>
      )}

      <ExpenseSheet
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        today={today}
        // 미리보기에서도 '나'가 맨 앞에 오게 (MOCK_MEMBERS의 user_id와 맞춘다)
        userId={userId ?? (isMock ? 'mock-me' : undefined)}
        onSelectRecord={setDetailRecordId}
      />
      {/* 가계부 시트 위에 겹쳐 뜬다 — 닫으면 보던 달로 그대로 돌아온다 */}
      <RecordDetailSheet recordId={detailRecordId} onClose={() => setDetailRecordId(null)} />
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
/**
 * 친구 커플에게 소개하기 (growth-monetization-v0.1 §1) — 소개 링크 공유 + 성과 표시.
 * 소개로 시작한 커플이 1쌍 생기면 '단짝 핀'이 열린다. 비교·순위는 만들지 않는다 (명세 §3.3).
 */
function ReferralCard({ coupleId, mock }: { coupleId: string | undefined; mock: boolean }) {
  const count = useReferralCount(!mock && Boolean(coupleId)).data ?? (mock ? 1 : 0);
  const [copied, setCopied] = useState(false);
  const [sentHint, setSentHint] = useState(false);
  // 미리보기(mock)에서도 카드 모양은 보여준다 — 링크만 가짜
  const link = coupleId ? referralLink(coupleId) : mock ? referralLink('00000000-0000-0000-0000-000000000000') : null;
  if (!link) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      return false;
    }
  };
  // 공유 시트가 없거나 거부되는 환경(PC·일부 인앱)에서는 복사로 폴백하고 **말해준다** —
  // 예전엔 조용히 삼켜서 버튼이 죽은 것처럼 보였다 (사용자 제보 2026-08-03)
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: '우리의 도화지',
          text: '우리가 쓰는 커플 기록장이야 — 데이트마다 지도가 칠해져 🖍️',
          url: link,
        });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return; // 시트를 그냥 닫음
      }
    }
    if (await copy()) {
      setSentHint(true);
      setTimeout(() => setSentHint(false), 2500);
    }
  };

  return (
    <section className="space-y-2.5 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">친구 커플에게 소개하기</h2>
        {count > 0 && (
          <span className="shrink-0 rounded-full bg-yellow/40 px-2.5 py-0.5 text-xs font-bold">
            💛 {count}쌍 시작!
          </span>
        )}
      </div>
      <p className="break-keep text-xs leading-relaxed opacity-60">
        {count > 0
          ? '우리 소개로 시작한 커플이 있어요 — 도화지 꾸미기에서 하트 둘이 겹친 단짝 핀을 쓸 수 있어요.'
          : '소개한 친구 커플이 도화지를 시작하면, 하트 둘이 겹친 단짝 핀이 열려요.'}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void share()}
          className="flex-1 rounded-2xl rounded-tl-md bg-pink py-2.5 text-sm font-bold text-white active:translate-y-px"
        >
          {sentHint ? '링크 복사됨 — 붙여넣어 보내요!' : '💌 소개장 보내기'}
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          className="flex-1 rounded-2xl rounded-br-md border-2 border-ink/15 bg-white/70 py-2.5 text-sm font-bold active:translate-y-px"
        >
          {copied ? '복사됨 ✓' : '링크 복사'}
        </button>
      </div>
      {mock && <p className="text-xs opacity-50">미리보기예요 — 실제 링크는 연결 후에 만들어져요</p>}
    </section>
  );
}

/** 핀 선택 칩 속 실제 모양 — 지도에 찍히는 PinShape 그대로 (글자 기호보다 정확하다) */
function PinChip({ style, active }: { style: string; active: boolean }) {
  return (
    <svg viewBox="-11 -15 22 27" className="h-6 w-6 shrink-0" aria-hidden>
      <PinShape style={style} x={0} y={4} r={4.2} color={active ? '#ffffff' : '#e8637c'} sf={0.9} />
    </svg>
  );
}

/** 고른 핀·종이가 지도에서 어떻게 보일지 — 작은 도화지 조각 미리보기 */
function ThemePreview({ pin, paper }: { pin: string; paper: string }) {
  const color = PAPER_TONES.find((t) => t.key === paper)?.color ?? '#fdfcf7';
  return (
    <svg
      viewBox="0 0 200 84"
      className="w-full rounded-xl rounded-tl-sm border border-ink/10"
      style={{ backgroundColor: color }}
      aria-label="꾸미기 미리보기"
    >
      {/* 칠해진 동네 얼룩 + 데이트 코스 점선 — 지도 느낌만 살짝 */}
      <path
        d="M 18 52 C 26 30 58 24 74 36 C 90 48 78 66 56 70 C 36 74 12 68 18 52 Z"
        fill="#8cab68"
        opacity="0.24"
      />
      <path
        d="M 120 30 C 138 18 168 22 176 38 C 184 54 166 66 146 62 C 128 58 108 44 120 30 Z"
        fill="#8cab68"
        opacity="0.15"
      />
      <path
        d="M 52 50 C 80 30 120 58 150 40"
        fill="none"
        stroke="#e8637c"
        strokeWidth="2"
        strokeDasharray="5 5"
        opacity="0.55"
      />
      <PinShape style={pin} x={52} y={50} r={7} color="#e8637c" sf={1.4} />
      <PinShape style={pin} x={150} y={40} r={7} color="#e8637c" sf={1.4} />
    </svg>
  );
}

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

  // 단짝 핀(소개 보상) 해금 판정용 — 베타에는 어차피 전부 열려 있지만 수치는 미리 흐르게 둔다
  const referralCount = useReferralCount(!mock && Boolean(couple?.id)).data ?? 0;

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

      <ThemePreview pin={currentPin} paper={currentPaper} />

      <div className="space-y-1.5">
        <span className="text-sm">핀 모양</span>
        <div className="flex flex-wrap gap-1.5">
          {PIN_STYLES.map((p) => {
            const unlocked = isUnlocked(p, theme, streak, referralCount);
            const selected = currentPin === p.key;
            return (
              <button
                key={p.key}
                type="button"
                disabled={disabled || !unlocked}
                onClick={() => pick({ pin: p.key })}
                className={`flex items-center gap-1 rounded-full py-1 pl-1.5 pr-3 text-sm ${
                  selected ? 'bg-pink font-bold text-white' : 'border border-ink/15 bg-white/60'
                } ${!unlocked ? 'opacity-45' : ''}`}
              >
                <PinChip style={p.key} active={selected} />
                {p.label}
                {!unlocked && (
                  <span className="text-[11px] opacity-70">
                    {p.kind === 'referral' ? '🔒 친구 커플' : `🔒 ${p.unlock}일`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm">도화지 톤</span>
        <div className="flex flex-wrap gap-2">
          {PAPER_TONES.map((t) => {
            const unlocked = isUnlocked(t, theme, streak, referralCount);
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
          : `둘 다 채운 날이 이어지면 새 꾸미기가 열려요 — 지금까지 최고 ${Math.max(theme.maxStreak ?? 0, streak)}일. 단짝 핀은 친구 커플을 소개하면 열려요.`}
      </p>
      {mock && <p className="text-xs opacity-50">미리보기예요 — 저장은 짝꿍과 연결한 뒤에 할 수 있어요</p>}
    </section>
  );
}

// ── 가계부 월간 카드: 합계·횟수·평균·밸런스 (정산 압박·경고색 금지).
//    카드를 누르면 월 이동·카테고리 비중·지출 목록이 있는 상세 시트가 열린다 ──
function ExpenseMonthCard({ today, onOpen }: { today: string; onOpen: () => void }) {
  const [y, m] = today.split('-').map(Number);
  // 상세 시트와 **같은 집계 함수**를 쓴다 — 예전엔 카드만 별도 쿼리라 숫자가 어긋났다
  const { data: records = [] } = useRecords();
  const members = useCoupleMembers();
  const { total, dateCount, average, categories, byPayer } = summarizeMonth(records, monthKeyOf(y, m));
  const balanceLine = balanceLineOf(byPayer, (userId) => payerNameOf(members.data, userId));

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full space-y-3 rounded-2xl border-2 border-ink/15 bg-white/60 p-4 text-left active:translate-y-px"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{m}월 데이트 가계부</h2>
        <span className="text-xs opacity-40">자세히 ›</span>
      </div>
      {dateCount === 0 ? (
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
            {categories.map(([c, v]) => `${categoryLabel(c)} ${Math.round((v / total) * 100)}%`).join(' · ')}
          </p>
          <p className="rounded-xl rounded-tl-sm bg-sky/25 px-3 py-2 text-sm">{balanceLine}</p>
        </>
      )}
    </button>
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
      {supabase && <PushCard disabled={disabled} />}
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

/**
 * 알림 — 짝꿍이 오늘을 남기면 잠금이 풀린다. 그 순간만 알린다 (하루 3건 상한).
 * 아이폰은 홈 화면에 추가한 앱에서만 받을 수 있어 그 경우 설치 안내로 보낸다.
 */
function PushCard({ disabled }: { disabled: boolean }) {
  const { state, busy, enable, disable } = usePush();
  const on = state === 'on';

  const detail: Record<typeof state, string> = {
    on: '짝꿍이 오늘을 남기면 알려드려요 · 하루 3번까지만',
    off: '짝꿍이 오늘을 남기면 알려드려요 · 하루 3번까지만',
    denied: '알림이 차단돼 있어요 — 폰 설정에서 이 앱의 알림을 켜 주세요',
    'needs-install': '홈 화면에 추가하면 알림을 받을 수 있어요',
    unsupported: '이 브라우저에서는 알림을 지원하지 않아요',
  };

  return (
    <div className="space-y-2 border-t border-ink/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">짝꿍 알림</p>
        {state === 'needs-install' ? (
          <a
            href="/install"
            className="shrink-0 rounded-full border-2 border-pink/40 px-4 py-1.5 text-xs font-bold text-pink"
          >
            설치 안내
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void (on ? disable() : enable())}
            disabled={disabled || busy || state === 'denied' || state === 'unsupported'}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold active:translate-y-px disabled:opacity-40 ${
              on ? 'bg-pink text-white' : 'border-2 border-ink/20'
            }`}
          >
            {busy ? '…' : on ? '켜짐' : '알림 켜기'}
          </button>
        )}
      </div>
      <p className="break-keep text-xs leading-relaxed opacity-55">{detail[state]}</p>
    </div>
  );
}

