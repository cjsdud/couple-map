import { supabase } from '../../shared/lib/supabase';

/**
 * 앱인토스 채널 토스 로그인 (미검증 스켈레톤 — 패키징 단계에서 SDK 설치 후 활성화).
 *
 * appLogin()은 `@apps-in-toss/web-framework`가 제공하며, granite(ait init) 패키징
 * 프로젝트에서만 의미가 있어 아직 의존성으로 추가하지 않았다. 앱인토스 번들 작업(M3)
 * 때 SDK를 설치하고 아래 동적 import의 주석을 해제한다.
 *
 * 흐름: appLogin() → Edge Function(toss-login, mTLS 교환) → {email, password}
 *       → signInWithPassword (비밀번호는 서버가 로그인마다 회전)
 */
export function isAppsInToss(): boolean {
  // 샌드박스/운영 미니앱은 tossmini.com 도메인에서 서빙된다 (spike-result §4)
  return /\.(apps|private-apps)\.tossmini\.com$/.test(window.location.hostname);
}

export async function signInWithToss(): Promise<void> {
  if (!supabase) throw new Error('Supabase 미연결');

  // TODO(M3 패키징): npm i @apps-in-toss/web-framework 후 주석 해제
  // const { appLogin } = await import('@apps-in-toss/web-framework');
  // const { authorizationCode, referrer } = await appLogin();
  const appLoginResult: { authorizationCode: string; referrer: 'DEFAULT' | 'SANDBOX' } | null = null;
  if (!appLoginResult) {
    throw new Error('토스 로그인은 앱인토스 패키징(M3) 후 사용할 수 있어요');
  }

  const { data, error } = await supabase.functions.invoke('toss-login', {
    body: appLoginResult,
  });
  if (error) throw error;
  const { email, password } = data as { email: string; password: string };
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
}
