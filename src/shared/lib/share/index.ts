/**
 * 공유 카드 렌더 엔진 — 공개 입구 (명세 §7 바이럴 설계).
 *
 * 인스타 규격 카드 생성기. 팔레트(색·폰트·질감) / 레이아웃(배치) / 장식이 분리돼 있고,
 * 화면에는 이 조합을 "스타일" 프리셋 하나로만 노출한다 (docs/share-card-v2-plan.md).
 * 원칙: 지출은 카드에서 자동 제외 (명세 §4 공유 격리).
 */
export { SHARE_THEMES } from './palettes';
export { SHARE_RATIOS, SHARE_SIZES, BASE_W, BASE_H } from './sizes';
export type { CardSize, Painter, ShareRatio, ShareTheme, Skin } from './types';
export {
  paintDayCard,
  paintRecapCard,
  paintRecordCard,
  type DayCardData,
  type RecapCardData,
  type RecordCardData,
} from './layouts/classic';
export { paintMapCard, type MapCardData } from './layouts/mapCard';
export { paintFullBleedCard, paintPolaroidCard, type PhotoCardData } from './layouts/photo';
export {
  paintFilmStripCard,
  paintMagazineCard,
  paintTicketCard,
  type ExtraCardData,
} from './layouts/extra';
export { ddayFrom, type CardStickers } from './stickers';
export type { MapPin } from './mapPaint';

/** 카드 → PNG Blob */
export function cardToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 생성 실패'))), 'image/png');
  });
}
