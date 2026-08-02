/**
 * 스티커·뱃지 (계획 §5) — 레이아웃이 어울리는 자리에 **자동으로** 붙인다.
 * 사용자가 켜고 끄거나 위치를 옮기지 않는다. 자유도를 낮춰 실패를 없애는 쪽.
 */
import { drawText, roundRect } from './draw';
import type { Painter } from './types';

export interface CardStickers {
  /** 사귄 지 며칠 — D+123 */
  dday?: number | null;
  /** 정복률 0~1 — '대한민국 6.5%' */
  conquest?: number | null;
  /** 같은 동네를 몇 번째로 갔는지 — 2 이상일 때만 붙는다 */
  revisit?: number | null;
  /** 이번에 처음 칠한 동네인가 */
  firstVisit?: boolean;
}

/** 붙일 스티커 문구를 우선순위대로 — 너무 많으면 지저분하니 최대 3개 */
export function stickerTexts(s: CardStickers | undefined, max = 3): string[] {
  if (!s) return [];
  const out: string[] = [];
  if (s.firstVisit) out.push('처음 칠한 동네');
  if (s.revisit && s.revisit >= 2) out.push(`×${s.revisit}번째`);
  if (typeof s.dday === 'number' && s.dday >= 0) out.push(`D+${s.dday}`);
  if (typeof s.conquest === 'number' && s.conquest > 0) {
    out.push(`대한민국 ${(s.conquest * 100).toFixed(1)}%`);
  }
  return out.slice(0, max);
}

/** 커플 시작일 → D+n (시작일이 1일차) */
export function ddayFrom(startedAt: string | null | undefined, today: string): number | null {
  if (!startedAt) return null;
  const a = Date.parse(`${startedAt}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.round((b - a) / 86400000);
  return days >= 0 ? days + 1 : null;
}

/** 알약 뱃지 한 개 — 실제 픽셀 기준, 그린 폭을 돌려준다 */
export function pill(
  p: Painter,
  text: string,
  x: number,
  y: number,
  opts: { align?: 'left' | 'right'; onDark?: boolean; size?: number } = {},
): number {
  const { ctx, skin } = p;
  const size = opts.size ?? 30;
  ctx.font = p.font(skin.body, size, 700);
  const w = ctx.measureText(text).width + p.x(44);
  const h = p.vh(size + 26);
  const left = opts.align === 'right' ? x - w : x;
  ctx.fillStyle = opts.onDark ? 'rgba(255,255,255,0.9)' : skin.badgeBg;
  roundRect(ctx, left, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = opts.onDark ? '#1b1815' : skin.badgeInk;
  ctx.textAlign = 'center';
  drawText(p, text, left + w / 2, y + p.vh(size * 0.35), w - p.x(16));
  ctx.textAlign = 'left';
  return w;
}

/** 세로로 쌓는 스티커 — 1080×1350 기준 좌표 */
export function stickerColumn(
  p: Painter,
  texts: string[],
  opts: { x: number; y: number; align?: 'left' | 'right'; onDark?: boolean; gap?: number },
) {
  const gap = opts.gap ?? 66;
  for (const [i, t] of texts.entries()) {
    pill(p, t, p.x(opts.x), p.y(opts.y + i * gap), { align: opts.align, onDark: opts.onDark });
  }
}

/** 가로로 늘어놓는 스티커 — 가운데 정렬 */
export function stickerRow(p: Painter, texts: string[], y: number, onDark = false) {
  if (texts.length === 0) return;
  const { ctx, skin } = p;
  ctx.font = p.font(skin.body, 30, 700);
  const widths = texts.map((t) => ctx.measureText(t).width + p.x(44));
  const gap = p.x(14);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (texts.length - 1);
  let x = p.W / 2 - total / 2;
  for (const [i, t] of texts.entries()) {
    pill(p, t, x, p.y(y), { onDark });
    x += widths[i] + gap;
  }
}

/**
 * 고무도장 — 사진 위에 비스듬히 찍는다 (재방문·처음 방문처럼 '사건'을 알릴 때).
 * 실제 픽셀 좌표를 받는다 (사진 안쪽에 찍히므로 호출부가 이미 변환한 자리를 준다).
 */
export function rubberStamp(
  p: Painter,
  text: string,
  x: number,
  y: number,
  opts: { deg?: number; anchor?: 'center' | 'right' } = {},
) {
  const { ctx, skin } = p;
  const color = skin.accentFor('#e8637c');
  ctx.font = p.font(skin.title, 34, 700);
  const w = ctx.measureText(text).width + p.x(52);
  const h = p.vh(76);
  // 오른쪽 정렬이면 도장 전체가 안쪽으로 들어오게 반 폭만큼 당긴다 (사진 밖으로 삐져나감 방지)
  const cx = opts.anchor === 'right' ? x - w / 2 : x;
  ctx.save();
  ctx.translate(cx, y);
  ctx.rotate(((opts.deg ?? -12) * Math.PI) / 180);
  ctx.font = p.font(skin.title, 34, 700);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4 * p.s;
  roundRect(ctx, -w / 2, -h / 2, w, h, 10 * p.s);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, 0, p.vh(12), w - p.x(20));
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.restore();
}

/** 필름 날짜각인 — 오른쪽 아래, 주황 형광 (풀블리드·필름 톤에서 진가) */
export function filmDateStamp(p: Painter, date: string, x: number, y: number) {
  const { ctx } = p;
  ctx.save();
  ctx.font = p.font(p.skin.title, 36, 700);
  ctx.textAlign = 'right';
  ctx.shadowColor = 'rgba(255,150,40,0.75)';
  ctx.shadowBlur = 16 * p.s;
  ctx.fillStyle = '#ffb648';
  drawText(p, date.replace(/-/g, ' '), p.x(x), p.y(y), p.x(400));
  ctx.restore();
  ctx.textAlign = 'left';
}
