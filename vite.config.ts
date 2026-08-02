import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    /**
     * 서비스 워커 — PWA가 주 채널이 되면서 추가 (사용자 결정 2026-07-28).
     * 스토어 없이 홈 화면에 설치돼 쓰이므로 앱처럼 즉시 뜨고 조용히 갱신돼야 한다.
     * manifest는 public/manifest.webmanifest를 그대로 쓴다 (iOS가 이미 참조 중 — 중복 생성 방지).
     */
    VitePWA({
      registerType: 'prompt',
      // 등록은 앱 코드(UpdatePrompt)가 직접 한다 — 새 버전 알림을 띄우기 위해
      injectRegister: null,
      manifest: false,
      workbox: {
        // 알림 수신·클릭 동작은 별도 파일이 맡는다 (생성되는 sw.js는 캐싱 전담)
        importScripts: ['/push-sw.js'],
        // 지도 GeoJSON·공유 카드 웹폰트까지 담아 첫 로드 뒤엔 오프라인에서도 열린다
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // 소개 페이지 이미지는 오프라인에 담지 않는다 — 링크로 한 번 보는 화면이라
        // 캐시에 넣으면 설치 용량만 늘어난다
        globIgnores: ['**/intro/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        // 서버 함수·인증 콜백은 항상 네트워크로 (캐시된 응답이 섞이면 로그인이 깨진다)
        navigateFallbackDenylist: [/^\/api\//, /^\/kakao/, /^\/privacy\.html$/],
        runtimeCaching: [
          {
            // 사진 등 원격 이미지는 짧게만 재사용 (서명 URL 만료를 고려)
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'dohwaji-images',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
