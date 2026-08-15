// Supabase 무료 플랜은 7일간 API 요청이 없으면 프로젝트를 자동 일시정지한다 —
// 2026-08-15 실제로 멈춰서 앱 전체(로그인·저장)가 함께 죽었다.
// 하루 한 번 가벼운 읽기 쿼리로 활동을 만들어 정지를 막는다.
// 호출: Vercel Cron (vercel.json crons). 외부에서 불려도 읽기 한 줄뿐이라 해가 없다.
import { createClient } from '@supabase/supabase-js';

interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): void;
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 미설정`);
  return v;
}

export default async function handler(_req: unknown, res: VercelResponse) {
  try {
    const admin = createClient(
      requiredEnv('VITE_SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } },
    );
    const { error } = await admin.from('questions').select('id').limit(1);
    if (error) throw error;
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
}
