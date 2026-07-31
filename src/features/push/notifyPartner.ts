import { apiUrl } from '../../shared/lib/apiBase';
import { supabase } from '../../shared/lib/supabase';

/**
 * 짝꿍에게 "오늘을 남겼어요" 알림 — 상호 잠금이 풀린 걸 알린다.
 *
 * 대상·상한 판단은 전부 서버(api/send-push)가 한다. 클라이언트는 "내가 남겼다"는
 * 사실만 알리므로, 남에게 임의로 알림을 보낼 수 없다.
 * 실패해도 저장은 이미 끝난 뒤라 조용히 넘어간다.
 */
export async function notifyPartnerToday(): Promise<void> {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return;
    await fetch(apiUrl('/api/send-push'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, kind: 'today' }),
    });
  } catch {
    // 알림은 부가 기능 — 실패가 저장 흐름을 방해하지 않는다
  }
}
