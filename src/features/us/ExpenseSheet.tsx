import { useState } from 'react';
import BottomSheet from '../../shared/ui/BottomSheet';
import { categoryLabel, useCoupleMembers, useRecords, type RecordRow } from '../map/useRecords';
import {
  balanceLineOf,
  monthKeyOf,
  payerNameOf,
  payerShares,
  summarizeMonth,
} from './expenseSummary';

/**
 * 가계부 상세 시트 — 우리 탭의 월간 카드를 누르면 열린다 (새 화면 금지, 절대 규칙 1).
 *
 * 지금까지 개별 지출을 보려면 지도에서 그 기록을 찾아 열어야 했다. 여기서 월 단위로
 * 한 번에 훑고, 항목을 누르면 그 데이트 기록으로 바로 넘어간다.
 * 톤 규칙(명세 §3.3·§5.4): 정산 압박·경고색·리더보드 금지 — 누가 얼마 '더 냈다'가 아니라
 * 어디에 어떻게 썼는지만 담담히 보여 준다.
 */

/** 카테고리별 막대 색 — 도화지 팔레트 안에서만 (경고색 금지) */
const CATEGORY_BAR: Record<string, string> = {
  meal: 'bg-pink/70',
  cafe: 'bg-yellow/80',
  play: 'bg-green/70',
  move: 'bg-sky/80',
  gift: 'bg-pink/40',
};
const barClass = (category: string) => CATEGORY_BAR[category] ?? 'bg-ink/25';

export default function ExpenseSheet({
  open,
  onClose,
  today,
  userId,
  onSelectRecord,
}: {
  open: boolean;
  onClose: () => void;
  /** 로그인한 사람 — 낸 사람 목록에서 '나'를 맨 앞에 두기 위해 */
  userId: string | undefined;
  /** 오늘(YYYY-MM-DD) — 처음 열 때 이 달을 보여주고, 다음 달로는 못 넘어가게 한다 */
  today: string;
  /** 지출 항목 탭 → 그 데이트 기록 상세 열기 */
  onSelectRecord: (recordId: string) => void;
}) {
  const [thisYear, thisMonth] = today.split('-').map(Number);
  const [view, setView] = useState({ year: thisYear, month: thisMonth });
  const { data: records = [] } = useRecords();
  const members = useCoupleMembers();

  const isCurrentMonth = view.year === thisYear && view.month === thisMonth;
  const summary = summarizeMonth(records, monthKeyOf(view.year, view.month));
  const { monthRecords, total, dateCount, average, categories, byPayer } = summary;
  const nameOf = (id: string | null) => payerNameOf(members.data, id);
  const balanceLine = balanceLineOf(byPayer, nameOf);
  const shares = payerShares(summary, userId, nameOf);

  const goPrev = () =>
    setView((v) => (v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 }));
  const goNext = () => {
    if (isCurrentMonth) return;
    setView((v) => (v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 }));
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="가계부">
      <div className="space-y-4 pb-2">
        {/* 제목은 BottomSheet가 그린다 — 여기서는 월 이동만 */}
        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              aria-label="이전 달"
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs opacity-60 active:bg-ink/10"
            >
              ◀
            </button>
            <p className="min-w-[5.5rem] text-center text-sm font-semibold">
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

        {dateCount === 0 ? (
          <div className="space-y-1 py-10 text-center">
            <p className="text-3xl" aria-hidden>
              🧾
            </p>
            <p className="break-keep text-sm opacity-60">
              이 달엔 적어 둔 지출이 없어요 — 데이트 기록에 살짝 적어 두면 여기에 모아 드려요
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl rounded-tl-sm border-2 border-ink/10 bg-white/70 p-2.5">
                <p className="text-xs opacity-50">합계</p>
                <p className="text-sm font-bold">{total.toLocaleString()}원</p>
              </div>
              <div className="rounded-xl border-2 border-ink/10 bg-white/70 p-2.5">
                <p className="text-xs opacity-50">데이트</p>
                <p className="text-sm font-bold">{dateCount}번</p>
              </div>
              <div className="rounded-xl rounded-br-sm border-2 border-ink/10 bg-white/70 p-2.5">
                <p className="text-xs opacity-50">평균</p>
                <p className="text-sm font-bold">{average.toLocaleString()}원</p>
              </div>
            </div>

            <section className="space-y-2">
              <p className="text-xs font-semibold opacity-50">어디에 썼나</p>
              <ul className="space-y-2">
                {categories.map(([category, amount]) => {
                  const pct = Math.round((amount / total) * 100);
                  return (
                    <li key={category}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-semibold">{categoryLabel(category)}</span>
                        <span className="tabular-nums opacity-70">
                          {amount.toLocaleString()}원 <span className="opacity-50">{pct}%</span>
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10">
                        <div
                          className={`h-full rounded-full ${barClass(category)}`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {shares.length > 0 && (
              <section className="space-y-2">
                <p className="text-xs font-semibold opacity-50">낸 사람</p>
                <ul className="space-y-2">
                  {shares.map((s2) => (
                    <li key={s2.key}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate font-semibold">{s2.name}</span>
                        <span className="shrink-0 tabular-nums opacity-70">
                          {s2.amount.toLocaleString()}원 <span className="opacity-50">{s2.pct}%</span>
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10">
                        <div
                          className={`h-full rounded-full ${s2.bar}`}
                          style={{ width: `${Math.max(s2.pct, 2)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="rounded-xl rounded-tl-sm bg-sky/25 px-3 py-2 text-sm">{balanceLine}</p>

            <section className="space-y-2">
              <p className="text-xs font-semibold opacity-50">지출 하나하나</p>
              <ul className="space-y-2">
                {monthRecords.map((record) => (
                  <li key={record.id}>
                    <button
                      type="button"
                      onClick={() => onSelectRecord(record.id)}
                      className="w-full rounded-2xl rounded-tl-md border-2 border-ink/10 bg-white/70 p-3 text-left active:translate-y-px"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {courseLabel(record)}
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums">
                          {record.expenses.reduce((s, e) => s + e.amount, 0).toLocaleString()}원
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs opacity-50">{record.date}</p>
                      <ul className="mt-2 space-y-1">
                        {record.expenses.map((e) => (
                          <li key={e.id} className="flex items-center gap-2 text-xs">
                            <span className="max-w-20 truncate rounded-full bg-yellow/40 px-2 py-0.5">
                              {categoryLabel(e.category)}
                            </span>
                            <span className="flex-1 tabular-nums">{e.amount.toLocaleString()}원</span>
                            <span className="opacity-60">{nameOf(e.paid_by)}</span>
                          </li>
                        ))}
                      </ul>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

/** "안목해변 외 2곳" — 코스가 길어도 한 줄로 */
function courseLabel(record: RecordRow): string {
  const spots = record.spots.slice().sort((a, b) => a.seq - b.seq);
  if (spots.length === 0) return '기록';
  return spots.length === 1 ? spots[0].name : `${spots[0].name} 외 ${spots.length - 1}곳`;
}
