import { useEffect, useRef, useState } from 'react';
import { cardToBlob, SHARE_THEMES, type ShareTheme } from '../lib/shareCard';
import BottomSheet from './BottomSheet';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 카드를 캔버스에 그리는 페인터 (테마 반영) — 열릴 때·테마 변경 시 실행 */
  paint: (canvas: HTMLCanvasElement, theme: ShareTheme) => Promise<void>;
  /** 저장 파일명 (예: dohwaji-2026-07-12.png) */
  fileName: string;
}

/**
 * 공유 카드 시트 — 테마를 고르고, 미리보기 후 공유하기·이미지 저장.
 * BottomSheet 안 레이어 (IA 원칙: 새 화면 금지).
 */
export default function ShareCardSheet({ open, onClose, paint, fileName }: Props) {
  const [theme, setTheme] = useState<ShareTheme>('paper');
  return (
    <BottomSheet open={open} onClose={onClose} title="공유 카드">
      <div className="space-y-3 pb-2">
        <ThemePicker theme={theme} onPick={setTheme} />
        {/* theme을 key로 — 테마가 바뀌면 새로 그린다 */}
        <CardPreview key={theme} paint={(canvas) => paint(canvas, theme)} fileName={fileName} />
      </div>
    </BottomSheet>
  );
}

/** 테마 선택 칩 — 공유/종합 카드 시트 공용 */
export function ThemePicker({ theme, onPick }: { theme: ShareTheme; onPick: (t: ShareTheme) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold opacity-50">테마</p>
      <div className="flex gap-2">
        {SHARE_THEMES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onPick(t.key)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-2xl rounded-tl-md border-2 py-2 text-xs font-semibold active:translate-y-px ${
              theme === t.key ? 'border-pink bg-pink/10' : 'border-ink/15 bg-white/60'
            }`}
          >
            <span
              className="h-6 w-6 rounded-full border border-ink/15"
              style={{ backgroundColor: t.swatch }}
              aria-hidden
            />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 미리보기 + 공유/저장 본체. key로 다시 그리기 제어 (마운트 시 1회 그림) */
export function CardPreview({
  paint,
  fileName,
}: {
  paint: (canvas: HTMLCanvasElement) => Promise<void>;
  fileName: string;
}) {
  const paintRef = useRef(paint);
  const blobRef = useRef<Blob | null>(null);
  const [status, setStatus] = useState<'painting' | 'ready' | 'error'>('painting');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    paintRef
      .current(canvas)
      .then(() => cardToBlob(canvas))
      .then((blob) => {
        if (cancelled) return;
        blobRef.current = blob;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  };

  const canShare = typeof navigator.share === 'function';
  const share = () => {
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/png' });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).catch(() => {
        // 공유 시트를 그냥 닫은 경우 — 조용히 무시
      });
    } else {
      download();
    }
  };

  if (status === 'painting') {
    return <p className="py-10 text-center text-sm opacity-50">카드를 그리는 중…</p>;
  }
  if (status === 'error' || !url) {
    return (
      <p className="py-10 text-center text-sm text-pink">
        카드를 그리다가 문제가 생겼어요. 시트를 닫고 다시 열어 주세요.
      </p>
    );
  }
  return (
    <div className="space-y-3 pb-2">
      <img
        src={url}
        alt="공유 카드 미리보기"
        className="w-full rounded-2xl rounded-tl-md border-2 border-ink/10 shadow-sm"
      />
      <div className="flex gap-2">
        {canShare && (
          <button
            type="button"
            onClick={share}
            className="flex-1 rounded-2xl rounded-tl-md bg-pink py-3 text-sm font-bold text-white active:translate-y-px"
          >
            공유하기
          </button>
        )}
        <button
          type="button"
          onClick={download}
          className={`flex-1 rounded-2xl py-3 text-sm font-bold active:translate-y-px ${
            canShare ? 'rounded-br-md border-2 border-ink/15 bg-white/70' : 'rounded-tl-md bg-pink text-white'
          }`}
        >
          이미지 저장
        </button>
      </div>
      <p className="break-keep text-center text-xs opacity-50">
        인스타 세로 규격(4:5)이에요 · 지출은 담지 않아요 · 미리보기를 길게 눌러도 저장돼요
      </p>
    </div>
  );
}
