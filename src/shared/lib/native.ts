/**
 * 실행 환경 판별.
 *
 * 같은 웹 코드가 두 곳에서 돈다:
 *   ① 웹/PWA — 주 채널 (couple-map-azure.vercel.app, 홈 화면에 추가해 앱처럼 사용)
 *   ② 스토어 네이티브 셸 (Capacitor — capacitor://localhost, http://localhost)
 * 출처가 다르면 상대 경로 API·OAuth 리다이렉트가 깨지므로 여기서 한 번에 구분한다.
 *
 * 앱인토스 채널은 2026-07-28 사용자 결정으로 중단했다 (토스 로그인만 허용 →
 * 사업자 등록 필수 → 겸직 제약). 관련 코드·패키징은 제거, 경위는 docs/spike-result.md에 남아 있다.
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
