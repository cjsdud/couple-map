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

/**
 * 네이티브 로그인 복귀 경로.
 *
 * 카카오는 리다이렉트 URI에 http(s)만 받는다 (`dohwaji://kakao`는 "유효하지 않은 URL"로 거부됨).
 * 그래서 https 중계 페이지를 한 번 거친다:
 *   카카오 → https://…/kakao-app?code=… (브라우저) → dohwaji://kakao?code=… (앱)
 * 앱이 깨어나면 appUrlOpen이 코드를 받아 로그인을 마친다.
 */
export const KAKAO_APP_BRIDGE_PATH = '/kakao-app';
export const NATIVE_KAKAO_REDIRECT = `https://couple-map-azure.vercel.app${KAKAO_APP_BRIDGE_PATH}`;
/** 중계 페이지가 앱을 깨울 때 쓰는 커스텀 스킴 (네이티브 프로젝트에 선언돼 있다) */
export const NATIVE_KAKAO_SCHEME = 'dohwaji://kakao';
