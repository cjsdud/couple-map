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
 * 열려 있는 동안 배경(body) 스크롤을 잠가 뒤 화면이 딸려 움직이지 않게 한다.
 */
export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // 배경 스크롤 잠금 — 모달 열린 동안 뒤 화면이 터치로 스크롤되며 겹치는 문제 방지
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
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
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-md overflow-y-auto overscroll-contain rounded-t-3xl rounded-tr-lg border-t-2 border-ink/10 bg-paper px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(59,55,51,0.18)]"
      >
        {/* 고정 높이 헤더 밴드 — ✕가 이 밴드 안에만 있어 내용 첫 줄과 절대 안 겹친다 */}
        <div className="sticky top-0 z-10 -mx-5 flex h-12 items-center justify-end bg-paper px-3">
          <div
            aria-hidden
            className="absolute left-1/2 top-2 h-1.5 w-12 -translate-x-1/2 -rotate-1 rounded-full bg-ink/15"
          />
          <button
            type="button"
            aria-label="시트 닫기"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg opacity-50 active:bg-ink/10"
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
