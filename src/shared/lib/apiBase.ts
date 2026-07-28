/**
 * 서버 함수(Vercel Fn) 호출 주소.
 *
 * 앱인토스 미니앱은 .ait 번들이 `*.tossmini.com`에서 서빙되므로 `/api/...` 상대 경로가
 * 그 도메인을 가리켜 404가 난다 (docs/spike-result.md, 2026-07-25 실측). 우리 서버 함수는
 * Vercel에만 있으니 같은 출처가 아닐 때는 절대 주소로 부른다.
 * (해당 함수들은 tossmini/vercel 출처에 대해 CORS를 허용한다.)
 */
const VERCEL_ORIGIN = 'https://couple-map-azure.vercel.app';

/** 서버 함수가 우리 출처에 있는가 — 웹·프리뷰·로컬 개발은 전부 같은 출처 */
function isSameOriginApi(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app');
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return isSameOriginApi() ? p : `${VERCEL_ORIGIN}${p}`;
}
