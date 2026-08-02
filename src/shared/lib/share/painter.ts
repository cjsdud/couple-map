import { PALETTES } from './palettes';
import { BASE_W, SHARE_SIZES } from './sizes';
import type { CardSize, Painter, PhotoHit, ShareRatio, ShareTheme } from './types';

const FALLBACK = '-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

/** 캔버스 → 이번 그리기의 사진 자리들. 미리보기가 제스처 판정에 쓴다 */
const hitsByCanvas = new WeakMap<HTMLCanvasElement, PhotoHit[]>();

/** 마지막으로 그린 카드에서 사진들이 앉은 자리 (실제 픽셀) */
export function photoHitsOf(canvas: HTMLCanvasElement): PhotoHit[] {
  return hitsByCanvas.get(canvas) ?? [];
}

/**
 * 캔버스를 비율에 맞게 잡고, 좌표 변환기를 붙여 돌려준다.
 *
 * 레이아웃은 언제나 가로 1080 기준 좌표로 쓴다 — 세로를 비율마다 눌러 담지 않는다
 * (사진이 납작해진다). 대신 내용 높이 `LH`가 비율마다 달라지고,
 * 레이아웃이 그 차이를 사진 같은 유연한 영역으로 흡수한다.
 */
export function createPainter(
  canvas: HTMLCanvasElement,
  theme: ShareTheme | undefined,
  ratio: ShareRatio = 'feed',
): Painter {
  const size: CardSize = SHARE_SIZES[ratio] ?? SHARE_SIZES.feed;
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 미지원');

  const s = size.w / BASE_W;
  const hits: PhotoHit[] = [];
  hitsByCanvas.set(canvas, hits);

  return {
    ctx,
    W: size.w,
    H: size.h,
    size,
    skin: PALETTES[theme ?? 'paper'] ?? PALETTES.paper,
    s,
    LH: (size.h - size.safeTop - size.safeBottom) / s,
    x: (v) => v * s,
    y: (v) => size.safeTop + v * s,
    vh: (v) => v * s,
    top: size.safeTop,
    bottom: size.h - size.safeBottom,
    font: (family, fontSize, weight = 400) =>
      `${weight} ${Math.round(fontSize * s)}px "${family}", ${FALLBACK}`,
    emoji: (fontSize) => `400 ${Math.round(fontSize * s)}px ${FALLBACK}`,
    hits,
  };
}
