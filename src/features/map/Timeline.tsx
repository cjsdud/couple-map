import { useDailyTimeline, useTodayContext, type DailyDaySummary } from '../today/useToday';
import { CATEGORY_LABEL, placeVisitCounts, useRecords, type RecordRow } from './useRecords';

type Filter = 'all' | 'date' | 'daily';

type Item =
  | { kind: 'record'; date: string; record: RecordRow }
  | { kind: 'daily'; date: string; summary: DailyDaySummary };

/** 타임라인 뷰 (지도 ↔ 토글) — 데이트 기록 + 오늘 기록 통합, 필터 전체/데이트만/오늘만 */
export default function Timeline({
  filter,
  onSelectRecord,
}: {
  filter: Filter;
  /** 데이트 기록 카드 탭 → 기록 상세 시트 오픈 (지도 핀과 동일) */
  onSelectRecord?: (recordId: string) => void;
}) {
  const { couple, entryDate } = useTodayContext();
  const { data: records = [], isPending } = useRecords();
  const daily = useDailyTimeline(couple?.id, entryDate).data ?? [];
  const clusterCounts = placeVisitCounts(records);

  if (isPending) {
    return <p className="py-10 text-center text-sm opacity-50">기록을 펼치는 중…</p>;
  }

  const items: Item[] = [
    ...(filter !== 'daily' ? records.map((r): Item => ({ kind: 'record', date: r.date, record: r })) : []),
    ...(filter !== 'date' ? daily.map((s): Item => ({ kind: 'daily', date: s.date, summary: s })) : []),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  if (items.length === 0) {
    return (
      <div className="space-y-1 py-10 text-center">
        <p className="text-3xl" aria-hidden>🖍️</p>
        <p className="break-keep text-sm opacity-60">아직 기록이 없어요 — 첫 데이트 장소를 콕 찍어 볼까요?</p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {items.map((item) =>
        item.kind === 'record' ? (
          <RecordItem
            key={`r-${item.record.id}`}
            record={item.record}
            clusterCounts={clusterCounts}
            onSelect={onSelectRecord}
          />
        ) : (
          <DailyItem key={`d-${item.date}`} summary={item.summary} />
        ),
      )}
    </ol>
  );
}

function RecordItem({
  record: r,
  clusterCounts,
  onSelect,
}: {
  record: RecordRow;
  clusterCounts: Record<string, number>;
  onSelect?: (recordId: string) => void;
}) {
  const total = r.expenses.reduce((sum, e) => sum + e.amount, 0);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(r.id)}
        aria-label={`${r.date} 기록 자세히 보기`}
        className={`w-full rounded-2xl rounded-tl-md border-2 bg-white/60 p-4 text-left active:translate-y-px ${
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
                  {/* 스팟 이름은 한 덩어리로 — 줄바꿈은 스팟 사이에서 일어나게 */}
                  <span className="inline-block max-w-full truncate align-bottom">
                    {s.name}
                    {n > 1 && <span className="ml-0.5 text-xs text-pink">×{n}</span>}
                  </span>
                </span>
              );
            })}
        </p>
        {r.memo && <p className="mt-1 break-words text-sm opacity-70">{r.memo}</p>}
        {total > 0 && (
          <p className="mt-2 text-xs opacity-60">
            {r.expenses.map((e) => CATEGORY_LABEL[e.category]).join(' · ')} — {total.toLocaleString()}원
          </p>
        )}
      </button>
    </li>
  );
}

/** 오늘 기록 요약 행 — 일상 기록은 잔잔한 톤으로 (데이트 기록과 구분) */
function DailyItem({ summary: s }: { summary: DailyDaySummary }) {
  const parts = [
    s.photoCount > 0 ? `사진 ${s.photoCount}장` : null,
    s.answeredCount > 0 ? `답한 질문 ${s.answeredCount}` : null,
    s.noteCount > 0 ? `일기 ${s.noteCount}` : null,
  ].filter(Boolean);
  return (
    <li className="rounded-2xl rounded-br-md border border-ink/10 bg-white/40 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm">
          <span className="text-xs opacity-50">{s.date} · 오늘</span>
          <span className="ml-2 opacity-80">{parts.join(' · ')}</span>
        </p>
        {s.moods.length > 0 && <span className="shrink-0 text-base">{s.moods.join(' ')}</span>}
      </div>
    </li>
  );
}
