import type { CardSize, ShareRatio } from './types';

/**
 * 비율 3종 (계획 §6).
 * 스토리는 상단 250·하단 340px에 인스타 UI가 겹치므로 그 안쪽에만 내용을 둔다.
 * 남는 내용 영역(1080×1330)이 피드(1080×1350)와 거의 같아 레이아웃을 그대로 쓸 수 있다.
 */
export const SHARE_SIZES: Record<ShareRatio, CardSize> = {
  feed: { key: 'feed', label: '세로', hint: '4:5', w: 1080, h: 1350, safeTop: 0, safeBottom: 0 },
  square: { key: 'square', label: '정사각', hint: '1:1', w: 1080, h: 1080, safeTop: 0, safeBottom: 0 },
  story: { key: 'story', label: '스토리', hint: '9:16', w: 1080, h: 1920, safeTop: 250, safeBottom: 340 },
};

export const SHARE_RATIOS: CardSize[] = [SHARE_SIZES.feed, SHARE_SIZES.square, SHARE_SIZES.story];

/** 레이아웃이 좌표를 쓰는 기준 캔버스 */
export const BASE_W = 1080;
export const BASE_H = 1350;
