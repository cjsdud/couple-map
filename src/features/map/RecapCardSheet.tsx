import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { paintRecapCard, type RecapCardData, type ShareTheme } from '../../shared/lib/shareCard';
import { supabase } from '../../shared/lib/supabase';
import BottomSheet from '../../shared/ui/BottomSheet';
import { CaptionField, CardPreview, ThemePicker } from '../../shared/ui/ShareCardSheet';
import { useGrass } from '../today/useToday';
import { useConquest } from './useConquest';
import { isMock, useRecords } from './useRecords';
import { useSigunguNames } from './useSigunguNames';

type Scope = 'month' | 'all';

/**
 * 종합 카드용 사진 고르기 — 최근 기록부터 1장씩, 모자라면 남은 사진으로 채워 최대 4장.
 * recordIds는 호출부가 최신순으로 넘긴다 (useRecords가 date desc 정렬).
 */
function useRecapPhotos(recordIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ['recap-photos', ...recordIds.slice().sort()],
    enabled: enabled && recordIds.length > 0 && supabase !== null && !isMock(),
    staleTime: 60_000,
    queryFn: async (): Promise<{ urls: string[]; total: number }> => {
      if (!supabase) return { urls: [], total: 0 };
      const { data, error } = await supabase
        .from('record_photos')
        .select('record_id, storage_path, seq')
        .in('record_id', recordIds)
        .order('seq');
      if (error) throw error;
      const byRecord = new Map<string, string[]>();
      for (const row of data as { record_id: string; storage_path: string }[]) {
        const list = byRecord.get(row.record_id) ?? [];
        list.push(row.storage_path);
        byRecord.set(row.record_id, list);
      }
      const picks: string[] = [];
      for (const id of recordIds) {
        const first = byRecord.get(id)?.[0];
        if (first) picks.push(first);
        if (picks.length === 4) break;
      }
      if (picks.length < 4) {
        const rest = recordIds.flatMap((id) => (byRecord.get(id) ?? []).slice(1));
        picks.push(...rest.slice(0, 4 - picks.length));
      }
      if (picks.length === 0) return { urls: [], total: data.length };
      const { data: signed, error: signError } = await supabase.storage
        .from('photos')
        .createSignedUrls(picks, 3600);
      if (signError) throw signError;
      return {
        urls: signed.map((s) => s.signedUrl).filter((u): u is string => Boolean(u)),
        total: data.length,
      };
    },
  });
}

interface Props {
  open: boolean;
  onClose: () => void;
  coupleId?: string;
}

/**
 * 종합 카드 시트 — 여러 기록을 한 장으로 (이달의 우리 ↔ 지금까지 토글 + 월 이동).
 * 데이트 기록(다녀왔어요)만 집계하고, 지출은 카드에 담지 않는다.
 */
export default function RecapCardSheet({ open, onClose, coupleId }: Props) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const [scope, setScope] = useState<Scope>('month');
  const [theme, setTheme] = useState<ShareTheme>('paper');
  // 문구 초안: 건드리기 전(null)엔 그 범위의 최근 기록 메모를 프리필 (사용자 요청 2026-07-23)
  const [captionDraft, setCaptionDraft] = useState<string | null>(null);
  const [view, setView] = useState({ year: thisYear, month: thisMonth });
  const isCurrentMonth = view.year === thisYear && view.month === thisMonth;

  const { data: records = [] } = useRecords();
  const visited = records.filter((r) => r.status === 'visited');
  const monthKey = `${view.year}-${String(view.month).padStart(2, '0')}`;
  const monthRecords = visited.filter((r) => r.date.startsWith(monthKey));
  const target = scope === 'month' ? monthRecords : visited;

  // 이전에 남긴 메모 중 최신 것을 문구로 프리필 — 입력하면 입력값이 우선
  const latestMemo = target.find((r) => r.memo)?.memo ?? '';
  const caption = captionDraft ?? latestMemo;
  // 입력이 멈춘 뒤에만 카드에 반영 (매 타건 재렌더 방지)
  const [appliedCaption, setAppliedCaption] = useState(caption);
  useEffect(() => {
    const t = setTimeout(() => setAppliedCaption(caption), 450);
    return () => clearTimeout(t);
  }, [caption]);

  const namesQuery = useSigunguNames(open);
  const sigunguNames = namesQuery.data ?? {};
  const conquest = useConquest();
  const grassQuery = useGrass(coupleId, view.year, view.month);
  const photosQuery = useRecapPhotos(
    target.map((r) => r.id),
    open,
  );
  const photoUrls = photosQuery.data?.urls ?? [];
  const photoTotal = photosQuery.data?.total ?? photoUrls.length;

  // 이 달에 처음 칠한 동네: 코드별 최초 방문일이 이 달인 것
  const firstVisit = new Map<string, string>();
  for (const r of visited) {
    for (const s of r.spots) {
      if (!s.sigungu_code) continue;
      const prev = firstVisit.get(s.sigungu_code);
      if (!prev || r.date < prev) firstVisit.set(s.sigungu_code, r.date);
    }
  }
  const newCodes = [...firstVisit.entries()].filter(([, d]) => d.startsWith(monthKey));
  const bothDays = (grassQuery.data ?? []).filter((g) => g.level === 'both').length;
  const totalSpots = visited.reduce((n, r) => n + r.spots.length, 0);

  const codes = [
    ...new Set(
      target.flatMap((r) => r.spots.map((s) => s.sigungu_code)).filter((c): c is string => c !== null),
    ),
  ];
  const regionNames = codes.map((c) => sigunguNames[c]).filter((n): n is string => Boolean(n));

  // 문구를 넣으면 하단 한 줄을 대체, 비우면 기본 문구 유지
  const typed = appliedCaption.trim();
  const card: RecapCardData =
    scope === 'month'
      ? {
          theme,
          title: `${view.year}년 ${view.month}월의 우리`,
          stats: [
            { value: `${monthRecords.length}번`, label: '데이트' },
            { value: `${newCodes.length}곳`, label: '새로 칠한 동네' },
            { value: `${bothDays}일`, label: '둘 다 남긴 날' },
          ],
          regionNames,
          photoUrls,
          photoTotal,
          footer: typed || null,
        }
      : {
          theme,
          title: '지금까지의 우리',
          stats: [
            { value: `${visited.length}번`, label: '데이트' },
            { value: `${totalSpots}곳`, label: '콕 찍은 스팟' },
            { value: `${(conquest.ratio * 100).toFixed(1)}%`, label: '대한민국 정복' },
          ],
          regionNames,
          photoUrls,
          photoTotal,
          footer: typed || `대한민국 ${conquest.visitedCount}/${conquest.totalCount} 지역에 우리 발자국`,
        };

  const empty = target.length === 0;
  const loading = photosQuery.isFetching || grassQuery.isFetching || namesQuery.isFetching;
  // 범위·월·데이터가 바뀌면 새로 그린다 (CardPreview는 마운트 시 1회만 그리므로 key로 제어)
  const cardKey = `${theme}-${scope}-${monthKey}-${photoUrls.length}-${bothDays}-${regionNames.length}-${typed}`;

  const goPrev = () =>
    setView((v) => (v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 }));
  const goNext = () => {
    if (isCurrentMonth) return;
    setView((v) => (v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 }));
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="종합 카드">
      <div className="space-y-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex rounded-full border border-ink/15 bg-white/60 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setScope('month')}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 ${scope === 'month' ? 'bg-ink text-paper' : 'opacity-60'}`}
            >
              이번 달
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 ${scope === 'all' ? 'bg-ink text-paper' : 'opacity-60'}`}
            >
              지금까지
            </button>
          </div>
          {scope === 'month' && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                aria-label="이전 달"
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs opacity-60 active:bg-ink/10"
              >
                ◀
              </button>
              <p className="min-w-[5.5rem] text-center text-sm font-semibold">
                {view.year}년 {view.month}월
              </p>
              <button
                type="button"
                onClick={goNext}
                disabled={isCurrentMonth}
                aria-label="다음 달"
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs opacity-60 active:bg-ink/10 disabled:opacity-20"
              >
                ▶
              </button>
            </div>
          )}
        </div>

        {!empty && (
          <>
            <ThemePicker theme={theme} onPick={setTheme} />
            <CaptionField value={caption} onChange={setCaptionDraft} placeholder="한마디 남기기 (선택)" />
          </>
        )}

        {empty ? (
          <div className="space-y-1 py-10 text-center">
            <p className="text-3xl" aria-hidden>🖍️</p>
            <p className="break-keep text-sm opacity-60">
              {scope === 'month'
                ? '이 달엔 다녀온 기록이 없어요 — 다른 달을 볼까요?'
                : '아직 다녀온 기록이 없어요 — 첫 데이트를 콕 찍어 볼까요?'}
            </p>
          </div>
        ) : loading ? (
          <p className="py-10 text-center text-sm opacity-50">카드를 그리는 중…</p>
        ) : (
          <CardPreview
            key={cardKey}
            fileName={`dohwaji-recap-${scope === 'month' ? monthKey : 'all'}.png`}
            paint={(canvas) => paintRecapCard(canvas, card)}
          />
        )}
      </div>
    </BottomSheet>
  );
}
