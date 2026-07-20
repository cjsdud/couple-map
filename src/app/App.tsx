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
import { useSession } from '../shared/lib/auth';
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

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm opacity-50">
      도화지를 펼치는 중…
    </div>
  );
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
  return (
    <QueryClientProvider client={queryClient}>
      {/* Phase 0 진단 페이지는 실기기 검증 때까지 #/spike 경로로 유지 */}
      {hash.startsWith('#/spike') ? <SpikePage /> : <Gate />}
    </QueryClientProvider>
  );
}
