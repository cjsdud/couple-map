import { apiUrl } from '../../shared/lib/apiBase';
import { supabase } from '../../shared/lib/supabase';

/**
 * 짝꿍에게 푸시 — 보낼 수 있는 종류는 서버 화이트리스트(api/send-push의 MESSAGES)와 같다.
 * 삭제·설정 변경은 여기 없다 — 보관함(activity_log)에만 남는다 (backlog §6).
 *
 * 대상·상한(하루 3건) 판단은 전부 서버가 한다. 클라이언트는 "내가 했다"는
 * 사실만 알리므로, 남에게 임의로 알림을 보낼 수 없다.
 * 실패해도 저장은 이미 끝난 뒤라 조용히 넘어간다.
 */
export type PushKind = 'today' | 'record_create' | 'anniversary_create';

export async function notifyPartner(kind: PushKind): Promise<void> {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return;
    await fetch(apiUrl('/api/send-push'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, kind }),
    });
  } catch {
    // 알림은 부가 기능 — 실패가 저장 흐름을 방해하지 않는다
  }
}

/** "오늘을 남겼어요" — 상호 잠금이 풀린 걸 알린다 */
export const notifyPartnerToday = () => notifyPartner('today');
