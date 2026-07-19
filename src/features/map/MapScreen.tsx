import ConquestMap from './ConquestMap';
import { useConquest } from './useConquest';

/** 지도 탭 = 홈. 정복률 헤더 + SVG 정복 지도. 기록 CRUD·타임라인은 M1에서 확장. */
export default function MapScreen() {
  const { ratio, visitedCount, totalCount } = useConquest();

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
      </header>

      <ConquestMap />

      <button
        type="button"
        disabled
        className="fixed bottom-24 right-5 z-30 h-14 w-14 rounded-full rounded-br-md bg-pink text-2xl font-bold text-white shadow-lg opacity-50"
        aria-label="기록 추가 (M1)"
      >
        +
      </button>
    </main>
  );
}
