// 카카오 로그인 → Supabase 계정 교환 (Vercel Serverless Function)
//
// Supabase 내장 Kakao provider는 account_email scope를 강제하는데, 이메일 동의항목은
// 비즈 앱 전용이라 개인 앱에서 KOE205로 막힌다. 그래서 토스 로그인(tech-design §12-1)과
// 동일한 매핑 패턴으로 자체 교환한다:
//   클라이언트 인가 코드 → (여기) 토큰 교환 → 카카오 고유 id → kakao_users 매핑
//   → 합성 이메일 계정 + 로그인마다 회전하는 일회용 비밀번호 반환 → signInWithPassword
//
// 필요한 Vercel 환경변수: VITE_KAKAO_REST_KEY(기존), KAKAO_CLIENT_SECRET,
//   VITE_SUPABASE_URL(기존), SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js';

interface VercelRequest {
  method?: string;
  body?: { code?: string; redirectUri?: string };
}
interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): void;
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
    const { code, redirectUri } = req.body ?? {};
    if (!code || !redirectUri) {
      res.status(400).json({ error: 'code와 redirectUri가 필요해요' });
      return;
    }

    // ① 인가 코드 → 액세스 토큰
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: requiredEnv('VITE_KAKAO_REST_KEY'),
        client_secret: requiredEnv('KAKAO_CLIENT_SECRET'),
        redirect_uri: redirectUri,
        code,
      }),
    });
    if (!tokenRes.ok) {
      console.error('kakao token', tokenRes.status, await tokenRes.text());
      res.status(502).json({ error: '카카오 토큰 교환에 실패했어요' });
      return;
    }
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string };

    // ② 카카오 고유 id·닉네임
    const meRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      console.error('kakao me', meRes.status, await meRes.text());
      res.status(502).json({ error: '카카오 사용자 조회에 실패했어요' });
      return;
    }
    const me = (await meRes.json()) as {
      id: number;
      kakao_account?: { profile?: { nickname?: string } };
      properties?: { nickname?: string };
    };
    const kakaoId = String(me.id);
    const nickname = me.kakao_account?.profile?.nickname ?? me.properties?.nickname ?? null;

    // ③ kakao_users 매핑 ↔ 자체 계정 (없으면 생성, 비밀번호는 로그인마다 회전)
    const admin = createClient(requiredEnv('VITE_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
    const email = `kakao-${kakaoId}@login.dohwaji.app`; // 실수신 불가 도메인의 합성 이메일
    const password = crypto.randomUUID();

    const { data: existing } = await admin.from('kakao_users').select('user_id').eq('kakao_id', kakaoId).maybeSingle();
    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.user_id as string, { password });
      if (error) throw error;
      await admin.from('kakao_users').update({ last_login_at: new Date().toISOString() }).eq('kakao_id', kakaoId);
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { channel: 'kakao', kakao_id: kakaoId },
      });
      if (error) throw error;
      const { error: mapError } = await admin.from('kakao_users').insert({ kakao_id: kakaoId, user_id: created.user.id });
      if (mapError) throw mapError;
    }

    res.status(200).json({ email, password, nickname });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '로그인 처리 중 문제가 생겼어요' });
  }
}
