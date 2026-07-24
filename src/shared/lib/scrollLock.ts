/**
 * 배경 스크롤 잠금 — 모달이 겹쳐 떠도(예: 기록 상세 안의 공유 카드) 안전하게.
 * 참조 카운트로 관리한다: 첫 잠금에서만 원래 값을 저장하고, 마지막 해제에서만 복원.
 * (컴포넌트별로 body.overflow를 저장/복원하면 중첩 시 'hidden'이 남아 스크롤이 죽는다.)
 */
let count = 0;
let previous = '';

export function lockScroll() {
  if (count === 0) {
    previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  count += 1;
}

export function unlockScroll() {
  count = Math.max(0, count - 1);
  if (count === 0) {
    document.body.style.overflow = previous;
  }
}
