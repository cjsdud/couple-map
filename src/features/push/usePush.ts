import { useEffect, useState } from 'react';
import { isStandalone, isIOS } from '../../shared/lib/install';
import { supabase } from '../../shared/lib/supabase';

/**
 * 웹 푸시 구독 (0015_push.sql).
 *
 * 알림은 "짝꿍이 오늘을 남겼을 때" 하나만 보낸다 — 상호 잠금이 풀리는 순간이라
 * 늦게 알면 의미가 줄기 때문. 그 외 마케팅성 알림은 만들지 않는다 (명세 §5 다크패턴 금지).
 *
 * ⚠️ iOS는 **홈 화면에 추가한 PWA에서만** 푸시를 허용한다 (16.4+). 사파리 탭에서는
 * 구독 자체가 불가능하므로, 그 경우 설치 안내(/install)로 유도한다.
 */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState =
  | 'unsupported' // 브라우저가 푸시를 지원하지 않음
  | 'needs-install' // iOS 사파리 탭 — 홈 화면에 추가해야 함
  | 'denied' // 사용자가 차단
  | 'off' // 켤 수 있는 상태
  | 'on'; // 구독 중

/** base64url(VAPID 공개키) → Uint8Array (pushManager가 요구하는 형식) */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function usePush() {
  const [state, setState] = useState<PushState>('off');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await currentState();
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await subscribe();
      setState(ok);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await unsubscribe();
      setState('off');
    } finally {
      setBusy(false);
    }
  };

  return { state, busy, enable, disable };
}

async function currentState(): Promise<PushState> {
  if (!supported()) {
    // 아이폰은 홈 화면 앱일 때만 PushManager가 생긴다 — 안내를 구분해 준다
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

async function subscribe(): Promise<PushState> {
  if (!supabase || !VAPID_PUBLIC_KEY) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId || !json.endpoint || !json.keys?.p256dh || !json.keys.auth) return 'off';

  // 같은 기기로 다시 켜면 endpoint가 같으므로 덮어쓴다
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' },
  );
  if (error) return 'off';
  return 'on';
}

async function unsubscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
