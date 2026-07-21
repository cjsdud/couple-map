import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * 카카오 OAuth 로그인 (웹/네이티브 채널).
 * 앱인토스 채널의 토스 로그인(appLogin→userKey) 매핑은 M0 후속 — tech-design §12-1.
 */
export function signInWithKakao() {
  if (!supabase) return Promise.resolve();
  return supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: {
      redirectTo: window.location.origin,
      // 이메일(account_email) 동의항목은 비즈 앱 전용 → 요청 자체를 안 한다 (KOE205 방지).
      // 계정 식별은 카카오 고유 id로 충분하고, 커플 연결은 초대 코드 방식이라 이메일 불필요.
      scopes: 'profile_nickname profile_image',
    },
  });
}

export function signOut() {
  return supabase ? supabase.auth.signOut() : Promise.resolve();
}

export interface SessionState {
  /** 초기 세션 복원이 끝나기 전 true */
  loading: boolean;
  session: Session | null;
}

/** Supabase 세션 구독 훅. supabase 미설정이면 즉시 { loading:false, session:null }. */
export function useSession(): SessionState {
  // supabase 미설정이면 복원할 세션이 없으므로 loading 없이 시작
  const [state, setState] = useState<SessionState>({
    loading: supabase !== null,
    session: null,
  });

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setState({ loading: false, session: data.session });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ loading: false, session });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
