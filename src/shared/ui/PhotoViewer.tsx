import { useCallback, useEffect, useRef, useState } from 'react';

interface PhotoViewerProps {
  /** 보여줄 이미지 URL — null이면 닫힘 */
  url: string | null;
  onClose: () => void;
}

const MAX_SCALE = 5;

/**
 * 전체 화면 사진 뷰어 — 핀치 줌·드래그·더블탭 확대 지원.
 * 페이지 확대는 iOS 자동 줌 방지를 위해 막아두었으므로(viewport maximum-scale=1)
 * 뷰어 자체가 포인터 이벤트로 줌을 구현한다 (지도 줌과 동일 방식).
 */
export default function PhotoViewer({ url, onClose }: PhotoViewerProps) {
  if (!url) return null;
  // url을 key로 — 사진이 바뀌면 배율 상태가 자연 리셋된다
  return <Viewer key={url} url={url} onClose={onClose} />;
}

function Viewer({ url, onClose }: { url: string; onClose: () => void }) {
  const [t, setT] = useState({ x: 0, y: 0, scale: 1 });
  const [touching, setTouching] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);
  const lastTap = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
    setTouching(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0 && dist > 0) {
        setT((v) => ({
          ...v,
          scale: Math.min(Math.max(v.scale * (dist / pinchDist.current), 1), MAX_SCALE),
        }));
      }
      pinchDist.current = dist;
      return;
    }
    setT((v) =>
      v.scale > 1 ? { ...v, x: v.x + (e.clientX - prev.x), y: v.y + (e.clientY - prev.y) } : v,
    );
  }, []);

  const onPointerEnd = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = 0;
    if (pointers.current.size === 0) setTouching(false);
    setT((v) => (v.scale <= 1.02 ? { x: 0, y: 0, scale: 1 } : v));
  }, []);

  // 더블탭: 2배 확대 ↔ 원래대로
  const onTap = useCallback(() => {
    const now = performance.now();
    if (now - lastTap.current < 300) {
      setT((v) => (v.scale > 1 ? { x: 0, y: 0, scale: 1 } : { x: 0, y: 0, scale: 2 }));
    }
    lastTap.current = now;
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/90">
      <button
        type="button"
        aria-label="사진 닫기"
        onClick={onClose}
        className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-10 flex h-10 w-10 items-center justify-center rounded-full bg-paper/20 text-xl text-paper"
      >
        ✕
      </button>
      <div
        className="h-full w-full touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={onTap}
      >
        <img
          src={url}
          alt="사진 크게 보기"
          draggable={false}
          className="h-full w-full select-none object-contain"
          style={{
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
            transition: touching ? 'none' : 'transform 120ms ease-out',
          }}
        />
      </div>
    </div>
  );
}
