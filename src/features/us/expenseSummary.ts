/**
 * 가계부 집계 — **월간 카드와 상세 시트가 이 함수를 함께 쓴다.**
 * 예전에는 카드가 별도 쿼리를 쓰다 보니 미리보기에서 카드와 시트의 숫자가 어긋났다.
 */
import type { RecordRow } from '../map/useRecords';

export const monthKeyOf = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`;

/**
 * 한 달 지출 집계 — **월간 카드와 상세 시트가 같은 함수를 쓴다.**
 * 예전에는 카드가 별도 쿼리를 쓰다 보니 미리보기에서 카드와 시트의 숫자가 어긋났다.
 */
export function summarizeMonth(records: RecordRow[], monthKey: string) {
  const monthRecords = records
    .filter((r) => r.date.startsWith(monthKey) && r.expenses.length > 0)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const rows = monthRecords.flatMap((r) => r.expenses);
  const total = rows.reduce((s, e) => s + e.amount, 0);
  const dateCount = monthRecords.length;

  const byCategory = new Map<string, number>();
  for (const e of rows) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const byPayer = new Map<string, number>();
  for (const e of rows) if (e.paid_by) byPayer.set(e.paid_by, (byPayer.get(e.paid_by) ?? 0) + e.amount);

  return {
    monthRecords,
    total,
    dateCount,
    average: dateCount > 0 ? Math.round(total / dateCount) : 0,
    categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    byPayer,
  };
}

/**
 * 밸런스 한 줄 — 한쪽으로 크게 기울 때만 언급한다.
 * 정산 압박·경고색·리더보드 금지 (명세 §3.3·§5.4) — 얼마를 '더 냈다'가 아니라 분위기만.
 */
export function balanceLineOf(
  byPayer: Map<string, number>,
  nameOf: (userId: string | null) => string,
): string {
  const paidTotal = [...byPayer.values()].reduce((a, b) => a + b, 0);
  if (paidTotal > 0) {
    const [topId, topAmount] = [...byPayer.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topAmount / paidTotal >= 0.6) return `이 달엔 ${nameOf(topId)} 쪽에서 좀 더 자주 냈어요`;
  }
  return '이번 달은 사이좋게 나눠 내고 있어요';
}

/** 낸 사람 이름 — 함께 낸 항목은 '함께' */
export function payerNameOf(
  members: { user_id: string; nickname: string }[] | undefined,
  userId: string | null,
): string {
  if (userId === null) return '함께';
  return members?.find((mem) => mem.user_id === userId)?.nickname ?? '짝꿍';
}
