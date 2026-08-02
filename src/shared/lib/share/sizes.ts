import type { CardSize, ShareRatio } from './types';

/**
 * 비율 3종 (계획 §6).
 * 스토리는 위·아래에 인스타 UI(프로필·답장창)가 겹치므로 그 안쪽에만 내용을 둔다.
 * 세로를 눌러 담지 않으므로 내용 높이가 비율마다 다르다 —
 * 세로 1350 · 정사각 1080 · 스토리 1480. 레이아웃이 Painter.LH로 이 차이를 흡수한다.
 */
export const SHARE_SIZES: Record<ShareRatio, CardSize> = {
  feed: {
    key: 'feed',
    label: '세로',
    hint: '4:5',
    note: '인스타 세로 규격(4:5)이에요 · 가장 크게 보여요',
    w: 1080,
    h: 1350,
    safeTop: 0,
    safeBottom: 0,
  },
  square: {
    key: 'square',
    label: '정사각',
    hint: '1:1',
    note: '정사각(1:1)이에요 · 여러 장 올릴 때 좋아요',
    w: 1080,
    h: 1080,
    safeTop: 0,
    safeBottom: 0,
  },
  story: {
    key: 'story',
    label: '스토리',
    hint: '9:16',
    note: '스토리 규격(9:16)이에요 · 위아래는 화면에 가려지지 않게 비워 뒀어요',
    w: 1080,
    h: 1920,
    safeTop: 180,
    safeBottom: 260,
  },
};

export const SHARE_RATIOS: CardSize[] = [SHARE_SIZES.feed, SHARE_SIZES.square, SHARE_SIZES.story];

/** 레이아웃이 좌표를 쓰는 기준 캔버스 */
export const BASE_W = 1080;
export const BASE_H = 1350;
