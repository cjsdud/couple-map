/**
 * 실행 환경 판별 + 네이티브 전용 동작.
 *
 * 같은 웹 코드가 세 곳에서 돈다:
 *   ① 웹/PWA (couple-map-azure.vercel.app)
 *   ② 스토어 네이티브 셸 (Capacitor — capacitor://localhost, http://localhost)
 *   ③ 앱인토스 미니앱 (*.tossmini.com)
 * 출처가 다르면 상대 경로 API·OAuth 리다이렉트가 깨지므로 여기서 한 번에 구분한다.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function cap(): CapacitorGlobal | undefined {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** 스토어 네이티브 셸(iOS·Android) 안인가 */
export function isNativeApp(): boolean {
  return cap()?.isNativePlatform?.() === true;
}

/** 'ios' | 'android' | 'web' */
export function nativePlatform(): string {
  return cap()?.getPlatform?.() ?? 'web';
}

/** 앱인토스 미니앱 안인가 (tossmini 도메인 또는 토스 WebView UA) */
export function isAppsInToss(): boolean {
  return (
    /\.(apps|private-apps)\.tossmini\.com$/.test(window.location.hostname) ||
    navigator.userAgent.includes('AppsInToss')
  );
}

/** 네이티브 셸에서 카카오가 돌아올 커스텀 스킴 (Kakao Developers Redirect URI에 등록) */
export const NATIVE_KAKAO_REDIRECT = 'dohwaji://kakao';
