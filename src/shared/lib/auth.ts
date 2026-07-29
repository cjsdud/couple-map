import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { apiUrl } from './apiBase';
import { isNativeApp, NATIVE_KAKAO_REDIRECT, NATIVE_KAKAO_SCHEME } from './native';
import { supabase } from './supabase';

/**
 * 카카오 OAuth 로그인 (웹/네이티브 채널).
 * 앱인토스 채널의 토스 로그인(appLogin→userKey) 매핑은 M0 후속 — tech-design §12-1.
 */
export const KAKAO_CALLBACK_PATH = '/kakao';
const KAKAO_NICKNAME_KEY = 'dohwaji:kakaoNickname';

/**
 * 카카오가 돌아올 주소.
 * 웹은 같은 출처의 /kakao로 되돌아온다. 네이티브 셸은 출처가 앱 내부(localhost)라
 * 카카오가 되돌려 보낼 수 없는데, 카카오는 리다이렉트 URI에 http(s)만 받으므로
 * 커스텀 스킴을 직접 등록할 수도 없다 → https 중계 페이지(/kakao-app)를 거쳐 앱을 깨운다.
 */
export function kakaoRedirectUri(): string {
  return isNativeApp() ? NATIVE_KAKAO_REDIRECT : window.location.origin + KAKAO_CALLBACK_PATH;
}

/**
 * 카카오 로그인 — Supabase 내장 provider 대신 자체 교환 (api/kakao-login.ts).
 * 내장 provider는 account_email scope를 강제하는데 이메일 동의항목이 비즈 앱 전용이라
 * 개인 앱에서 KOE205로 막힌다. 닉네임 scope만 요청해 인가 코드를 받고,
 * Vercel 함수가 토큰 교환·계정 매핑 후 준 일회용 자격으로 세션을 만든다.
 */
export async function signInWithKakao() {
  const key = import.meta.env.VITE_KAKAO_REST_KEY as string | undefined;
  if (!supabase || !key) return;
  const params = new URLSearchParams({
    client_id: key,
    redirect_uri: kakaoRedirectUri(),
    response_type: 'code',
    scope: 'profile_nickname',
  });
  const authorizeUrl = `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;

  if (isNativeApp()) {
    // 앱 화면을 떠나지 않고 시스템 브라우저를 띄운다 — 복귀는 appUrlOpen(listenKakaoRedirect)
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: authorizeUrl });
    return;
  }
  window.location.href = authorizeUrl;
}

/**
 * 네이티브 셸에서 카카오 복귀(dohwaji://kakao?code=...)를 받아 로그인을 마친다.
 * main.tsx에서 앱 시작 시 한 번 등록한다. 웹에서는 아무 일도 하지 않는다.
 */
export async function listenKakaoRedirect(): Promise<void> {
  if (!isNativeApp()) return;
  const [{ App }, { Browser }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/browser'),
  ]);
  await App.addListener('appUrlOpen', ({ url }) => {
    if (!url.startsWith(NATIVE_KAKAO_SCHEME)) return;
    const code = new URL(url).searchParams.get('code');
    void Browser.close().catch(() => {
      // 이미 닫혔으면 무시
    });
    if (code) void completeKakaoLogin(code);
  });
}

/** 카카오 리다이렉트 복귀 처리: 인가 코드 → 자체 계정 세션. 성공 시 true. */
export async function completeKakaoLogin(code: string): Promise<boolean> {
  if (!supabase) return false;
  const res = await fetch(apiUrl('/api/kakao-login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri: kakaoRedirectUri() }),
  });
  if (!res.ok) return false;
  const { email, password, nickname } = (await res.json()) as {
    email: string;
    password: string;
    nickname: string | null;
  };
  if (nickname) {
    try {
      sessionStorage.setItem(KAKAO_NICKNAME_KEY, nickname);
    } catch {
      // sessionStorage 불가 환경이면 프리필만 포기
    }
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

/** 온보딩 닉네임 프리필용 (카카오 프로필 닉네임) */
export function suggestedNickname(): string {
  try {
    return sessionStorage.getItem(KAKAO_NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
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
