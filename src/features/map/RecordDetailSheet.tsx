import { useState } from 'react';
import {
  paintFilmStripCard,
  paintFullBleedCard,
  paintMagazineCard,
  paintMapCard,
  paintPolaroidCard,
  paintRecordCard,
  paintTicketCard,
} from '../../shared/lib/shareCard';
import { ddayFrom } from '../../shared/lib/share/stickers';
import { useSession } from '../../shared/lib/auth';
import { useCoupleState } from '../couple/useCoupleState';
import BottomSheet from '../../shared/ui/BottomSheet';
import PhotoViewer from '../../shared/ui/PhotoViewer';
import ShareCardSheet, { type ShareOptions } from '../../shared/ui/ShareCardSheet';
import { useConquest } from './useConquest';
import { useSigunguNames } from './useSigunguNames';
import {
  categoryLabel,
  useCoupleMembers,
  useDeleteRecord,
  useMarkVisited,
  useRecordPhotos,
  useRecords,
  type RecordPhoto,
  type RecordRow,
  type SpotRow,
} from './useRecords';

/** 스팟 태그별 사진 그룹핑 (plan-multi-region B안) — 태그가 하나도 없으면 헤더 없이 평평하게.
 *  상세에서는 보기 전용 — 사진 지우기는 '수정하기'를 눌러 작성 시트에서만 (사용자 요청 2026-07-23). */
function PhotoGroups({
  photos,
  spots,
  onView,
}: {
  photos: RecordPhoto[];
  spots: SpotRow[];
  /** 사진 탭 → 크게 보기 */
  onView: (url: string) => void;
}) {
  const grid = (list: RecordPhoto[]) => (
    <div className="grid grid-cols-3 gap-1.5">
      {list.map(
        (p) =>
          p.signedUrl && (
            <button
              key={p.id}
              type="button"
              aria-label="사진 크게 보기"
              onClick={() => onView(p.signedUrl as string)}
              className="block w-full"
            >
              <img
                src={p.signedUrl}
                alt="데이트 사진"
                loading="lazy"
                className="aspect-square w-full rounded-xl rounded-tl-sm border border-ink/10 object-cover"
              />
            </button>
          ),
      )}
    </div>
  );

  const hasTag = photos.some((p) => p.spot_id !== null);
  if (!hasTag) return grid(photos);

  const untagged = photos.filter((p) => p.spot_id === null);
  return (
    <div className="space-y-3">
      {spots.map((s, i) => {
        const group = photos.filter((p) => p.spot_id === s.id);
        if (group.length === 0) return null;
        return (
          <div key={s.id} className="space-y-1.5">
            <p className="text-xs font-semibold opacity-60">
              <span className="text-pink">{i + 1}</span> {s.name}
            </p>
            {grid(group)}
          </div>
        );
      })}
      {untagged.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold opacity-60">함께한 순간</p>
          {grid(untagged)}
        </div>
      )}
    </div>
  );
}

interface Props {
  /** 보여줄 기록 id — null이면 닫힘 */
  recordId: string | null;
  onClose: () => void;
  /** 수정 플로우 — 상세를 닫고 RecordSheet를 editRecord로 여는 건 부모(MapScreen) 몫 */
  onEdit?: (record: RecordRow) => void;
}

/**
 * 기록 상세 바텀시트 (IA: 새 화면 금지 — 레이어로만 확장).
 * 지도 핀 탭·타임라인 카드 탭이 같은 시트를 연다.
 * 회색 핀(가고 싶어요)은 여기서 '다녀왔어요'로 전환한다 (명세 §3.1).
 */
export default function RecordDetailSheet({ recordId, onClose, onEdit }: Props) {
  // 기록은 ['records'] 캐시에서 id로 찾는다 — 전환·수정 후 리페치가 시트에 바로 반영된다.
  const { data: records = [] } = useRecords();
  const record = recordId !== null ? (records.find((r) => r.id === recordId) ?? null) : null;
  const photos = useRecordPhotos(record?.id).data ?? [];
  const members = useCoupleMembers();
  const markVisited = useMarkVisited();
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // 공유 카드 지역 칩용 코드→이름 — 상세가 열려 있을 때만 GeoJSON을 가져온다
  const sigunguNames = useSigunguNames(record !== null).data ?? {};
  // 지도 카드는 커플의 정복 현황 위에 이 날의 코스를 얹는다
  const conquest = useConquest();
  // 스티커(D+n)용 커플 시작일
  const { session } = useSession();
  const startedAt = useCoupleState(session?.user.id).data?.couple?.started_at ?? null;

  const close = () => {
    markVisited.reset();
    setShareOpen(false);
    onClose();
  };

  const payerLabel = (paidBy: string | null) =>
    paidBy === null ? '함께' : (members.data?.find((m) => m.user_id === paidBy)?.nickname ?? '짝꿍');

  const spots = record ? record.spots.slice().sort((a, b) => a.seq - b.seq) : [];
  const total = record ? record.expenses.reduce((sum, e) => sum + e.amount, 0) : 0;
  // 공유 카드 데이터 — 사진·지역명이 늦게 로드돼도 contentKey로 다시 그린다
  const sharePhotoUrls = photos.map((p) => p.signedUrl).filter((u): u is string => Boolean(u));
  // 지도 카드용 핀 — 좌표가 있는 스팟만 (검색 없이 이름만 적은 스팟은 지도에 못 찍는다)
  const mapPins = spots
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => ({ lng: s.lng as number, lat: s.lat as number, label: s.name }));
  // 이 동네가 몇 번째인지 — 같은 시군구를 다녀온 기록을 날짜순으로 세어 순번을 매긴다
  const primaryCode = spots.find((s) => s.sigungu_code)?.sigungu_code ?? null;
  const sameRegion = primaryCode
    ? records
        .filter((r) => r.status === 'visited' && r.spots.some((s) => s.sigungu_code === primaryCode))
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const ordinal = record ? sameRegion.findIndex((r) => r.id === record.id) + 1 : 0;
  const shareStickers = {
    dday: record ? ddayFrom(startedAt, record.date) : null,
    conquest: conquest.ratio,
    revisit: ordinal >= 2 ? ordinal : null,
    firstVisit: ordinal === 1,
  };
  const shareRegionNames = [
    ...new Set(
      spots
        .map((s) => s.sigungu_code)
        .filter((c): c is string => c !== null)
        .map((c) => sigunguNames[c])
        .filter((n): n is string => Boolean(n)),
    ),
  ];

  return (
    <BottomSheet open={record !== null} onClose={close}>
      {record && (
        <div className="space-y-5 pb-2">
          {/* pr-10: BottomSheet의 sticky ✕가 첫 줄까지 내려오므로 겹침 방지 여유 */}
          <div className="flex items-center gap-2 pr-10">
            <h2 className="text-lg font-bold">{record.date}</h2>
            {record.status === 'planned' && (
              <span className="rounded-full border-2 border-dashed border-ink/30 px-2.5 py-0.5 text-xs font-semibold opacity-70">
                가고 싶은 곳
              </span>
            )}
          </div>

          <ol className="space-y-1.5">
            {spots.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-xl rounded-tl-sm border border-ink/10 bg-white/70 px-3 py-2 text-sm"
              >
                <span className="font-bold text-pink">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
              </li>
            ))}
          </ol>

          {record.memo && <p className="break-words text-sm leading-relaxed opacity-70">{record.memo}</p>}

          {photos.length > 0 && (
            <PhotoGroups photos={photos} spots={spots} onView={setViewerUrl} />
          )}

          {record.expenses.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-sm font-semibold">지출</span>
              <ul className="space-y-1.5">
                {record.expenses.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-2 rounded-xl rounded-tl-sm border border-ink/10 bg-white/70 px-3 py-2 text-sm"
                  >
                    <span className="max-w-24 truncate rounded-full bg-yellow/40 px-2 py-0.5 text-xs">
                      {categoryLabel(e.category)}
                    </span>
                    <span className="flex-1">{e.amount.toLocaleString()}원</span>
                    <span className="text-xs opacity-60">{payerLabel(e.paid_by)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-right text-sm">
                모두 <b>{total.toLocaleString()}원</b>
              </p>
            </div>
          )}

          {record.status === 'planned' && (
            <div className="space-y-2">
              {markVisited.isError && (
                <p className="text-sm text-pink">바꾸는 데 문제가 생겼어요. 다시 한 번 해 주세요.</p>
              )}
              <button
                type="button"
                onClick={() => markVisited.mutate(record.id)}
                disabled={markVisited.isPending}
                className="w-full rounded-2xl rounded-tl-md bg-pink px-6 py-3.5 text-base font-bold text-white shadow-sm active:translate-y-px disabled:opacity-40"
              >
                {markVisited.isPending ? '색칠하는 중…' : '다녀왔어요로 바꾸기'}
              </button>
              <p className="break-keep text-center text-xs opacity-50">
                지도에 콕 — 이 동네가 우리 색으로 칠해져요
              </p>
            </div>
          )}

          {/* 공유 카드 — 다녀온 기록만 (소장·인스타용, 지출은 카드에서 자동 제외) */}
          {record.status === 'visited' && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="w-full rounded-2xl rounded-tr-md border-2 border-ink/15 bg-white/70 py-3 text-sm font-bold active:translate-y-px"
            >
              📤 공유 카드 만들기
            </button>
          )}

          {/* 수정·지우기 — 기록이 바뀌면(key) 확인 상태도 초기화.
              key는 형제와 겹치면 안 됨(겹치면 React 재조정이 꼬여 중복 렌더) → 접두사로 구분 */}
          <EditEraseActions key={`edit-${record.id}`} record={record} onEdit={onEdit} onDeleted={close} />

          <ShareCardSheet
            key={`share-${record.id}`}
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            fileName={`dohwaji-${record.date}.png`}
            defaultCaption={record.memo ?? ''}
            captionPlaceholder="한마디 남기기 (선택)"
            contentKey={`${sharePhotoUrls.length}-${shareRegionNames.length}-${mapPins.length}`}
            styles={[
              {
                key: 'photo',
                label: '사진 카드',
                paint: (canvas, { theme, ratio, caption }) =>
                  paintRecordCard(canvas, {
                    theme,
                    ratio,
                    date: record.date,
                    spotNames: spots.map((s) => s.name),
                    memo: caption,
                    regionNames: shareRegionNames,
                    photoUrls: sharePhotoUrls,
                    stickers: shareStickers,
                  }),
              },
              // 사진 한 장을 크게 쓰는 두 장 — 사진이 있을 때만 고를 수 있다
              ...(sharePhotoUrls.length > 0
                ? [
                    {
                      key: 'fullbleed',
                      label: '사진 가득',
                      paint: (canvas: HTMLCanvasElement, o: ShareOptions) =>
                        paintFullBleedCard(canvas, {
                          theme: o.theme,
                          ratio: o.ratio,
                          date: record.date,
                          title: spots[0]?.name ?? null,
                          subtitle: spots.map((s) => s.name).join('  →  '),
                          caption: o.caption,
                          regionNames: shareRegionNames,
                          photoUrls: sharePhotoUrls,
                          stickers: shareStickers,
                        }),
                    },
                    {
                      key: 'polaroid',
                      label: '폴라로이드',
                      paint: (canvas: HTMLCanvasElement, o: ShareOptions) =>
                        paintPolaroidCard(canvas, {
                          theme: o.theme,
                          ratio: o.ratio,
                          date: record.date,
                          subtitle: spots.map((s) => s.name).join('  →  '),
                          caption: o.caption,
                          regionNames: shareRegionNames,
                          photoUrls: sharePhotoUrls,
                          stickers: shareStickers,
                        }),
                    },
                  ]
                : []),
              ...(sharePhotoUrls.length >= 2
                ? [
                    {
                      key: 'film',
                      label: '필름',
                      paint: (canvas: HTMLCanvasElement, o: ShareOptions) =>
                        paintFilmStripCard(canvas, {
                          theme: o.theme,
                          ratio: o.ratio,
                          date: record.date,
                          subtitle: spots.map((s) => s.name).join('  →  '),
                          caption: o.caption,
                          regionNames: shareRegionNames,
                          photoUrls: sharePhotoUrls,
                          stickers: shareStickers,
                        }),
                    },
                  ]
                : []),
              {
                key: 'ticket',
                label: '티켓',
                paint: (canvas, { theme, ratio, caption }) =>
                  paintTicketCard(canvas, {
                    theme,
                    ratio,
                    date: record.date,
                    spotNames: spots.map((s) => s.name),
                    caption,
                    regionNames: shareRegionNames,
                    photoUrls: sharePhotoUrls,
                    stickers: shareStickers,
                  }),
              },
              {
                key: 'magazine',
                label: '매거진',
                paint: (canvas, { theme, ratio, caption }) =>
                  paintMagazineCard(canvas, {
                    theme,
                    ratio,
                    date: record.date,
                    title: spots[0]?.name ?? null,
                    subtitle: spots.map((s) => s.name).join('  →  '),
                    caption,
                    regionNames: shareRegionNames,
                    photoUrls: sharePhotoUrls,
                    stickers: shareStickers,
                  }),
              },
              {
                key: 'map',
                label: '지도 카드',
                paint: (canvas, { theme, ratio, caption }) =>
                  paintMapCard(canvas, {
                    theme,
                    ratio,
                    title: record.date.replace(/-/g, '. '),
                    subtitle: spots.map((s) => s.name).join('  →  '),
                    visitCounts: conquest.visitCounts,
                    pins: mapPins,
                    focus: 'pins',
                    regionNames: shareRegionNames,
                    stickers: shareStickers,
                    caption,
                  }),
              },
            ]}
          />
        </div>
      )}
      <PhotoViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />
    </BottomSheet>
  );
}

/** 하단 수정/지우기 액션 — 지우기는 1탭 후 인라인 확인(지우개 컨셉, 경고색 없이 차분하게) */
function EditEraseActions({
  record,
  onEdit,
  onDeleted,
}: {
  record: RecordRow;
  onEdit?: (record: RecordRow) => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const deleteRecord = useDeleteRecord();

  if (!confirming) {
    return (
      <div className="flex gap-2">
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(record)}
            className="flex-1 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 py-3 text-sm font-bold active:translate-y-px"
          >
            ✏️ 수정하기
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex-1 rounded-2xl rounded-br-md border-2 border-ink/15 bg-white/70 py-3 text-sm font-bold opacity-70 active:translate-y-px"
        >
          지우개로 지우기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl rounded-br-md border-2 border-dashed border-ink/25 bg-white/50 p-3">
      <p className="text-center text-sm font-semibold">정말 지울까요? 사진·지출도 함께 사라져요</p>
      {deleteRecord.isError && (
        <p className="text-center text-sm text-pink">지우다가 문제가 생겼어요. 다시 한 번 해 주세요.</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={deleteRecord.isPending}
          className="flex-1 rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 py-2.5 text-sm font-bold active:translate-y-px disabled:opacity-40"
        >
          그대로 둘래요
        </button>
        <button
          type="button"
          onClick={() => deleteRecord.mutate(record.id, { onSuccess: onDeleted })}
          disabled={deleteRecord.isPending}
          className="flex-1 rounded-2xl rounded-br-md bg-ink py-2.5 text-sm font-bold text-paper active:translate-y-px disabled:opacity-40"
        >
          {deleteRecord.isPending ? '지우는 중…' : '지우개로 지우기'}
        </button>
      </div>
    </div>
  );
}
