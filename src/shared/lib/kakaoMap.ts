/**
 * Kakao Maps JS SDK 로더 (실지도 모드 전용).
 * tech-design §3의 "홈 = SDK 0회" 원칙은 도화지 모드가 유지하고,
 * 실지도 모드는 사용자 선택(2026-07-21)으로 추가 — JS 키 없으면 도화지 모드만 노출된다.
 */

export const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;

let loading: Promise<void> | null = null;

export function loadKakaoMaps(): Promise<void> {
  if (!KAKAO_JS_KEY) return Promise.reject(new Error('VITE_KAKAO_JS_KEY 미설정'));
  if (window.kakao?.maps?.Map) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(resolve);
    script.onerror = () => {
      loading = null;
      reject(new Error('카카오맵을 불러오지 못했어요'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
