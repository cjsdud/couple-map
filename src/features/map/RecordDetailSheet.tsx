import BottomSheet from '../../shared/ui/BottomSheet';
import {
  CATEGORY_LABEL,
  useCoupleMembers,
  useMarkVisited,
  useRecordPhotos,
  useRecords,
  type RecordPhoto,
  type SpotRow,
} from './useRecords';

/** 스팟 태그별 사진 그룹핑 (plan-multi-region B안) — 태그가 하나도 없으면 헤더 없이 평평하게 */
function PhotoGroups({ photos, spots }: { photos: RecordPhoto[]; spots: SpotRow[] }) {
  const grid = (list: RecordPhoto[]) => (
    <div className="grid grid-cols-3 gap-1.5">
      {list.map(
        (p) =>
          p.signedUrl && (
            <img
              key={p.id}
              src={p.signedUrl}
              alt="데이트 사진"
              loading="lazy"
              className="aspect-square w-full rounded-xl rounded-tl-sm border border-ink/10 object-cover"
            />
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
}

/**
 * 기록 상세 바텀시트 (IA: 새 화면 금지 — 레이어로만 확장).
 * 지도 핀 탭·타임라인 카드 탭이 같은 시트를 연다.
 * 회색 핀(가고 싶어요)은 여기서 '다녀왔어요'로 전환한다 (명세 §3.1).
 */
export default function RecordDetailSheet({ recordId, onClose }: Props) {
  // 기록은 ['records'] 캐시에서 id로 찾는다 — 전환·수정 후 리페치가 시트에 바로 반영된다.
  const { data: records = [] } = useRecords();
  const record = recordId !== null ? (records.find((r) => r.id === recordId) ?? null) : null;
  const photos = useRecordPhotos(record?.id).data ?? [];
  const members = useCoupleMembers();
  const markVisited = useMarkVisited();

  const close = () => {
    markVisited.reset();
    onClose();
  };

  const payerLabel = (paidBy: string | null) =>
    paidBy === null ? '함께' : (members.data?.find((m) => m.user_id === paidBy)?.nickname ?? '짝꿍');

  const spots = record ? record.spots.slice().sort((a, b) => a.seq - b.seq) : [];
  const total = record ? record.expenses.reduce((sum, e) => sum + e.amount, 0) : 0;

  return (
    <BottomSheet open={record !== null} onClose={close}>
      {record && (
        <div className="space-y-5 pb-2">
          <div className="flex items-center gap-2">
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
                <span className="flex-1 truncate">{s.name}</span>
              </li>
            ))}
          </ol>

          {record.memo && <p className="text-sm leading-relaxed opacity-70">{record.memo}</p>}

          {photos.length > 0 && <PhotoGroups photos={photos} spots={spots} />}

          {record.expenses.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-sm font-semibold">지출</span>
              <ul className="space-y-1.5">
                {record.expenses.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-2 rounded-xl rounded-tl-sm border border-ink/10 bg-white/70 px-3 py-2 text-sm"
                  >
                    <span className="rounded-full bg-yellow/40 px-2 py-0.5 text-xs">
                      {CATEGORY_LABEL[e.category]}
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
                <p className="text-sm text-pink">바꾸다 문제가 있었어요. 다시 한 번 시도해 주세요.</p>
              )}
              <button
                type="button"
                onClick={() => markVisited.mutate(record.id)}
                disabled={markVisited.isPending}
                className="w-full rounded-2xl rounded-tl-md bg-pink px-6 py-3.5 text-base font-bold text-white shadow-sm active:translate-y-px disabled:opacity-40"
              >
                {markVisited.isPending ? '색칠하는 중…' : '다녀왔어요로 바꾸기'}
              </button>
              <p className="text-center text-xs opacity-50">
                지도에 콕 — 이 동네가 우리 색으로 칠해져요
              </p>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
