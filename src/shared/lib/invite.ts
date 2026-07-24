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
