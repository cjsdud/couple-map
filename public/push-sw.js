/* 웹 푸시 처리 — 서비스 워커에 importScripts로 합쳐진다 (vite.config.ts workbox.importScripts).
 *
 * 생성되는 서비스 워커(sw.js)는 vite-plugin-pwa가 캐싱만 담당하도록 만들기 때문에,
 * 알림 수신·클릭 동작은 이 파일이 맡는다.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  // 제목은 보낸 사람 닉네임 (서버가 넣어 준다)
  const title = payload.title || '우리의 도화지';
  const options = {
    body: payload.body || '오늘을 남겼어요',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // 같은 태그는 덮어써서 알림이 쌓이지 않게 (하루 상한과 별개로 체감 소음 방지)
    tag: payload.tag || 'dohwaji',
    renotify: false,
    data: { url: payload.url || '/?tab=today' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 이미 열려 있으면 그 창을 살린다 — 새 창이 겹쳐 뜨는 것 방지
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
