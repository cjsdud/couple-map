import { useState } from 'react';
import { useSession } from '../../shared/lib/auth';
import { KAKAO_JS_KEY } from '../../shared/lib/kakaoMap';
import { useCoupleState } from '../couple/useCoupleState';
import ConquestMap from './ConquestMap';
import KakaoBaseMap from './KakaoBaseMap';
import RecordDetailSheet from './RecordDetailSheet';
import RecordSheet from './RecordSheet';
import Timeline from './Timeline';
import { useConquest } from './useConquest';
import type { RecordRow } from './useRecords';

type MapMode = 'real' | 'paper';
const MAP_MODE_KEY = 'dohwaji:mapMode';

function initialMapMode(): MapMode {
  if (!KAKAO_JS_KEY) return 'paper';
  try {
    return localStorage.getItem(MAP_MODE_KEY) === 'paper' ? 'paper' : 'real';
  } catch {
    return 'real';
  }
}

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
  const [mapMode, setMapMode] = useState<MapMode>(initialMapMode);
  const [filter, setFilter] = useState<Filter>('all');
  const pickMapMode = (mode: MapMode) => {
    setMapMode(mode);
    try {
      localStorage.setItem(MAP_MODE_KEY, mode);
    } catch {
      // 저장 실패해도 이번 세션에서는 유지
    }
  };
  const [sheetOpen, setSheetOpen] = useState(false);
  // 지도 핀·타임라인 카드 공용 상세 시트 — 선택된 기록 id
  const [detailId, setDetailId] = useState<string | null>(null);
  // 수정 플로우: 상세 시트의 '고치기' → 상세를 닫고 작성 시트를 수정 모드로 연다
  const [editRecord, setEditRecord] = useState<RecordRow | null>(null);
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
        <>
          {KAKAO_JS_KEY && (
            <div className="flex justify-end">
              <div className="flex rounded-full border border-ink/15 bg-white/60 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => pickMapMode('real')}
                  className={`rounded-full px-3 py-1 ${mapMode === 'real' ? 'bg-green text-white' : 'opacity-60'}`}
                >
                  실지도
                </button>
                <button
                  type="button"
                  onClick={() => pickMapMode('paper')}
                  className={`rounded-full px-3 py-1 ${mapMode === 'paper' ? 'bg-green text-white' : 'opacity-60'}`}
                >
                  도화지
                </button>
              </div>
            </div>
          )}
          {visitedCount === 0 && (
            // 첫 실행 행동 유도 (IA 원칙 4: 투어 대신 그 자리에서) — 첫 핀이 생기면 사라진다.
            // 지도 위에 배치해 작은 화면에서도 스크롤 없이 보이고 FAB와 겹치지 않는다.
            <div className="rounded-2xl rounded-tl-md border-2 border-dashed border-pink/40 bg-white/50 px-4 py-3 text-center">
              <p className="text-sm font-semibold">🖍️ 아직 새하얀 도화지예요</p>
              <p className="mt-0.5 break-keep text-sm opacity-60">
                오른쪽 아래 <b className="text-pink">+</b> 를 눌러 첫 데이트 장소를 콕 찍어 볼까요?
              </p>
            </div>
          )}
          {mapMode === 'real' && KAKAO_JS_KEY ? (
            <KakaoBaseMap onSelectRecord={setDetailId} />
          ) : (
            <ConquestMap onSelectRecord={setDetailId} />
          )}
        </>
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
          <Timeline filter={filter} onSelectRecord={setDetailId} />
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
      {/* 수정 모드 작성 시트 — 새 기록 시트와 별도 인스턴스 (닫히면 프리필 상태도 함께 리셋) */}
      <RecordSheet
        open={editRecord !== null}
        onClose={() => setEditRecord(null)}
        coupleId={coupleId}
        editRecord={editRecord ?? undefined}
      />
      <RecordDetailSheet
        recordId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(record) => {
          setDetailId(null);
          setEditRecord(record);
        }}
      />
    </main>
  );
}
