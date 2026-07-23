import { useEffect, useRef, useState } from 'react';
import { cardToBlob, SHARE_THEMES, type ShareTheme } from '../lib/shareCard';
import BottomSheet from './BottomSheet';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 카드를 캔버스에 그리는 페인터 (테마·문구 반영) */
  paint: (canvas: HTMLCanvasElement, theme: ShareTheme, caption: string) => Promise<void>;
  fileName: string;
  /** 문구 입력의 초기값 (예: 기록 메모) */
  defaultCaption?: string;
  /** 문구 입력 안내 문구 */
  captionPlaceholder?: string;
}

/**
 * 공유 카드 시트 — 테마·문구를 고쳐가며 미리보기 후 공유하기·이미지 저장.
 * BottomSheet 안 레이어 (IA 원칙: 새 화면 금지).
 */
export default function ShareCardSheet({
  open,
  onClose,
  paint,
  fileName,
  defaultCaption = '',
  captionPlaceholder = '문구 넣기 (선택)',
}: Props) {
  const [theme, setTheme] = useState<ShareTheme>('paper');
  const [caption, setCaption] = useState(defaultCaption);
  const applied = useDebounced(caption, 450);

  return (
    <BottomSheet open={open} onClose={onClose} title="공유 카드">
      <div className="space-y-3 pb-2">
        <ThemePicker theme={theme} onPick={setTheme} />
        <CaptionField value={caption} onChange={setCaption} placeholder={captionPlaceholder} />
        {/* theme·문구가 바뀌면 새로 그린다 */}
        <CardPreview
          key={`${theme}|${applied}`}
          paint={(canvas) => paint(canvas, theme, applied)}
          fileName={fileName}
        />
      </div>
    </BottomSheet>
  );
}

/** 잦은 재렌더 방지 — 입력이 멈춘 뒤에만 값 반영 */
function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function CaptionField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold opacity-50">문구</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={80}
        placeholder={placeholder}
        className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink"
      />
    </div>
  );
}

/** 테마 선택 칩 — 공유/종합 카드 시트 공용 (6종, 3열 그리드) */
export function ThemePicker({ theme, onPick }: { theme: ShareTheme; onPick: (t: ShareTheme) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold opacity-50">테마</p>
      <div className="grid grid-cols-3 gap-2">
        {SHARE_THEMES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onPick(t.key)}
            className={`flex items-center justify-center gap-1.5 rounded-2xl rounded-tl-md border-2 py-2 text-xs font-semibold active:translate-y-px ${
              theme === t.key ? 'border-pink bg-pink/10' : 'border-ink/15 bg-white/60'
            }`}
          >
            <span
              className="h-4 w-4 shrink-0 rounded-full border border-ink/15"
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
