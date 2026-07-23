// 아이디 로그인 — 아이디·비밀번호로 기존 카카오 앱 계정에 들어가는 브리지 (Vercel Fn)
//
// 요청(2026-07-23): 카카오 인증이 자주 안 되니 아이디+비밀번호로도 "같은 계정"에
// 로그인되게 해달라. 구조:
//   ① 아이디 → 브리지 계정 이메일 매핑(서버에만 둬 이메일 노출 방지)
//   ② 브리지 계정으로 signInWithPassword — 비밀번호 검증은 Supabase가 수행
//   ③ 검증되면 본계정(가장 먼저 카카오로 가입한 계정)의 세션을
//      generateLink(magiclink)+verifyOtp로 발급 — 카카오 로그인의 비밀번호 회전과 무충돌
//   ④ 카카오 계정이 아직 없으면 브리지 세션을 그대로 반환
//
// 필요한 Vercel 환경변수: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY (모두 기존)
import { createClient } from '@supabase/supabase-js';

interface VercelRequest {
  method?: string;
  body?: { loginId?: string; password?: string };
}
interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): void;
}

// 사용자 요청으로 등록한 개인 별칭 — 본인 것만 (추가 요청 시 여기에 한 줄씩)
const ALIASES: Record<string, string> = {
  qkr1394: 'a41845276@gmail.com',
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 미설정`);
  return v;
}

function sendSession(res: VercelResponse, session: { access_token: string; refresh_token: string }) {
  res.status(200).json({ access_token: session.access_token, refresh_token: session.refresh_token });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 받아요' });
    return;
  }
  try {
    const { loginId, password } = req.body ?? {};
    if (!loginId || !password) {
      res.status(400).json({ error: 'loginId와 password가 필요해요' });
      return;
    }
    const bridgeEmail = ALIASES[loginId.trim().toLowerCase()];
    // 없는 아이디도 같은 응답 — 아이디 존재 여부를 밖에서 알 수 없게 한다
    if (!bridgeEmail) {
      res.status(401).json({ error: '아이디 또는 비밀번호를 확인해 주세요' });
      return;
    }

    const url = requiredEnv('VITE_SUPABASE_URL');
    const anon = createClient(url, requiredEnv('VITE_SUPABASE_ANON_KEY'), {
      auth: { persistSession: false },
    });

    // ② 아이디·비밀번호 검증 (브리지 계정)
    const cred = await anon.auth.signInWithPassword({ email: bridgeEmail, password });
    if (cred.error || !cred.data.session) {
      res.status(401).json({ error: '아이디 또는 비밀번호를 확인해 주세요' });
      return;
    }

    // ③ 본계정 세션 발급 — 가장 먼저 카카오로 가입한 계정(=요청자 본인)
    const admin = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
    const { data: rows, error: mapError } = await admin
      .from('kakao_users')
      .select('user_id')
      .order('created_at', { ascending: true })
      .limit(1);
    if (mapError) throw mapError;
    const mainUserId = rows?.[0]?.user_id as string | undefined;
    if (!mainUserId) {
      sendSession(res, cred.data.session); // ④ 카카오 계정이 아직 없으면 브리지로
      return;
    }
    const { data: mainUser, error: userError } = await admin.auth.admin.getUserById(mainUserId);
    if (userError || !mainUser.user.email) throw userError ?? new Error('본계정 이메일 없음');
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: mainUser.user.email,
    });
    if (linkError) throw linkError;
    const verified = await anon.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.properties.hashed_token,
    });
    if (verified.error || !verified.data.session) throw verified.error ?? new Error('세션 발급 실패');
    sendSession(res, verified.data.session);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '로그인 처리 중 문제가 생겼어요' });
  }
}
