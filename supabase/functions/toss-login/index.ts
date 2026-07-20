// 앱인토스 토스 로그인 → Supabase 계정 교환 Edge Function
//
// ⚠️ 미검증 스켈레톤: 앱인토스 콘솔에서 mTLS 인증서를 발급받아야 실행 경로를 검증할 수
// 있다 (docs/spike-result.md §4). 구조와 엔드포인트는 공식 문서 기준.
//
// 흐름 (tech-design §12-1 매핑 레이어):
//   클라이언트 appLogin() → authorizationCode (10분, 일회성)
//   → 이 함수: generate-token (mTLS) → login-me → userKey
//   → toss_users 매핑 upsert (없으면 auth 사용자 신규 생성)
//   → 일회용 비밀번호를 재발급해 {email, password} 반환
//   → 클라이언트가 signInWithPassword로 즉시 세션 수립 (비밀번호는 로그인마다 회전)
//
// 필요한 환경변수 (supabase secrets set):
//   TOSS_MTLS_CERT / TOSS_MTLS_KEY  — 앱인토스 콘솔 발급 mTLS 인증서 PEM
//   SB_URL / SB_SERVICE_ROLE_KEY    — service role (auth.admin·toss_users 접근)
import { createClient } from 'npm:@supabase/supabase-js@2';

const TOSS_API = 'https://apps-in-toss-api.toss.im';

interface TokenResponse {
  accessToken: string;
}
interface LoginMeResponse {
  userKey: string;
}

function requiredEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`환경변수 ${name} 미설정`);
  return v;
}

Deno.serve(async (req) => {
  try {
    const { authorizationCode, referrer } = (await req.json()) as {
      authorizationCode: string;
      referrer: 'DEFAULT' | 'SANDBOX';
    };
    if (!authorizationCode) {
      return Response.json({ error: 'authorizationCode가 필요해요' }, { status: 400 });
    }

    // mTLS 클라이언트 — Supabase Edge Runtime의 Deno.createHttpClient 지원 범위는
    // 인증서 발급 후 실검증 필요 (미지원 시 Vercel Functions로 이 함수만 이전)
    const mtls = Deno.createHttpClient({
      cert: requiredEnv('TOSS_MTLS_CERT'),
      key: requiredEnv('TOSS_MTLS_KEY'),
    });

    const tokenRes = await fetch(`${TOSS_API}/api-partner/v1/apps-in-toss/user/oauth2/generate-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizationCode, referrer }),
      client: mtls,
    } as RequestInit & { client: Deno.HttpClient });
    if (!tokenRes.ok) {
      return Response.json({ error: `토큰 교환 실패 HTTP ${tokenRes.status}` }, { status: 502 });
    }
    const { accessToken } = (await tokenRes.json()) as TokenResponse;

    const meRes = await fetch(`${TOSS_API}/api-partner/v1/apps-in-toss/user/oauth2/login-me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      client: mtls,
    } as RequestInit & { client: Deno.HttpClient });
    if (!meRes.ok) {
      return Response.json({ error: `login-me 실패 HTTP ${meRes.status}` }, { status: 502 });
    }
    const { userKey } = (await meRes.json()) as LoginMeResponse;

    // userKey ↔ 자체 계정 매핑 (채널 이전 시 카카오 계정과 병합은 M0 후속 설계)
    const admin = createClient(requiredEnv('SB_URL'), requiredEnv('SB_SERVICE_ROLE_KEY'));
    const email = `toss-${userKey}@login.dohwaji.app`; // 가상 이메일 (실제 수신 불가 도메인)
    const password = crypto.randomUUID(); // 로그인마다 회전하는 일회용 비밀번호

    const { data: existing } = await admin.from('toss_users').select('user_id').eq('user_key', userKey).maybeSingle();
    let userId = existing?.user_id as string | undefined;
    if (userId) {
      await admin.auth.admin.updateUserById(userId, { password });
      await admin.from('toss_users').update({ last_login_at: new Date().toISOString() }).eq('user_key', userKey);
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { channel: 'apps-in-toss' },
      });
      if (createError) throw createError;
      userId = created.user.id;
      const { error: mapError } = await admin.from('toss_users').insert({ user_key: userKey, user_id: userId });
      if (mapError) throw mapError;
    }

    return Response.json({ email, password });
  } catch (e) {
    console.error(e);
    return Response.json({ error: '토스 로그인 처리 중 문제가 생겼어요' }, { status: 500 });
  }
});
