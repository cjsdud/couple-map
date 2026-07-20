import { useState } from 'react';
import { signInWithKakao } from '../../shared/lib/auth';

export default function LoginScreen() {
  const [busy, setBusy] = useState(false);

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
      </div>

      <p className="pb-2 text-center text-xs opacity-45">
        앱인토스에서는 토스 로그인으로 이용하게 돼요
      </p>
    </main>
  );
}
