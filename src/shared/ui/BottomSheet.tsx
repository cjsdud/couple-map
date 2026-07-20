import { useEffect, type ReactNode } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * 공용 바텀시트 — IA 원칙: 새 화면 금지, 확장은 레이어·카드·모달로만.
 * 시트가 길어지면 딤 영역이 거의 안 남으므로 ✕ 버튼·ESC 닫기를 항상 제공한다.
 */
export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 h-full w-full bg-ink/35"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-md overflow-y-auto rounded-t-3xl rounded-tr-lg border-t-2 border-ink/10 bg-paper px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(59,55,51,0.18)]"
      >
        {/* 스크롤해도 닫기가 항상 보이도록 sticky 헤더 */}
        <div className="sticky top-0 z-10 -mx-5 rounded-t-3xl bg-paper px-5 pb-1 pt-3">
          <div aria-hidden className="mx-auto h-1.5 w-12 -rotate-1 rounded-full bg-ink/15" />
          <button
            type="button"
            aria-label="시트 닫기"
            onClick={onClose}
            className="absolute right-3 top-2 flex h-8 w-8 items-center justify-center rounded-full text-lg opacity-40 active:bg-ink/10"
          >
            ✕
          </button>
        </div>
        {title && <h2 className="mb-3 text-lg font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
