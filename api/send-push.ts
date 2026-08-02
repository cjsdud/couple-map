// 짝꿍에게 알림 보내기 (Vercel Fn)
//
// 보낼 수 있는 사건은 아래 화이트리스트뿐이다 — "짝꿍이 지금 알아야 의미 있는" 것만.
// 삭제·설정 변경 같은 일은 푸시하지 않고 보관함(activity_log)에만 남는다
// (지웠다는 푸시는 사실이라도 감정을 건드린다 — backlog §6).
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

/**
 * 알림 문구 — 제목은 **보낸 사람 닉네임**으로 둔다.
 * iOS는 제목 아래에 "from 도화지"(홈 화면 앱 이름)를 스스로 붙이는데 그 줄은 손댈 수 없다.
 * 그래서 우리가 제어 가능한 제목에 이름을 넣어야 "누가 남겼는지"가 한눈에 들어온다.
 *
 * 이 맵이 곧 화이트리스트다 — 여기 없는 kind는 클라이언트가 뭐라 보내든 400.
 * url은 알림을 누르면 열릴 탭 (push-sw.js가 그대로 연다).
 */
const MESSAGES: Record<string, { body: string; url: string }> = {
  today: { body: '오늘을 남겼어요 🎨', url: '/?tab=today' },
  record_create: { body: '지도에 새 핀을 콕 찍었어요 🖍️', url: '/?tab=map' },
  anniversary_create: { body: '새 기념일을 달아 뒀어요 💛', url: '/?tab=us' },
};

/** base64url 문자열이 실제 몇 바이트인지 — 키 값 노출 없이 원인을 짚기 위한 진단용 */
function decodedLength(value: string): number {
  try {
    return Buffer.from(value, 'base64url').length;
  } catch {
    return -1;
  }
}

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
      .select('couple_id, nickname')
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

    // 설정 점검을 구독 조회보다 먼저 — 잘못된 키는 구독 유무와 무관한 문제이고,
    // 이 순서라야 구독을 만들지 않고도 설정이 맞는지 확인할 수 있다.
    // 키 문제와 발송 실패를 구분해서 돌려준다 — 설정 누락은 로그를 봐야만 알 수 있어 답답하다.
    // trim: 환경변수에 붙어 오는 개행·공백이 흔한 실패 원인이라 서버가 흡수한다.
    const publicKey = process.env.VITE_VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    if (!publicKey || !privateKey) {
      res.status(503).json({
        sent: 0,
        reason: 'vapid-missing',
        missing: [!publicKey && 'VITE_VAPID_PUBLIC_KEY', !privateKey && 'VAPID_PRIVATE_KEY'].filter(
          Boolean,
        ),
      });
      return;
    }
    try {
      webpush.setVapidDetails('mailto:a41845276@gmail.com', publicKey, privateKey);
    } catch (e) {
      // 키 값은 절대 응답에 넣지 않는다. 대신 "몇 바이트인지"만 알려 원인을 짚게 한다
      // (공개키 65 · 비밀키 32가 정상. 비밀키 자리에 65가 찍히면 공개키를 잘못 넣은 것)
      res.status(503).json({
        sent: 0,
        reason: 'vapid-invalid',
        detail: String(e).slice(0, 120),
        bytes: { public: decodedLength(publicKey), private: decodedLength(privateKey) },
        expected: { public: 65, private: 32 },
      });
      return;
    }
    const { data: subs, error: subsError } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', partnerId);
    if (subsError) throw subsError;
    if (!subs?.length) {
      // 설정은 정상이라는 뜻 — 짝꿍이 아직 알림을 안 켰을 뿐
      res.status(200).json({ sent: 0, reason: 'no-subscription', vapid: 'ok' });
      return;
    }

    // 닉네임이 비어 있는 계정도 있어 '짝꿍'으로 폴백한다
    const senderName = (me.nickname as string | null)?.trim() || '짝꿍';
    const payload = JSON.stringify({ title: senderName, body: message.body, tag: kind, url: message.url });

    let sent = 0;
    const dead: string[] = [];
    const failures: string[] = [];
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
        failures.push(String(status ?? e).slice(0, 60));
      }
    }
    if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead);
    if (sent > 0) await admin.from('push_log').insert({ user_id: partnerId, kind });

    res.status(200).json({ sent, cleaned: dead.length, failures });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '알림을 보내지 못했어요' });
  }
}
