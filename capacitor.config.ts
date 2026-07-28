import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 스토어 네이티브 패키징 (앱스토어·플레이스토어 채널).
 *
 * 웹 코드(dist)를 그대로 감싸는 방식이라 지도·오늘·우리 화면은 웹과 동일하다.
 * 주의 두 가지:
 * - 네이티브 셸의 출처는 capacitor://localhost(iOS) / http://localhost(Android)라
 *   `/api/*` 상대 경로가 Vercel에 닿지 않는다 → src/shared/lib/apiBase.ts가 절대 주소로 돌린다.
 * - 카카오 로그인은 전체 페이지 리다이렉트 대신 시스템 브라우저 + 커스텀 스킴 복귀를 쓴다
 *   (src/shared/lib/native.ts). Kakao Developers Redirect URI에 `dohwaji://kakao` 등록 필요.
 */
const config: CapacitorConfig = {
  appId: 'app.dohwaji.couple',
  appName: '우리의 도화지',
  webDir: 'dist',
  ios: {
    // 손그림 종이 톤 — 웹뷰 여백이 흰색으로 번쩍이지 않게
    backgroundColor: '#fdfcf7',
    contentInset: 'always',
  },
  android: {
    backgroundColor: '#fdfcf7',
  },
  plugins: {
    App: {
      // 카카오 로그인 복귀용 커스텀 스킴 (네이티브 프로젝트에도 동일하게 선언됨)
      customUrlScheme: 'dohwaji',
    },
  },
};

export default config;
