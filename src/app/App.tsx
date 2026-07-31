import { useCallback, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InstallGuide from '../features/install/InstallGuide';
import LoginScreen from '../features/couple/LoginScreen';
import OnboardingFlow from '../features/couple/OnboardingFlow';
import {
  hasSkippedStartedAt,
  markStartedAtSkipped,
  useCoupleState,
} from '../features/couple/useCoupleState';
import { completeKakaoLogin, KAKAO_CALLBACK_PATH, useSession } from '../shared/lib/auth';
import { KAKAO_APP_BRIDGE_PATH, NATIVE_KAKAO_SCHEME } from '../shared/lib/native';
import { supabase } from '../shared/lib/supabase';
import UpdatePrompt from '../shared/ui/UpdatePrompt';
import AppShell from './AppShell';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function Splash({ label = '도화지를 펼치는 중…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm opacity-50">
      {label}
    </div>
  );
}

/**
 * 네이티브 앱용 중계 페이지(/kakao-app?code=…).
 * 카카오가 커스텀 스킴을 리다이렉트 URI로 받아주지 않아, https로 한 번 받은 뒤
 * `dohwaji://kakao?code=…`로 앱을 깨운다. 앱이 없으면 안내만 남는다.
 */
function KakaoAppBridge() {
  const [code] = useState(() => new URLSearchParams(window.location.search).get('code'));
  useEffect(() => {
    if (!code) return;
    window.location.replace(`${NATIVE_KAKAO_SCHEME}?code=${encodeURIComponent(code)}`);
  }, [code]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-3xl" aria-hidden>🎨</p>
      <p className="text-sm opacity-70">
        {code ? '앱으로 돌아가는 중…' : '로그인이 중간에 끊겼어요. 앱에서 다시 시도해 주세요.'}
      </p>
      {code && (
        <a
          href={`${NATIVE_KAKAO_SCHEME}?code=${encodeURIComponent(code)}`}
          className="rounded-2xl rounded-tl-md bg-pink px-5 py-2.5 text-sm font-bold text-white"
        >
          앱으로 돌아가기
        </a>
      )}
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
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-sky/60 px-4 py-1.5 text-center text-xs font-semibold">
          <span>미리보기 모드 — 예시 화면이라 저장되지 않아요</span>
          <a href="/" className="shrink-0 underline underline-offset-2">
            나가기
          </a>
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
          데모 모드 — 서버와 연결되기 전이라 저장되지 않아요
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
  // 홈 화면 설치 안내 — 스토어 없는 배포의 관문이라 공유 가능한 주소로 둔다
  if (window.location.pathname === '/install') {
    return <InstallGuide />;
  }
  if (window.location.pathname === KAKAO_APP_BRIDGE_PATH) {
    return <KakaoAppBridge />;
  }
  if (window.location.pathname === KAKAO_CALLBACK_PATH) {
    return <KakaoCallback />;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <Gate />
      {/* 서비스 워커가 예전 화면을 계속 보여주지 않도록 새 버전 안내 */}
      <UpdatePrompt />
    </QueryClientProvider>
  );
}
