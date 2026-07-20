import { useState } from 'react';
import { signOut, useSession } from '../../shared/lib/auth';
import { toDateString } from '../../shared/lib/daily';
import { supabase } from '../../shared/lib/supabase';
import { useCoupleState } from '../couple/useCoupleState';
import { CATEGORY_LABEL, useCoupleMembers } from '../map/useRecords';
import { dPlus, upcomingMilestones, useMonthlyExpenses, useUpdateCouple } from './useUs';

/** 우리 탭: 디데이·기념일 / 가계부 월간 카드 / 설정 (명세 §3.3) */
export default function UsScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const coupleQuery = useCoupleState(userId);
  const couple = coupleQuery.data?.couple ?? null;
  const isMock = new URLSearchParams(window.location.search).has('mock');
  const startedAt = couple?.started_at ?? (isMock ? '2026-01-24' : null);
  const today = toDateString(new Date());

  return (
    <main className="space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">우리</h1>
      <DdayCard startedAt={startedAt} today={today} />
      <ExpenseMonthCard today={today} />
      <SettingsCard
        coupleId={couple?.id}
        userId={userId}
        dayCutoff={couple?.day_cutoff ?? 0}
        ratioA={couple?.ratio_a ?? 50}
        startedAt={startedAt}
      />
    </main>
  );
}

// ── 디데이 + 다가오는 기념일 (100일 단위·주년 자동) ──────────────
function DdayCard({ startedAt, today }: { startedAt: string | null; today: string }) {
  if (!startedAt) {
    return (
      <section className="rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/60 p-5 text-center">
        <p className="text-sm opacity-60">함께한 지</p>
        <p className="text-3xl font-bold text-pink">D+?</p>
        <p className="mt-1 text-xs opacity-50">아래 설정에서 사귄 날을 알려주시면 세어 드려요</p>
      </section>
    );
  }
  const milestones = upcomingMilestones(startedAt, today);
  return (
    <section className="space-y-3 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/60 p-5">
      <div className="text-center">
        <p className="text-sm opacity-60">함께한 지</p>
        <p className="text-4xl font-bold text-pink">D+{dPlus(startedAt, today)}</p>
        <p className="mt-0.5 text-xs opacity-50">{startedAt}부터</p>
      </div>
      {milestones.length > 0 && (
        <ul className="space-y-1.5 border-t border-ink/10 pt-3">
          {milestones.map((m) => (
            <li key={m.title} className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                🎂 {m.title}
                <span className="ml-1.5 text-xs font-normal opacity-50">{m.date}</span>
              </span>
              <span className={m.dDay <= 7 ? 'font-bold text-pink' : 'opacity-60'}>
                {m.dDay === 0 ? '오늘!' : `D-${m.dDay}`}
              </span>
            </li>
          ))}
        </ul>
      )}
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
      balanceLine = `요즘엔 ${nick} 쪽이 자주 냈어요`;
    }
  }

  const byCategory = new Map<string, number>();
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);

  return (
    <section className="space-y-3 rounded-2xl border-2 border-ink/15 bg-white/60 p-4">
      <h2 className="text-sm font-semibold">{m}월 데이트 가계부</h2>
      {rows.length === 0 ? (
        <p className="text-sm opacity-60">이번 달 지출 기록이 아직 없어요 — 기록에 살짝 적어 두면 모아서 보여드려요</p>
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
              .map(([c, v]) => `${CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL]} ${Math.round((v / total) * 100)}%`)
              .join(' · ')}
          </p>
          <p className="rounded-xl rounded-tl-sm bg-sky/25 px-3 py-2 text-sm">{balanceLine}</p>
        </>
      )}
    </section>
  );
}

// ── 설정: 사귄 날 · 마감 시각 · 부담 비율 · 로그아웃 ─────────────
function SettingsCard({
  coupleId,
  userId,
  dayCutoff,
  ratioA,
  startedAt,
}: {
  coupleId: string | undefined;
  userId: string | undefined;
  dayCutoff: number;
  ratioA: number;
  startedAt: string | null;
}) {
  const update = useUpdateCouple(coupleId, userId);
  const [dateDraft, setDateDraft] = useState(startedAt ?? '');
  const disabled = !supabase || !coupleId || update.isPending;

  return (
    <section className="space-y-4 rounded-2xl rounded-br-md border-2 border-ink/15 bg-white/60 p-4">
      <h2 className="text-sm font-semibold">설정</h2>

      <label className="block space-y-1.5">
        <span className="text-sm">사귄 날</span>
        <div className="flex gap-2">
          <input
            type="date"
            value={dateDraft}
            onChange={(e) => setDateDraft(e.target.value)}
            max={toDateString(new Date())}
            className="min-w-0 flex-1 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-pink"
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
          &lsquo;오늘&rsquo; 마감 시각 <span className="text-xs opacity-50">— 늦은 데이트 사진이 어제 칸에 들어가게</span>
        </span>
        <select
          value={dayCutoff}
          disabled={disabled}
          onChange={(e) => update.mutate({ day_cutoff: Number(e.target.value) })}
          className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-pink disabled:opacity-50"
        >
          {Array.from({ length: 7 }, (_, h) => (
            <option key={h} value={h}>
              {h === 0 ? '자정 (기본)' : `새벽 ${h}시`}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm">
          데이트 비용 나누기 <span className="text-xs opacity-50">— 밸런스 문구 기준이 돼요</span>
        </span>
        <select
          value={ratioA}
          disabled={disabled}
          onChange={(e) => update.mutate({ ratio_a: Number(e.target.value) })}
          className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-pink disabled:opacity-50"
        >
          {[50, 60, 70, 40, 30].map((r) => (
            <option key={r} value={r}>
              {r === 50 ? '반반 (기본)' : `내가 ${r}%`}
            </option>
          ))}
        </select>
      </label>

      {supabase && (
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full py-1.5 text-center text-xs opacity-40 underline underline-offset-2"
        >
          로그아웃
        </button>
      )}
      {!supabase && <p className="text-xs opacity-50">Supabase 연결 후 바꿀 수 있어요 (데모 모드)</p>}
    </section>
  );
}
