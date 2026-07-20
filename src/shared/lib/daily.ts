/**
 * '오늘' 날짜·잔디·스트릭 계산 유틸 (tech-design §4).
 * 커플별 마감 시각(day_cutoff)을 기준으로 "그날"을 정하고,
 * 잔디(월 그리드)와 스트릭(둘 다 채운 날 연속)을 클라이언트에서 계산한다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 로컬 타임존 기준 YYYY-MM-DD 문자열 */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 커플 마감 시각 기준 '그날'(entry_date) 계산: now에서 cutoff 시간을 뺀 시각의 날짜.
 * 서버 트리거가 같은 규칙으로 재검증한다 (tech-design §4).
 *
 * 경계 케이스 (단위 테스트 대신 예시로 고정):
 * - 자정 마감(dayCutoff=0):
 *     7/19 23:59 → '2026-07-19' (아직 오늘)
 *     7/20 00:00 → '2026-07-20' (바로 다음 날)
 * - 새벽 4시 마감(dayCutoff=4):
 *     7/20 01:30 → '2026-07-19' (새벽 데이트 사진도 어제 칸에)
 *     7/20 03:59 → '2026-07-19' (마감 직전까지 어제)
 *     7/20 04:00 → '2026-07-20' (마감 시각부터 오늘)
 */
export function entryDateFor(now: Date, dayCutoff: number): string {
  return toDateString(new Date(now.getTime() - dayCutoff * 60 * 60 * 1000));
}

export interface StreakDay {
  /** YYYY-MM-DD */
  date: string;
  /** 그날 둘 다 참여(기분·질문 답·한 줄 일기 중 1+ — 사진은 자유, 인정 요건 아님)했는가 */
  bothFilled: boolean;
}

/**
 * 스트릭 = 둘 다 채운 날의 연속 (명세 §3.2 — 벌칙 없음, 보상 문구만).
 * 입력 배열의 가장 늦은 날짜를 '오늘'로 보고 거꾸로 센다.
 * 오늘이 아직 안 채워졌어도 스트릭을 끊지 않는다(하루가 끝나기 전이므로):
 * 오늘이 비어 있으면 어제부터 센다.
 */
export function calcStreak(days: StreakDay[]): number {
  if (days.length === 0) return 0;
  const filled = new Set(days.filter((d) => d.bothFilled).map((d) => d.date));
  const latest = days.reduce((a, b) => (a.date > b.date ? a : b)).date;

  let cursor = new Date(`${latest}T12:00:00`); // 정오 기준 — DST 경계에서도 날짜 계산 안전
  // 오늘 미채움은 '아직 진행 중'이므로 어제부터 센다
  if (!filled.has(toDateString(cursor))) {
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  let streak = 0;
  while (filled.has(toDateString(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
}

/**
 * 잔디용 월 그리드: 일요일 시작 주(週) 배열.
 * 각 칸은 YYYY-MM-DD, 앞뒤 패딩은 null.
 * @param year  예: 2026
 * @param month 1~12
 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeks: (string | null)[][] = [];
  let week: (string | null)[] = new Array<string | null>(first.getDay()).fill(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    week.push(toDateString(new Date(year, month - 1, d)));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

/** 시작~끝(포함) 날짜 문자열 목록. 스트릭 계산 입력 만들 때 사용. */
export function dateRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  let cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(toDateString(cursor));
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return out;
}

/** n일 전 날짜 문자열 (오늘 포함 계산이 필요하면 n-1을 넘긴다) */
export function daysAgo(from: string, n: number): string {
  return toDateString(new Date(new Date(`${from}T12:00:00`).getTime() - n * DAY_MS));
}
