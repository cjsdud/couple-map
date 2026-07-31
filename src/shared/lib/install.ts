/**
 * "홈 화면에 추가" 설치 안내를 위한 환경 판별.
 *
 * 우리 배포 경로는 스토어가 아니라 링크다 — 초대 링크를 카톡으로 받는 게 대부분인데,
 * 카톡 인앱 브라우저에서는 홈 화면 추가가 **불가능**하다. 그래서 "먼저 Safari로 열기"를
 * 안내하는 단계가 반드시 필요하다 (uniple.app도 같은 구조, 2026-07-28 확인).
 */

export type InstallStep =
  | 'installed' // 이미 홈 화면 앱으로 실행 중
  | 'ios-inapp' // 아이폰 + 카톡 등 인앱 브라우저 → Safari로 옮겨야 함
  | 'ios-safari' // 아이폰 + Safari → 공유 → 홈 화면에 추가
  | 'android-inapp' // 안드로이드 + 인앱 브라우저 → Chrome으로
  | 'android' // 안드로이드 + 일반 브라우저 → 설치 배너/메뉴
  | 'desktop'; // PC → 폰으로 열도록 안내

const ua = () => navigator.userAgent;

/** 홈 화면 앱으로 실행 중인가 */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  // iPadOS 13+는 UA를 Mac으로 보내므로 터치 지원으로 함께 판별
  return (
    /iPad|iPhone|iPod/.test(ua()) ||
    (/Macintosh/.test(ua()) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)
  );
}

export function isAndroid(): boolean {
  return /Android/.test(ua());
}

/** 카톡·인스타 등 앱 안에 박힌 브라우저 — 홈 화면 추가 메뉴가 없다 */
export function isInAppBrowser(): boolean {
  return /KAKAOTALK|Instagram|FBAN|FBAV|NAVER|Line\/|DaumApps|everytimeApp|Snapchat/i.test(ua());
}

export function installStep(): InstallStep {
  if (isStandalone()) return 'installed';
  if (isIOS()) return isInAppBrowser() ? 'ios-inapp' : 'ios-safari';
  if (isAndroid()) return isInAppBrowser() ? 'android-inapp' : 'android';
  return 'desktop';
}

/** 주소 복사 — 인앱 브라우저에서 Safari로 옮길 때 쓴다 */
export async function copyCurrentLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
