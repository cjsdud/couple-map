/**
 * 도화지 꾸미기 테마 (A안: 해금형 — 스트릭 보상과 결합, 명세 §3.2 "보상 = 테마 재화").
 * 자유 색상환 대신 도화지 팔레트 계열 큐레이션으로 손그림 정체성을 지킨다.
 */

export interface CoupleTheme {
  pin?: string;
  paper?: string;
  /** 해금 판정용 최고 스트릭 (한 번 달성하면 영구 해금) */
  maxStreak?: number;
}

export interface ThemeOption {
  key: string;
  label: string;
  /** 해금 기준값 — streak면 잔디 일수, referral이면 소개 성공 커플 수 (0 = 처음부터) */
  unlock: number;
  /** 해금 방식 (기본 streak) — referral은 친구 커플 소개 성공으로 열린다 (설계 v0.1 §2) */
  kind?: 'streak' | 'referral';
}

/** 베타 기간엔 전부 해금 (사용자 결정 2026-07-21) — 정식 오픈 때 false로 돌려 해금 루프 가동 */
export const BETA_ALL_UNLOCKED = true;

export const PIN_STYLES: ThemeOption[] = [
  { key: 'dot', label: '콕 핀', unlock: 0 },
  { key: 'heart', label: '하트', unlock: 0 },
  { key: 'star', label: '별', unlock: 7 },
  { key: 'tape', label: '테이프', unlock: 14 },
  { key: 'ribbon', label: '리본', unlock: 21 },
  // 단짝 핀 — 친구 커플 소개가 성공(active)하면 열리는 유일한 핀 (growth-monetization-v0.1)
  { key: 'buddy', label: '단짝', unlock: 1, kind: 'referral' },
];

export const PAPER_TONES: (ThemeOption & { color: string })[] = [
  { key: 'paper', label: '도화지', color: '#fdfcf7', unlock: 0 },
  { key: 'cream', label: '크림', color: '#faf3e3', unlock: 0 },
  { key: 'sky', label: '하늘빛', color: '#f2f7fa', unlock: 7 },
  { key: 'blossom', label: '벚꽃빛', color: '#fdf3f6', unlock: 14 },
  { key: 'mint', label: '민트빛', color: '#f0f7f1', unlock: 21 },
  { key: 'lavender', label: '라벤더', color: '#f5f2fa', unlock: 30 },
];

export const DEFAULT_THEME = { pin: 'dot', paper: 'paper' } as const;

export function paperColor(theme: CoupleTheme | null | undefined): string {
  const key = theme?.paper ?? DEFAULT_THEME.paper;
  return PAPER_TONES.find((t) => t.key === key)?.color ?? PAPER_TONES[0].color;
}

export function pinStyle(theme: CoupleTheme | null | undefined): string {
  return theme?.pin ?? DEFAULT_THEME.pin;
}

/**
 * 해금 여부 (베타 기간엔 전부 열림):
 * - streak: 현재 또는 역대 최고 스트릭이 기준 이상이면 영구 해금
 * - referral: 소개로 시작한 커플(active) 수가 기준 이상이면 해금
 */
export function isUnlocked(
  option: ThemeOption,
  theme: CoupleTheme | null | undefined,
  currentStreak: number,
  referralCount = 0,
): boolean {
  if (BETA_ALL_UNLOCKED) return true;
  if (option.kind === 'referral') return referralCount >= option.unlock;
  const best = Math.max(theme?.maxStreak ?? 0, currentStreak);
  return best >= option.unlock;
}
