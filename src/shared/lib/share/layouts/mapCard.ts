/**
 * 지도 카드 — 우리만 만들 수 있는 한 장 (계획 §4-④).
 *
 * 칠해진 시군구 + 코스 선 + 핀을 그대로 이미지로 만든다.
 * "우리가 칠한 곳"이라는 이 앱의 정체성이 곧 카드가 된다.
 */
import { loadShareFonts } from '../../shareFonts';
import {
  fitLines,
  heartDoodle,
  paintGrain,
  paintHeaderDeco,
  paintRegionHashtags,
  paintWatermark,
  wrapText,
} from '../draw';
import { paintMap, type MapPin } from '../mapPaint';
import { createPainter } from '../painter';
import { stickerRow, stickerTexts, type CardStickers } from '../stickers';
import type { Painter, ShareRatio, ShareTheme } from '../types';

export interface MapCardData {
  theme?: ShareTheme;
  ratio?: ShareRatio;
  /** 큰 글씨 — 날짜(2026. 07. 25) 또는 '지금까지의 우리' */
  title: string;
  /** 작은 글씨 — 코스(안목해변 → 보헤미안) 또는 지역 요약 */
  subtitle?: string | null;
  /** 시군구 코드 → 방문 스팟 수 */
  visitCounts: Record<string, number>;
  pins: MapPin[];
  /** 하루 기록이면 'pins'(그 동네를 확대), 종합이면 'all'(전국) */
  focus: 'pins' | 'all';
  regionNames: string[];
  /** 지도 아래 뱃지 — '대한민국 6.5% 정복' 같은 한 줄 */
  badge?: string | null;
  /** 뱃지 옆에 함께 붙는 스티커 (계획 §5) */
  stickers?: CardStickers;
  caption?: string | null;
}

export async function paintMapCard(canvas: HTMLCanvasElement, data: MapCardData) {
  const p = createPainter(canvas, data.theme, data.ratio);
  const { ctx, skin } = p;
  const accent = skin.accentFor('#8cab68');
  await loadShareFonts();

  skin.paintBg(p);
  paintHeaderDeco(p, accent, -2.5);

  ctx.fillStyle = skin.ink;
  ctx.textAlign = 'center';
  const title = fitLines(p, data.title, {
    family: skin.title,
    size: 60,
    weight: 700,
    maxWidth: 900,
    maxLines: 1,
  });
  ctx.font = p.font(skin.title, title.size, 700);
  ctx.fillText(title.lines[0] ?? '', p.W / 2, p.y(222));

  let mapTop = 330;
  if (data.subtitle) {
    ctx.font = p.font(skin.body, 40, 600);
    ctx.globalAlpha = 0.85;
    const lines = wrapText(ctx, data.subtitle, p.x(880), 2);
    for (const [i, line] of lines.entries()) ctx.fillText(line, p.W / 2, p.y(292 + i * 50));
    ctx.globalAlpha = 1;
    mapTop = 292 + lines.length * 50 + 26;
  }

  const caption = data.caption?.trim();
  const badges = [data.badge?.trim(), ...stickerTexts(data.stickers, 2)].filter(
    (t): t is string => Boolean(t),
  );
  const badge = badges.length > 0;
  // 아래에서부터 자리를 빼 지도 높이를 정한다 — 아래 요소가 늘어도 겹치지 않게
  const bottom = 1350 - 96 - (data.regionNames.length ? 44 : 0) - (caption ? 74 : 0) - (badge ? 92 : 0);
  const box = { x: 60, y: mapTop, w: 960, h: Math.max(360, bottom - mapTop) };

  const drawn = await paintMap(p, box, {
    visitCounts: data.visitCounts,
    pins: data.pins,
    focus: data.focus,
    showNames: true,
  });
  if (!drawn) {
    // 지도를 못 받은 경우(오프라인 등) — 빈 칸 대신 낙서로 채운다
    heartDoodle(p, 540, box.y + box.h / 2, 300, accent);
  }

  let y = box.y + box.h + 56;
  if (badge) {
    stickerRow(p, badges, y);
    y += 74;
  }
  if (caption) {
    ctx.font = p.font(skin.body, 40, 500);
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.85;
    ctx.textAlign = 'center';
    const lines = wrapText(ctx, `“${caption}”`, p.x(880), 1);
    ctx.fillText(lines[0] ?? '', p.W / 2, p.y(y));
    ctx.globalAlpha = 1;
  }

  paintGrain(p);
  paintRegionHashtags(p, data.regionNames, accent);
  paintWatermark(p);
}

export type { Painter };
