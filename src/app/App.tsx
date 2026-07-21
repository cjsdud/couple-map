import { useCallback, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SpikePage from '../features/spike/SpikePage';
import LoginScreen from '../features/couple/LoginScreen';
import OnboardingFlow from '../features/couple/OnboardingFlow';
import {
  hasSkippedStartedAt,
  markStartedAtSkipped,
  useCoupleState,
} from '../features/couple/useCoupleState';
import { completeKakaoLogin, KAKAO_CALLBACK_PATH, useSession } from '../shared/lib/auth';
import { supabase } from '../shared/lib/supabase';
import AppShell from './AppShell';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

function Splash({ label = '도화지를 펼치는 중…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm opacity-50">
      {label}
    </div>
  );
}

/** 카카오 리다이렉트 복귀(/kakao?code=…) → 자체 계정 세션 수립 후 홈으로 */
function KakaoCallback() {
  // code 부재는 렌더 전에 판정 (effect 내 동기 setState 회피)
  const [code] = useState(() => new URLSearchParams(window.location.search).get('code'));
  const [failed, setFailed] = useState(code === null);
  useEffect(() => {
    if (!code) return;
    void completeKakaoLogin(code).then((ok) => {
      if (ok) window.location.replace('/');
      else setFailed(true);
    });
  }, [code]);
  if (failed) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-3xl" aria-hidden>🥲</p>
        <p className="text-sm opacity-70">카카오 로그인이 중간에 끊겼어요. 다시 한 번 시도해 주세요.</p>
        <a href="/" className="rounded-2xl rounded-tl-md bg-pink px-5 py-2.5 text-sm font-bold text-white">
          처음으로 돌아가기
        </a>
      </div>
    );
  }
  return <Splash label="카카오로 들어가는 중…" />;
}

/** 인증·커플 연결 게이트: 로그인 → 온보딩(닉네임·초대 코드·사귄 날) → 3탭 셸 */
function Gate() {
  const { loading, session } = useSession();
  const userId = session?.user.id;
  const coupleQuery = useCoupleState(userId);
  // "사귄 날 나중에" 스킵은 localStorage 플래그 — 변경 시 리렌더 트리거
  const [, bump] = useState(0);
  const skipStartedAt = useCallback((coupleId: string) => {
    markStartedAtSkipped(coupleId);
    bump((n) => n + 1);
  }, []);

  // ?mock=1: 로그인 없이 예시 데이터로 화면을 둘러보는 미리보기 모드
  if (new URLSearchParams(window.location.search).has('mock')) {
    return (
      <>
        <div className="sticky top-0 z-50 bg-sky/60 px-4 py-1.5 text-center text-xs font-semibold">
          미리보기 모드 — 예시 데이터라 저장되지 않아요
        </div>
        <AppShell />
      </>
    );
  }
  if (!supabase) {
    // 키 미설정 데모 모드 — 셸은 뜨되 저장은 안 됨을 상시 안내
    return (
      <>
        <div className="sticky top-0 z-50 bg-yellow/80 px-4 py-1.5 text-center text-xs font-semibold">
          데모 모드 — Supabase 미연결이라 저장되지 않아요
        </div>
        <AppShell />
      </>
    );
  }
  if (loading) return <Splash />;
  if (!session || !userId) return <LoginScreen />;
  if (coupleQuery.isPending) return <Splash />;

  const state = coupleQuery.data ?? { profile: null, couple: null };
  const { couple } = state;
  const connected = couple?.status === 'active';
  const needsStartedAt = connected && !couple.started_at && !hasSkippedStartedAt(couple.id);

  if (!state.profile || !connected || needsStartedAt) {
    return (
      <OnboardingFlow
        userId={userId}
        state={state}
        refetching={coupleQuery.isRefetching}
        onRefetch={() => void coupleQuery.refetch()}
        onSkipStartedAt={skipStartedAt}
      />
    );
  }
  return <AppShell />;
}

export default function App() {
  const hash = useHashRoute();
  if (window.location.pathname === KAKAO_CALLBACK_PATH) {
    return <KakaoCallback />;
  }
  return (
    <QueryClientProvider client={queryClient}>
      {/* Phase 0 진단 페이지는 실기기 검증 때까지 #/spike 경로로 유지 */}
      {hash.startsWith('#/spike') ? <SpikePage /> : <Gate />}
    </QueryClientProvider>
  );
}
