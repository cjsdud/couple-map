/**
 * 서버 함수(Vercel Fn) 호출 주소.
 *
 * 서버 함수는 Vercel에만 있다. 웹/PWA는 같은 출처라 상대 경로로 충분하지만,
 * 스토어 네이티브 셸은 출처가 앱 내부(localhost)여서 `/api/...`가 404가 난다
 * → 같은 출처가 아닐 때는 절대 주소로 부른다 (서버 함수가 CORS를 허용한다).
 */
import { isNativeApp } from './native';

const VERCEL_ORIGIN = 'https://couple-map-azure.vercel.app';

/**
 * 서버 함수가 우리 출처에 있는가.
 * 웹·프리뷰·로컬 개발은 같은 출처지만, 네이티브 셸은 출처가 localhost여도
 * 그 localhost가 앱 내부 파일 서버라 Vercel 함수가 없다 → 절대 주소로 보내야 한다.
 */
function isSameOriginApi(): boolean {
  if (isNativeApp()) return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app');
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return isSameOriginApi() ? p : `${VERCEL_ORIGIN}${p}`;
}
