import type { ReactNode } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * 공용 바텀시트 — IA 원칙: 새 화면 금지, 확장은 레이어·카드·모달로만.
 * 도화지 톤: 비대칭 라운드 + 마스킹테이프 느낌의 핸들.
 */
export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
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
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-md overflow-y-auto rounded-t-3xl rounded-tr-lg border-t-2 border-ink/10 bg-paper px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(59,55,51,0.18)]"
      >
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-12 -rotate-1 rounded-full bg-ink/15" />
        {title && <h2 className="mb-3 text-lg font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
