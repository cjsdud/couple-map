// 짝꿍에게 알림 보내기 (Vercel Fn)
//
// 트리거는 하나뿐이다 — "내가 오늘을 남겼다" → 짝꿍에게 알림.
// 상호 잠금이 풀리는 순간이라 이 앱에서 유일하게 시간이 중요한 사건이다.
// 마케팅성 발송은 만들지 않는다 (명세 §5 다크패턴 금지).
//
// 안전장치:
// - 호출자는 access token으로 검증한다 (아무나 남에게 알림을 못 보낸다)
// - 받는 사람은 서버가 커플 관계에서 직접 찾는다 (클라이언트가 대상을 못 고른다)
// - 하루 3건 상한 (push_log 기준)
//
// 필요한 Vercel 환경변수: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

interface VercelRequest {
  method?: string;
  body?: { accessToken?: string; kind?: string };
}
interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): void;
}

/** 하루 상한 — 짝꿍이 하루에 여러 번 남겨도 알림은 최대 3번 (명세 §5) */
const DAILY_LIMIT = 3;

const MESSAGES: Record<string, { title: string; body: string }> = {
  today: { title: '우리의 도화지', body: '짝꿍이 오늘을 남겼어요 🎨' },
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 미설정`);
  return v;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 받아요' });
    return;
  }
  try {
    const { accessToken, kind = 'today' } = req.body ?? {};
    const message = MESSAGES[kind];
    if (!accessToken || !message) {
      res.status(400).json({ error: 'accessToken과 올바른 kind가 필요해요' });
      return;
    }

    const admin = createClient(requiredEnv('VITE_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });

    // 보내는 사람 확인
    const { data: caller, error: callerError } = await admin.auth.getUser(accessToken);
    if (callerError || !caller.user) {
      res.status(401).json({ error: '로그인이 만료됐어요' });
      return;
    }
    const senderId = caller.user.id;

    // 받는 사람은 서버가 찾는다 — 같은 커플의 상대방
    const { data: me, error: meError } = await admin
      .from('profiles')
      .select('couple_id')
      .eq('user_id', senderId)
      .maybeSingle();
    if (meError) throw meError;
    if (!me?.couple_id) {
      res.status(200).json({ sent: 0, reason: 'no-couple' });
      return;
    }
    const { data: partners, error: partnerError } = await admin
      .from('profiles')
      .select('user_id')
      .eq('couple_id', me.couple_id)
      .neq('user_id', senderId);
    if (partnerError) throw partnerError;
    const partnerId = partners?.[0]?.user_id as string | undefined;
    if (!partnerId) {
      res.status(200).json({ sent: 0, reason: 'no-partner' });
      return;
    }

    // 하루 상한
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from('push_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', partnerId)
      .gte('sent_at', since);
    if (countError) throw countError;
    if ((count ?? 0) >= DAILY_LIMIT) {
      res.status(200).json({ sent: 0, reason: 'daily-limit' });
      return;
    }

    const { data: subs, error: subsError } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', partnerId);
    if (subsError) throw subsError;
    if (!subs?.length) {
      res.status(200).json({ sent: 0, reason: 'no-subscription' });
      return;
    }

    webpush.setVapidDetails(
      'mailto:a41845276@gmail.com',
      requiredEnv('VITE_VAPID_PUBLIC_KEY'),
      requiredEnv('VAPID_PRIVATE_KEY'),
    );
    const payload = JSON.stringify({ ...message, tag: kind, url: '/?tab=today' });

    let sent = 0;
    const dead: string[] = [];
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          payload,
        );
        sent += 1;
      } catch (e) {
        // 410/404 = 사용자가 앱을 지웠거나 구독 만료 → 정리 대상
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.endpoint as string);
      }
    }
    if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead);
    if (sent > 0) await admin.from('push_log').insert({ user_id: partnerId, kind });

    res.status(200).json({ sent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '알림을 보내지 못했어요' });
  }
}
