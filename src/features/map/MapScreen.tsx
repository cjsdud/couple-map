import { useState } from 'react';
import { useSession } from '../../shared/lib/auth';
import { useCoupleState } from '../couple/useCoupleState';
import ConquestMap from './ConquestMap';
import RecordSheet from './RecordSheet';
import Timeline from './Timeline';
import { useConquest } from './useConquest';

type View = 'map' | 'timeline';
type Filter = 'all' | 'date' | 'daily';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'date', label: '데이트만' },
  { key: 'daily', label: '오늘만' },
];

/** 지도 탭 = 홈. 정복률 헤더 + SVG 정복 지도 ↔ 타임라인 토글 + 기록 작성 FAB. */
export default function MapScreen() {
  const { ratio, visitedCount, totalCount } = useConquest();
  const [view, setView] = useState<View>('map');
  const [filter, setFilter] = useState<Filter>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const { session } = useSession();
  const coupleState = useCoupleState(session?.user.id);
  const coupleId = coupleState.data?.couple?.id;

  return (
    <main className="space-y-4 px-4 py-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">우리의 도화지</h1>
          <p className="text-sm opacity-70">
            대한민국 <b className="text-pink">{(ratio * 100).toFixed(1)}%</b> 정복
            <span className="ml-1 text-xs opacity-60">
              ({visitedCount}/{totalCount})
            </span>
          </p>
        </div>
        <div className="flex rounded-full border border-ink/15 bg-white/60 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setView('map')}
            className={`rounded-full px-3 py-1.5 ${view === 'map' ? 'bg-ink text-paper' : 'opacity-60'}`}
          >
            지도
          </button>
          <button
            type="button"
            onClick={() => setView('timeline')}
            className={`rounded-full px-3 py-1.5 ${view === 'timeline' ? 'bg-ink text-paper' : 'opacity-60'}`}
          >
            타임라인
          </button>
        </div>
      </header>

      {view === 'map' ? (
        <ConquestMap />
      ) : (
        <>
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1.5 text-xs ${
                  filter === f.key ? 'bg-green font-bold text-white' : 'border border-ink/15 bg-white/60'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Timeline filter={filter} />
        </>
      )}

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-24 right-5 z-30 h-14 w-14 rounded-full rounded-br-md bg-pink text-2xl font-bold text-white shadow-lg active:translate-y-px"
        aria-label="기록 추가"
      >
        +
      </button>

      <RecordSheet open={sheetOpen} onClose={() => setSheetOpen(false)} coupleId={coupleId} />
    </main>
  );
}
