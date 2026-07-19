/** 우리 탭 (M3 본구현 전 스켈레톤). 디데이·가계부 월간 카드·설정이 들어온다. */
export default function UsScreen() {
  return (
    <main className="space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">우리</h1>

      <section className="rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/60 p-5 text-center">
        <p className="text-sm opacity-60">함께한 지</p>
        <p className="text-3xl font-bold text-pink">D+?</p>
        <p className="text-xs opacity-50">커플 연결 후 표시돼요 (M3)</p>
      </section>

      <section className="rounded-2xl border-2 border-ink/15 bg-white/60 p-4">
        <h2 className="mb-1 text-sm font-semibold">이번 달 데이트 가계부</h2>
        <p className="text-sm opacity-60">합계·횟수·평균과 밸런스를 보여드려요 (M3)</p>
      </section>

      <section className="rounded-2xl border-2 border-ink/15 bg-white/60 p-4">
        <h2 className="mb-1 text-sm font-semibold">설정</h2>
        <p className="text-sm opacity-60">커플 연결 · 마감 시각 · 부담 비율 · 알림 (M3)</p>
      </section>
    </main>
  );
}
