import { CATEGORY_LABEL, placeVisitCounts, useRecords } from './useRecords';

type Filter = 'all' | 'date' | 'daily';

/**
 * 타임라인 뷰 (지도 ↔ 타임라인 토글).
 * 오늘 기록 통합(필터 '오늘만')은 M2 완료 후 연결 — 지금은 데이트 기록만.
 */
export default function Timeline({ filter }: { filter: Filter }) {
  const { data: records = [], isPending } = useRecords();
  const clusterCounts = placeVisitCounts(records);

  if (isPending) {
    return <p className="py-10 text-center text-sm opacity-50">기록을 펼치는 중…</p>;
  }
  if (records.length === 0) {
    return (
      <div className="space-y-1 py-10 text-center">
        <p className="text-3xl" aria-hidden>🖍️</p>
        <p className="text-sm opacity-60">아직 기록이 없어요 — 첫 데이트 장소를 콕 찍어 볼까요?</p>
      </div>
    );
  }

  const visible = filter === 'daily' ? [] : records;

  return (
    <ol className="space-y-3">
      {filter === 'daily' && (
        <p className="py-6 text-center text-sm opacity-50">오늘 기록 통합은 곧 열려요 (M2)</p>
      )}
      {visible.map((r) => {
        const total = r.expenses.reduce((sum, e) => sum + e.amount, 0);
        return (
          <li
            key={r.id}
            className={`rounded-2xl rounded-tl-md border-2 bg-white/60 p-4 ${
              r.status === 'visited' ? 'border-ink/15' : 'border-dashed border-ink/25'
            }`}
          >
            <div className="flex items-center justify-between text-xs opacity-60">
              <span>{r.date}</span>
              {r.status === 'planned' && <span className="font-semibold">가고 싶은 곳</span>}
            </div>
            <p className="mt-1 text-sm font-semibold leading-relaxed">
              {r.spots
                .slice()
                .sort((a, b) => a.seq - b.seq)
                .map((s, i) => {
                  const n = s.kakao_place_id ? clusterCounts[s.kakao_place_id] : 0;
                  return (
                    <span key={s.id}>
                      {i > 0 && <span className="opacity-40"> → </span>}
                      {s.name}
                      {n > 1 && <span className="ml-0.5 text-xs text-pink">×{n}</span>}
                    </span>
                  );
                })}
            </p>
            {r.memo && <p className="mt-1 text-sm opacity-70">{r.memo}</p>}
            {total > 0 && (
              <p className="mt-2 text-xs opacity-60">
                {r.expenses.map((e) => CATEGORY_LABEL[e.category]).join(' · ')} —{' '}
                {total.toLocaleString()}원
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
