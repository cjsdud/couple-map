/**
 * 오늘 탭 (M2 본구현 전 스켈레톤).
 * 상호 잠금 카드의 상시 설명 문구는 IA 원칙 4(투어 금지, 맥락 내 설명)에 따라
 * 스켈레톤 단계부터 자리 잡는다.
 */
export default function TodayScreen() {
  return (
    <main className="space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">오늘</h1>

      <section className="space-y-2 rounded-2xl rounded-tr-md border-2 border-dashed border-ink/25 bg-white/50 p-5 text-center">
        <p className="text-3xl" aria-hidden>
          🔒
        </p>
        <p className="font-semibold">짝꿍의 오늘이 잠겨 있어요</p>
        <p className="text-sm opacity-70">내 사진을 올리면 짝꿍의 오늘이 열려요</p>
        <button
          type="button"
          disabled
          className="mt-2 rounded-full bg-pink px-5 py-2.5 text-sm font-bold text-white opacity-50"
        >
          오늘 사진 올리기 (M2)
        </button>
      </section>

      <section className="rounded-2xl rounded-bl-md border-2 border-ink/15 bg-white/60 p-4">
        <h2 className="mb-1 text-sm font-semibold">오늘의 질문</h2>
        <p className="text-sm opacity-60">둘 다 답하면 서로의 답이 열려요 (M2)</p>
      </section>

      <section className="rounded-2xl border-2 border-ink/15 bg-white/60 p-4">
        <h2 className="mb-1 text-sm font-semibold">커플 잔디</h2>
        <p className="text-sm opacity-60">사진·질문·기분 중 하나면 오늘 칸이 채워져요 (M2)</p>
      </section>
    </main>
  );
}
