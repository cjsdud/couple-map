import { useState } from 'react';
import { signInWithKakao } from '../../shared/lib/auth';
import { pendingInviteCode } from '../../shared/lib/invite';
import { supabase } from '../../shared/lib/supabase';

export default function LoginScreen() {
  const [busy, setBusy] = useState(false);
  // 카카오 인증이 안 되는 사용자를 위한 정식 대체 경로 (사용자 요청 2026-07-23)
  const [emailOpen, setEmailOpen] = useState(false);
  // 초대 링크로 들어온 짝꿍 — 로그인만 하면 코드가 자동으로 이어진다
  const [invited] = useState(() => pendingInviteCode() !== null);

  const handleKakao = async () => {
    setBusy(true);
    try {
      await signInWithKakao();
      // 성공 시 카카오로 리다이렉트되므로 busy 해제 불필요. 실패 대비만 아래에서.
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-6 py-10">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p aria-hidden className="mb-3 text-5xl">🎨</p>
        <h1 className="text-3xl font-bold">우리의 도화지</h1>
        <p className="mt-2 text-sm opacity-60">
          짝꿍과 둘이서 채워가는 지도 한 장
        </p>

        {invited && (
          <p className="mt-5 w-full rounded-2xl rounded-tl-md border-2 border-pink/40 bg-pink/10 px-4 py-3 text-sm font-semibold">
            💌 짝꿍의 초대장이 도착했어요 — 로그인하면 바로 연결돼요
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleKakao()}
          disabled={busy}
          className="mt-10 w-full rounded-2xl rounded-tl-md bg-yellow px-6 py-3.5 text-base font-bold text-ink shadow-sm active:translate-y-px disabled:opacity-60"
        >
          💬 카카오로 시작하기
        </button>

        {emailOpen ? (
          <EmailAuth />
        ) : (
          <button
            type="button"
            onClick={() => setEmailOpen(true)}
            className="mt-4 text-sm font-semibold opacity-60 underline underline-offset-4 active:opacity-80"
          >
            카카오가 안 되면 이메일로 시작하기
          </button>
        )}
      </div>

      <div className="space-y-1 pb-2 text-center text-xs opacity-45">
        <p>앱인토스에서는 토스 로그인으로 이용하게 돼요</p>
        <div className="flex items-center justify-center gap-3">
          <a href="/privacy.html" className="underline underline-offset-2">
            개인정보 처리방침
          </a>
          {/* Phase 0 전용 — 미니앱 WebView엔 주소창이 없어 진단 페이지 진입로가 필요하다.
              샌드박스 검증이 끝나면 이 버튼과 SpikePage를 함께 제거한다. */}
          <button
            type="button"
            onClick={() => {
              window.location.hash = '#/spike';
            }}
            className="underline underline-offset-2"
          >
            환경 진단
          </button>
        </div>
      </div>
    </main>
  );
}

type Mode = 'signin' | 'signup';

/** Supabase 에러 → 부드러운 우리말 안내 */
function friendlyAuthError(message: string, mode: Mode): string {
  const m = message.toLowerCase();
  if (m.includes('already registered')) return '이미 가입된 이메일이에요 — 로그인으로 들어와 주세요';
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호를 다시 확인해 주세요';
  if (m.includes('password') && (m.includes('at least') || m.includes('short')))
    return '비밀번호는 6자 이상으로 해 주세요';
  if (m.includes('valid email') || m.includes('invalid format')) return '이메일 주소를 다시 확인해 주세요';
  if (m.includes('rate limit') || m.includes('too many')) return '시도가 잦았어요 — 잠시 뒤에 다시 해 주세요';
  return mode === 'signup' ? '가입에 문제가 생겼어요. 다시 시도해 주세요' : '로그인에 문제가 생겼어요. 다시 시도해 주세요';
}

/** 이메일 가입·로그인 — 카카오 인증이 막힌 사용자용 대체 경로. 성공 시 세션 구독(Gate)이 이어받는다. */
function EmailAuth() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const trimmed = email.trim();
    if (mode === 'signin' && !trimmed.includes('@')) {
      // 아이디 로그인 — 매핑은 서버(/api/id-login)에만 있어 이메일이 노출되지 않는다
      try {
        const res = await fetch('/api/id-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loginId: trimmed, password }),
        });
        if (!res.ok) {
          setError('아이디 또는 비밀번호를 다시 확인해 주세요');
        } else {
          const tokens = (await res.json()) as { access_token: string; refresh_token: string };
          const { error: sessionError } = await supabase.auth.setSession(tokens);
          if (sessionError) setError('로그인에 문제가 생겼어요. 다시 시도해 주세요');
        }
      } catch {
        setError('로그인에 문제가 생겼어요. 다시 시도해 주세요');
      }
    } else if (mode === 'signin') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: trimmed, password });
      if (signInError) setError(friendlyAuthError(signInError.message, mode));
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({ email: trimmed, password });
      if (signUpError) {
        setError(friendlyAuthError(signUpError.message, mode));
      } else if (!data.session) {
        // 이메일 인증이 켜져 있거나 기존 계정 재가입 시 세션이 안 생길 수 있다
        setError('가입은 됐는데 바로 들어가지지 않았어요 — 로그인 탭으로 들어와 주세요');
      }
    }
    setBusy(false);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mt-6 w-full space-y-2.5 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/60 p-4 text-left"
    >
      <div className="flex rounded-full border border-ink/15 bg-white/60 p-0.5 text-xs font-semibold">
        <button
          type="button"
          onClick={() => {
            setMode('signin');
            setError(null);
          }}
          className={`flex-1 rounded-full px-3 py-1.5 text-center ${mode === 'signin' ? 'bg-ink text-paper' : 'opacity-60'}`}
        >
          로그인
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('signup');
            setError(null);
          }}
          className={`flex-1 rounded-full px-3 py-1.5 text-center ${mode === 'signup' ? 'bg-ink text-paper' : 'opacity-60'}`}
        >
          처음이에요
        </button>
      </div>

      <input
        type={mode === 'signin' ? 'text' : 'email'}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={mode === 'signin' ? '이메일 또는 아이디' : '이메일'}
        autoComplete="username"
        className="w-full rounded-xl border-2 border-ink/15 bg-white/80 px-3 py-2.5 outline-none focus:border-pink"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={mode === 'signup' ? '비밀번호 (6자 이상)' : '비밀번호'}
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        className="w-full rounded-xl border-2 border-ink/15 bg-white/80 px-3 py-2.5 outline-none focus:border-pink"
      />
      {error && <p className="text-xs text-pink">{error}</p>}
      <button
        type="submit"
        disabled={!email || password.length < 6 || busy}
        className="w-full rounded-2xl rounded-tl-md bg-pink px-4 py-2.5 text-sm font-bold text-white active:translate-y-px disabled:opacity-40"
      >
        {busy ? '들어가는 중…' : mode === 'signup' ? '가입하고 시작하기' : '로그인'}
      </button>
      <p className="break-keep text-xs opacity-50">
        {mode === 'signup'
          ? '카카오 계정과는 별개의 새 계정이에요 · 비밀번호를 꼭 기억해 주세요'
          : '가입할 때 쓴 이메일과 비밀번호로 들어와 주세요'}
      </p>
    </form>
  );
}
