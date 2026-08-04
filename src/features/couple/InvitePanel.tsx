import { useState } from 'react';
import { inviteLink } from '../../shared/lib/invite';

/**
 * 초대 코드 + 링크 보내는 칸 — 온보딩 대기 화면과 우리 탭 초대 카드가 같이 쓴다.
 *
 * 링크를 버튼 뒤에 숨기지 않고 **눈에 보이는 칸**으로 둔다 (사용자 요청 2026-08-03):
 * 공유 시트가 없는 환경(PC·일부 인앱)에서도 링크를 직접 긁어 보낼 수 있고,
 * 내가 뭘 보내는지 보이는 쪽이 안심된다.
 */
export default function InvitePanel({ code }: { code: string }) {
  const link = inviteLink(code);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const [sentHint, setSentHint] = useState(false);
  const copy = async (kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(kind === 'code' ? code : link);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
      return true;
    } catch {
      // 클립보드 미지원 WebView — 칸이 보이므로 길게 눌러 직접 복사할 수 있다
      return false;
    }
  };

  // 초대장 보내기 — 공유 시트(카톡 등)로 링크 전달. 시트가 없거나 거부되는 환경(PC·일부
  // 인앱)에서는 복사로 폴백하고 버튼 글씨로 말해준다 — 조용히 삼키면 죽은 버튼처럼 보인다.
  const send = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: '우리의 도화지',
          text: `우리 둘만의 지도를 같이 채워보자 🖍️ 초대 코드: ${code}`,
          url: link,
        });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return; // 시트를 그냥 닫음
      }
    }
    if (await copy('link')) {
      setSentHint(true);
      setTimeout(() => setSentHint(false), 2500);
    }
  };

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={() => void copy('code')}
        className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 py-6 shadow-sm active:translate-y-px"
        aria-label="초대 코드 복사"
      >
        <p className="select-all text-4xl font-bold tracking-[0.35em] text-pink">{code}</p>
        <p className="mt-1.5 text-xs opacity-45">
          {copied === 'code' ? '코드를 복사했어요!' : '탭하면 코드가 복사돼요'}
        </p>
      </button>

      {/* 초대 링크 칸 — 짝꿍이 열면 코드가 자동으로 채워진다 */}
      <div className="flex items-center gap-2 rounded-2xl rounded-tr-md border-2 border-ink/15 bg-white/70 py-1.5 pl-4 pr-1.5">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="초대 링크"
          className="min-w-0 flex-1 bg-transparent text-sm opacity-70 outline-none"
        />
        <button
          type="button"
          onClick={() => void copy('link')}
          className="shrink-0 rounded-xl rounded-tl-sm border-2 border-ink/15 bg-white px-3 py-2 text-xs font-bold active:translate-y-px"
        >
          {copied === 'link' ? '복사됨 ✓' : '복사'}
        </button>
      </div>

      <button
        type="button"
        onClick={() => void send()}
        className="w-full rounded-2xl rounded-tl-md bg-pink px-6 py-3.5 text-base font-bold text-white shadow-sm active:translate-y-px"
      >
        {sentHint ? '링크 복사됨 — 붙여넣어 보내 주세요!' : '💌 초대장 보내기'}
      </button>
      <p className="break-keep text-center text-xs opacity-50">
        링크를 받은 짝꿍은 코드가 자동으로 채워져요 — 코드를 직접 입력해도 돼요.
      </p>
    </div>
  );
}
