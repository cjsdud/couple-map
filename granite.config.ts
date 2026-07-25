import { defineConfig } from '@apps-in-toss/web-framework/config';

/**
 * 앱인토스 미니앱 패키징 설정 (콘솔 등록 appName: dohwaji).
 *
 * 구조: 우리 Vite 빌드 산출물(dist)을 그대로 .ait 번들로 감싸 tossmini.com 도메인에서 서빙한다.
 * → 앱인토스 채널에서는 상대 경로 서버 함수(/api/*)가 동작하지 않는다 (docs/spike-result.md 참조).
 *
 * 권한은 실제 사용 기능만 선언한다 (미선언 시 브릿지 API가 거부됨):
 * - geolocation: 데이트 핀의 "지금 여기"
 * - photos/camera: 오늘 사진·기록 사진 첨부
 * - clipboard: 짝꿍 초대 코드 복사
 */
export default defineConfig({
  appName: 'dohwaji',
  brand: {
    displayName: '우리의 도화지',
    primaryColor: '#E8637C',
    icon: 'https://couple-map-azure.vercel.app/icons/icon-512.png',
  },
  permissions: [
    { name: 'geolocation', access: 'access' },
    { name: 'photos', access: 'read' },
    { name: 'camera', access: 'access' },
    { name: 'clipboard', access: 'write' },
  ],
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'npm run dev',
      build: 'npm run build',
    },
  },
  outdir: 'dist',
  webViewProps: {
    // SPA라 당겨서 새로고침이 작성 중이던 상태를 날린다 — 비활성화
    pullToRefreshEnabled: false,
    bounces: false,
  },
});
