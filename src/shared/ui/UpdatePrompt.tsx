import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * 새 버전 안내.
 *
 * 서비스 워커가 앱을 캐시하므로, 배포해도 이미 설치한 사람에게는 예전 화면이 계속 보인다
 * (2026-07-28 실제로 알림 기능이 안 보이는 문제 발생). 새 버전이 준비되면 띠를 띄워
 * 사용자가 원할 때 넘어가게 한다 — 글을 쓰는 중에 자동 새로고침으로 날려버리지 않도록.
 *
 * 열려 있는 동안에도 주기적으로 확인해서, 앱을 오래 켜 두는 사람도 갱신을 놓치지 않는다.
 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export default function UpdatePrompt() {
  const [ready, setReady] = useState(false);
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    updateRef.current = registerSW({
      onNeedRefresh: () => setReady(true),
      onRegisteredSW: (_url, registration) => {
        if (!registration) return;
        setInterval(() => void registration.update(), CHECK_INTERVAL_MS);
      },
    });
  }, []);

  if (!ready) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-paper px-4 py-2.5 shadow-lg">
        <span className="text-sm font-semibold">새 버전이 준비됐어요</span>
        <button
          type="button"
          onClick={() => void updateRef.current?.(true)}
          className="shrink-0 rounded-full bg-pink px-4 py-1.5 text-xs font-bold text-white active:translate-y-px"
        >
          새로고침
        </button>
      </div>
    </div>
  );
}
