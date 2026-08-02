import { PALETTES } from './palettes';
import { BASE_H, BASE_W, SHARE_SIZES } from './sizes';
import type { CardSize, Painter, ShareRatio, ShareTheme } from './types';

const FALLBACK = '-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

/**
 * 캔버스를 비율에 맞게 잡고, 좌표 변환기를 붙여 돌려준다.
 *
 * 레이아웃은 언제나 1080×1350 좌표로 쓴다 — 여기서 실제 비율로 옮긴다.
 * 스토리처럼 위아래에 안전 영역이 있으면 내용은 그 안쪽으로 눌러 담는다.
 */
export function createPainter(
  canvas: HTMLCanvasElement,
  theme: ShareTheme | undefined,
  ratio: ShareRatio = 'feed',
  photoScale = 1,
): Painter {
  const size: CardSize = SHARE_SIZES[ratio] ?? SHARE_SIZES.feed;
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 미지원');

  const s = size.w / BASE_W;
  const contentH = size.h - size.safeTop - size.safeBottom;
  const vs = contentH / BASE_H;

  return {
    ctx,
    W: size.w,
    H: size.h,
    size,
    skin: PALETTES[theme ?? 'paper'] ?? PALETTES.paper,
    s,
    photoScale: Math.min(1.4, Math.max(0.6, photoScale)),
    x: (v) => v * s,
    y: (v) => size.safeTop + v * vs,
    vh: (v) => v * vs,
    top: size.safeTop,
    bottom: size.h - size.safeBottom,
    font: (family, fontSize, weight = 400) =>
      `${weight} ${Math.round(fontSize * s)}px "${family}", ${FALLBACK}`,
    emoji: (fontSize) => `400 ${Math.round(fontSize * s)}px ${FALLBACK}`,
  };
}
