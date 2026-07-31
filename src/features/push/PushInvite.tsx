import { useState } from 'react';
import { usePush } from './usePush';

/**
 * 알림 켜기 권유 — 오늘을 남긴 직후에만 한 번 뜬다.
 *
 * 브라우저는 알림 권한을 코드로 켤 수 없다(반드시 사용자가 눌러야 함). 그래서
 * "자동으로 켜기" 대신 **가치가 가장 잘 보이는 순간에 한 번만 묻는다** —
 * 내가 방금 남겼으니 짝꿍 차례라는 맥락이 있는 자리.
 *
 * 진입 즉시 묻지 않는 이유(명세 §5 다크패턴 금지): 맥락 없이 물으면 대부분 거절하고,
 * 한 번 거절되면 브라우저가 다시 묻지 못하게 막아 되돌릴 방법이 폰 설정뿐이다.
 * 거절 이력은 기기에 남겨 다시 조르지 않는다.
 */
const DISMISS_KEY = 'dohwaji:pushInviteDismissed';

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export default function PushInvite() {
  const { state, busy, enable } = usePush();
  const [hidden, setHidden] = useState(dismissed);

  // 이미 켰거나·차단됐거나·지원 안 되면 권유할 게 없다.
  // 아이폰 사파리 탭(needs-install)도 여기선 조용히 넘어간다 — 설치 안내는 우리 탭에 있다.
  if (hidden || state !== 'off') return null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // 저장 못 해도 이번 세션에선 숨겨진다
    }
  };

  return (
    <section className="space-y-2 rounded-2xl rounded-tl-md border-2 border-pink/30 bg-pink/5 p-4">
      <p className="text-sm font-semibold">짝꿍이 남기면 알려드릴까요?</p>
      <p className="break-keep text-xs leading-relaxed opacity-65">
        짝꿍이 오늘을 남기는 순간 잠금이 풀려요. 그때만 알려드릴게요 · 하루 3번까지만
      </p>
      <div className="flex gap-2 pt-0.5">
        <button
          type="button"
          onClick={close}
          className="flex-1 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 py-2 text-sm font-bold active:translate-y-px"
        >
          괜찮아요
        </button>
        <button
          type="button"
          onClick={() => void enable().then(close)}
          disabled={busy}
          className="flex-1 rounded-2xl rounded-br-md bg-pink py-2 text-sm font-bold text-white active:translate-y-px disabled:opacity-50"
        >
          {busy ? '켜는 중…' : '알림 받기'}
        </button>
      </div>
    </section>
  );
}
