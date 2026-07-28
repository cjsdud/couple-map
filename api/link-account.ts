// 계정 연동 — 다른 로그인 수단으로 들어온 세션을 "이미 쓰던 계정"에 합친다 (Vercel Fn)
//
// 결정(2026-07-25): 토스 버전과 스토어 버전을 따로 배포하되 계정은 하나로 이어져야 한다.
// 앱인토스는 토스 로그인만, 웹·스토어는 카카오 로그인만 쓸 수 있어서 두 채널이 각각
// 다른 auth.users를 만든다. 이 함수가 그 둘을 하나로 묶는다.
//
// 흐름:
//   ① 쓰던 계정(A)에서 issue_link_code() RPC로 6자리 코드 발급
//   ② 다른 수단으로 로그인한 세션(B)이 이 함수에 코드를 보냄
//   ③ B의 채널 식별자(kakao_users/toss_users 행)를 A로 옮기고 B 계정을 지운다
//   ④ A의 세션을 발급해 돌려준다 (id-login과 같은 magiclink 방식)
//
// 안전 규칙: B에 데이터(커플)가 있으면 거절한다 — 두 계정의 기록을 합치는 건
// 되돌릴 수 없어서, "빈 계정을 기존 계정에 흡수"하는 경우만 허용한다.
//
// 필요한 Vercel 환경변수: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js';

interface VercelRequest {
  method?: string;
  body?: { code?: string; accessToken?: string };
  headers?: Record<string, string | string[] | undefined>;
}
interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

/** 미니앱(tossmini)에서도 부를 수 있게 — 우리 채널 도메인만 허용 */
const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?(vercel\.app|tossmini\.com)$/;

function applyCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers?.origin;
  const value = Array.isArray(origin) ? origin[0] : origin;
  if (value && ALLOWED_ORIGIN.test(value)) {
    res.setHeader('Access-Control-Allow-Origin', value);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 미설정`);
  return v;
}

/** 채널 식별 테이블 — 새 채널이 생기면 여기에 한 줄 추가 */
const IDENTITY_TABLES = ['kakao_users', 'toss_users'] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 받아요' });
    return;
  }
  try {
    const code = req.body?.code?.trim().toUpperCase();
    const accessToken = req.body?.accessToken;
    if (!code || !accessToken) {
      res.status(400).json({ error: 'code와 accessToken이 필요해요' });
      return;
    }

    const url = requiredEnv('VITE_SUPABASE_URL');
    const anon = createClient(url, requiredEnv('VITE_SUPABASE_ANON_KEY'), {
      auth: { persistSession: false },
    });
    const admin = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });

    // ② 지금 로그인한 계정(B) 확인
    const { data: caller, error: callerError } = await admin.auth.getUser(accessToken);
    if (callerError || !caller.user) {
      res.status(401).json({ error: '로그인이 만료됐어요. 다시 로그인해 주세요' });
      return;
    }
    const fromId = caller.user.id;

    // 코드 → 이어붙일 기존 계정(A)
    const { data: link, error: linkError } = await admin
      .from('account_link_codes')
      .select('user_id, expires_at, used_at')
      .eq('code', code)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link || link.used_at || new Date(link.expires_at as string) < new Date()) {
      res.status(400).json({ error: '코드가 없거나 만료됐어요. 새로 발급해 주세요' });
      return;
    }
    const keepId = link.user_id as string;

    if (keepId === fromId) {
      res.status(400).json({ error: '이미 같은 계정이에요' });
      return;
    }

    // ③ 안전 규칙 — 흡수될 계정(B)에 커플·기록이 있으면 손대지 않는다
    const { data: fromProfile, error: profileError } = await admin
      .from('profiles')
      .select('couple_id')
      .eq('user_id', fromId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (fromProfile?.couple_id) {
      res.status(409).json({
        error: '지금 로그인한 계정에 이미 기록이 있어요. 빈 계정에서만 이어붙일 수 있어요',
      });
      return;
    }

    // 채널 식별자 이동 — 같은 채널이 양쪽에 있으면 충돌이라 거절
    for (const table of IDENTITY_TABLES) {
      const { data: fromRows, error: fromError } = await admin
        .from(table)
        .select('user_id')
        .eq('user_id', fromId);
      if (fromError) throw fromError;
      if (!fromRows?.length) continue;

      const { data: keepRows, error: keepError } = await admin
        .from(table)
        .select('user_id')
        .eq('user_id', keepId);
      if (keepError) throw keepError;
      if (keepRows?.length) {
        res.status(409).json({ error: '그 계정에는 이미 같은 방식의 로그인이 연결돼 있어요' });
        return;
      }

      const { error: moveError } = await admin
        .from(table)
        .update({ user_id: keepId })
        .eq('user_id', fromId);
      if (moveError) throw moveError;
    }

    // 코드 소모 후 빈 계정 정리 (profiles는 cascade로 함께 삭제)
    const { error: usedError } = await admin
      .from('account_link_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('code', code);
    if (usedError) throw usedError;
    const { error: deleteError } = await admin.auth.admin.deleteUser(fromId);
    if (deleteError) throw deleteError;

    // ④ 이어붙인 계정(A)의 세션 발급 — id-login과 동일 경로
    const { data: keepUser, error: keepUserError } = await admin.auth.admin.getUserById(keepId);
    if (keepUserError || !keepUser.user.email) {
      throw keepUserError ?? new Error('이어붙일 계정의 이메일 없음');
    }
    let session: { access_token: string; refresh_token: string } | null = null;
    for (let attempt = 0; attempt < 2 && !session; attempt++) {
      const { data: generated, error: genError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: keepUser.user.email,
      });
      if (genError) {
        if (attempt > 0) throw genError;
        continue;
      }
      const verified = await anon.auth.verifyOtp({
        type: 'magiclink',
        token_hash: generated.properties.hashed_token,
      });
      if (verified.data.session) session = verified.data.session;
      else if (attempt > 0) throw verified.error ?? new Error('세션 발급 실패');
    }
    if (!session) throw new Error('세션 발급 실패');
    res.status(200).json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '연결 처리 중 문제가 생겼어요' });
  }
}
