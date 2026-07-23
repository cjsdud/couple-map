import { useEffect, useRef, useState } from 'react';
import { cardToBlob } from '../lib/shareCard';
import BottomSheet from './BottomSheet';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 카드를 캔버스에 그리는 페인터 (shareCard.ts) — 열릴 때 1회 실행 */
  paint: (canvas: HTMLCanvasElement) => Promise<void>;
  /** 저장 파일명 (예: dohwaji-2026-07-12.png) */
  fileName: string;
}

/**
 * 공유 카드 시트 — 캔버스로 그린 카드를 미리 보여주고 공유하기·이미지 저장을 제공한다.
 * 상세 시트 안에서 겹쳐 뜨는 레이어 (IA 원칙: 새 화면 금지).
 * BottomSheet가 닫히면 CardPreview가 언마운트되므로 열 때마다 새로 그린다.
 */
export default function ShareCardSheet({ open, onClose, paint, fileName }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title="공유 카드">
      <CardPreview paint={paint} fileName={fileName} />
    </BottomSheet>
  );
}

/** 미리보기 + 공유/저장 본체 — 다른 시트(종합 카드 등)에서도 재사용. key로 다시 그리기 제어 */
export function CardPreview({ paint, fileName }: { paint: Props['paint']; fileName: string }) {
  // 마운트 시점의 페인터로 1회만 그린다 — 부모 리렌더로 인한 다시 그리기 방지
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
            canShare
              ? 'rounded-br-md border-2 border-ink/15 bg-white/70'
              : 'rounded-tl-md bg-pink text-white'
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
