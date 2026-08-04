/**
 * 초대 링크 딥링크 — `/?invite=CODE` 로 들어오면 코드를 잡아 두었다가
 * 로그인·닉네임을 마친 뒤 커플 연결 화면에 자동으로 채워 준다.
 * (짝꿍이 코드를 손으로 옮겨 적는 마찰 제거 — 활성화 퍼널의 최대 구멍)
 */

const KEY = 'dohwaji:inviteCode';

/** 앱 부팅 시 1회 — URL의 invite 파라미터를 세션에 옮기고 URL에서는 지운다 */
export function captureInviteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('invite');
  if (!raw) return;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (/^[A-Z0-9]{6}$/.test(code)) {
    try {
      sessionStorage.setItem(KEY, code);
    } catch {
      // 저장 불가 환경이면 프리필만 포기 (코드 직접 입력은 언제나 가능)
    }
  }
  params.delete('invite');
  const q = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : ''));
}

/** 잡아 둔 초대 코드 (없으면 null) */
export function pendingInviteCode(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** 연결 성공 후 소비 */
export function clearInviteCode() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}

/** 공유용 초대 링크 */
export function inviteLink(code: string): string {
  return `${window.location.origin}/?invite=${code}`;
}

// ── 친구 커플 소개 (growth-monetization-v0.1 §1) ──────────────────
// 소개 링크(/install?ref=<couple_id>)로 들어온 사람이 나중에 커플이 되면,
// 그 커플 행에 소개해 준 커플 id를 남긴다 (0018). 가입까지 며칠 걸릴 수 있어
// sessionStorage가 아니라 localStorage에 잡아 둔다.

const REF_KEY = 'dohwaji:refCouple';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 부팅 시 1회 — URL의 ref 파라미터를 잡아 두고 URL에서는 지운다 */
export function captureRefFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('ref');
  if (!raw) return;
  if (UUID_RE.test(raw)) {
    try {
      localStorage.setItem(REF_KEY, raw.toLowerCase());
    } catch {
      // 저장 불가 환경 — 귀속만 포기 (앱 사용에는 지장 없음)
    }
  }
  params.delete('ref');
  const q = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : ''));
}

/** 잡아 둔 소개 커플 id (없으면 null) */
export function pendingRefCouple(): string | null {
  try {
    return localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

/** 귀속 시도 후 소비 */
export function clearRefCouple() {
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    // 무시
  }
}

/** 공유용 소개 링크 — 소개 페이지로 보낸다 (첫인상은 /install이 낫다) */
export function referralLink(coupleId: string): string {
  return `${window.location.origin}/install?ref=${coupleId}`;
}

// ── 연결 대기 중 '먼저 둘러보기' (2026-08-03) ─────────────────────
// 코드를 만든 사람이 짝꿍을 기다리는 동안 앱에 갇히지 않게 한다.
// 이 플래그가 있으면 pending 커플도 셸에 들어가고, 우리 탭 맨 위에
// 초대 칸(InvitePanel)이 연결될 때까지 떠 있다.

const SOLO_KEY = 'dohwaji:soloEntered:';

export function markSoloEntered(coupleId: string) {
  try {
    localStorage.setItem(SOLO_KEY + coupleId, '1');
  } catch {
    // 저장 불가 환경 — 이번 세션에서는 게이트가 다시 대기 화면을 보여줄 뿐
  }
}

export function hasSoloEntered(coupleId: string): boolean {
  try {
    return localStorage.getItem(SOLO_KEY + coupleId) === '1';
  } catch {
    return false;
  }
}
