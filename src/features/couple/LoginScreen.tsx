import { useState } from 'react';
import { signInWithKakao } from '../../shared/lib/auth';
import { supabase } from '../../shared/lib/supabase';

export default function LoginScreen() {
  const [busy, setBusy] = useState(false);
  // 개발·데모용 이메일 로그인 — ?dev=1일 때만 노출 (실사용자는 카카오/토스만 본다)
  const devMode = new URLSearchParams(window.location.search).has('dev');

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

        <button
          type="button"
          onClick={() => void handleKakao()}
          disabled={busy}
          className="mt-10 w-full rounded-2xl rounded-tl-md bg-yellow px-6 py-3.5 text-base font-bold text-ink shadow-sm active:translate-y-px disabled:opacity-60"
        >
          💬 카카오로 시작하기
        </button>

        {devMode && <DevLogin />}
      </div>

      <p className="pb-2 text-center text-xs opacity-45">
        앱인토스에서는 토스 로그인으로 이용하게 돼요
      </p>
    </main>
  );
}

function DevLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError('이메일 또는 비밀번호를 다시 확인해 주세요');
    setBusy(false);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mt-8 w-full space-y-2 rounded-2xl rounded-tl-md border-2 border-dashed border-ink/20 bg-white/50 p-4"
    >
      <p className="text-xs font-semibold opacity-50">개발용 이메일 로그인</p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="이메일"
        autoComplete="username"
        className="w-full rounded-xl border-2 border-ink/15 bg-white/80 px-3 py-2 text-sm outline-none focus:border-pink"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="비밀번호"
        autoComplete="current-password"
        className="w-full rounded-xl border-2 border-ink/15 bg-white/80 px-3 py-2 text-sm outline-none focus:border-pink"
      />
      {error && <p className="text-xs text-pink">{error}</p>}
      <button
        type="submit"
        disabled={!email || !password || busy}
        className="w-full rounded-xl bg-ink px-4 py-2 text-sm font-bold text-paper disabled:opacity-40"
      >
        {busy ? '들어가는 중…' : '로그인'}
      </button>
    </form>
  );
}
