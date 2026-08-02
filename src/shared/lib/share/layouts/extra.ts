/**
 * 나머지 레이아웃 3종 (계획 §4-③⑤⑥).
 *
 * - 필름 스트립: 사진 2~4장을 세로로 잇고 양옆에 스프로킷 홀. 하루를 여러 장으로 보여줄 때.
 * - 티켓: 절취선 있는 표 형태. 사진이 없어도 성립하는 유일한 새 레이아웃.
 * - 매거진: 큰 제목 + 사진 + 캡션. 메모가 좋은 날에 어울린다.
 */
import { loadShareFonts } from '../../shareFonts';
import {
  adjustAt,
  drawCover,
  drawText,
  type Drawable,
  fitLines,
  loadImage,
  paintGrain,
  roundRect,
  tintOver,
  toHashtags,
  tuned,
  wrapText,
} from '../draw';
import { createPainter } from '../painter';
import { stickerRow, stickerTexts, type CardStickers } from '../stickers';
import type { Painter, PhotoAdjust, PhotoAlign, ShareRatio, ShareTheme } from '../types';

export interface ExtraCardData {
  theme?: ShareTheme;
  ratio?: ShareRatio;
  /** 사진별 조정값 (크기·크롭 위치·기울기) — photoUrls와 같은 순서 */
  adjusts?: PhotoAdjust[];
  /** 사진 묶음이 카드 안에서 놓이는 자리 */
  photoAlign?: PhotoAlign;
  date: string;
  /** 코스 — 티켓의 표에 줄줄이 들어간다 */
  spotNames?: string[];
  title?: string | null;
  subtitle?: string | null;
  caption?: string | null;
  regionNames: string[];
  photoUrls: string[];
  stickers?: CardStickers;
}

const dotted = (date: string) => date.replace(/-/g, '. ');

// ── 필름 스트립 ──────────────────────────────────────────────────
export async function paintFilmStripCard(canvas: HTMLCanvasElement, data: ExtraCardData) {
  const p = createPainter(canvas, data.theme, data.ratio);
  const { ctx, skin } = p;
  await loadShareFonts();
  const images = (await Promise.all(data.photoUrls.slice(0, 4).map(loadImage))).filter(
    (i): i is Drawable => i !== null,
  );

  // 필름은 언제나 어둡다 — 테마가 밝아도 스트립 자체는 검은 띠여야 필름으로 보인다
  ctx.fillStyle = skin.dark ? '#100e0c' : '#1b1815';
  ctx.fillRect(0, 0, p.W, p.H);

  const stripX = 40;
  const stripW = 1000;
  const band = 64; // 스프로킷 홀이 뚫린 좌우 띠
  ctx.fillStyle = '#000000';
  ctx.fillRect(p.x(stripX), p.top, p.x(stripW), p.bottom - p.top);

  // 스프로킷 홀 — 위아래로 촘촘히
  const holeW = p.x(30);
  const holeH = p.vh(22);
  ctx.fillStyle = '#efe7d8';
  for (let y = 34; y < 1330; y += 52) {
    for (const cx of [stripX + band / 2, stripX + stripW - band / 2]) {
      roundRect(ctx, p.x(cx) - holeW / 2, p.y(y) - holeH / 2, holeW, holeH, 5 * p.s);
      ctx.fill();
    }
  }

  // 프레임 — 사진 수에 맞춰 높이를 나눈다
  const innerX = stripX + band + 16;
  const innerW = stripW - (band + 16) * 2;
  const count = Math.max(1, images.length);
  const top = 46;
  const bottomText = 168; // 아래 한 칸은 날짜·문구 자리
  const gap = 14;
  const frameH = (1350 - top - bottomText - gap * count) / count;
  for (const [i, img] of images.entries()) {
    const adj = adjustAt(data.adjusts, i);
    const fy = top + i * (frameH + gap);
    const x = p.x(innerX);
    const y = p.y(fy);
    const w = p.x(innerW);
    const h = p.vh(frameH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    drawCover(ctx, tuned(p, img), x, y, w, h, adj.focus);
    tintOver(p, x, y, w, h);
    ctx.restore();
  }

  paintGrain(p, Math.max(skin.grain, 0.35));

  // 아래 칸 — 필름 각인 톤으로 날짜·한마디
  const baseY = 1350 - bottomText + 62;
  ctx.textAlign = 'center';
  ctx.font = p.font(skin.title, 40, 700);
  ctx.fillStyle = '#ffb648';
  drawText(p, dotted(data.date), p.W / 2, p.y(baseY), p.x(820));
  const caption = data.caption?.trim() || data.subtitle?.trim();
  if (caption) {
    const fit = fitLines(p, caption, {
      family: skin.body,
      size: 36,
      weight: 500,
      maxWidth: 820,
      maxLines: 1,
    });
    ctx.fillStyle = '#efe7d8';
    ctx.globalAlpha = 0.85;
    drawText(p, fit.lines[0] ?? '', p.W / 2, p.y(baseY + 54), p.x(820));
    ctx.globalAlpha = 1;
  }
  ctx.font = p.font(skin.body, 26, 600);
  ctx.fillStyle = '#efe7d8';
  ctx.globalAlpha = 0.45;
  ctx.textAlign = 'right';
  drawText(p, '우리의 도화지 🖍️', p.x(1080 - 96), p.y(1350 - 24), p.x(300));
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ── 티켓 ─────────────────────────────────────────────────────────
export async function paintTicketCard(canvas: HTMLCanvasElement, data: ExtraCardData) {
  const p = createPainter(canvas, data.theme, data.ratio);
  const { ctx, skin } = p;
  const accent = skin.accentFor('#e8637c');
  await loadShareFonts();
  const img = await loadImage(data.photoUrls[0] ?? '');
  const adj = adjustAt(data.adjusts, 0);

  skin.paintBg(p);

  // 사진이 없으면 티켓을 짧게 잡고 가운데로 — 빈 칸이 크게 뜨지 않게
  const tx = 90;
  const tw = 900;
  const th = img ? 1070 : 820;
  const ty = img ? 140 : 265;

  ctx.save();
  ctx.shadowColor = 'rgba(20,16,12,0.24)';
  ctx.shadowBlur = 30 * p.s;
  ctx.shadowOffsetY = 12 * p.s;
  ctx.fillStyle = skin.frame.mat;
  roundRect(ctx, p.x(tx), p.y(ty), p.x(tw), p.vh(th), 22 * p.s);
  ctx.fill();
  ctx.restore();

  const ink = skin.dark ? '#f3ede3' : '#3b3733';

  // 위쪽: 사진 띠 (있으면) + 제목
  let cursor = ty + 96;
  if (img) {
    const ph = Math.round(300 * adj.scale);
    ctx.save();
    // 티켓 모서리를 따라 자른다 — 사각으로 자르면 위 모서리가 각져 카드 밖으로 튀어 보인다
    roundRect(ctx, p.x(tx), p.y(ty), p.x(tw), p.vh(th), 22 * p.s);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(p.x(tx), p.y(ty), p.x(tw), p.vh(ph));
    ctx.clip();
    drawCover(ctx, tuned(p, img), p.x(tx), p.y(ty), p.x(tw), p.vh(ph), adj.focus);
    tintOver(p, p.x(tx), p.y(ty), p.x(tw), p.vh(ph));
    ctx.restore();
    cursor = ty + ph + 92;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  ctx.font = p.font(skin.title, 56, 700);
  drawText(p, dotted(data.date), p.W / 2, p.y(cursor), p.x(tw - 80));
  cursor += 26;

  // 가운데: 코스 표 — 번호 + 이름
  const spots = (data.spotNames ?? []).slice(0, 5);
  // 절취선은 코스가 끝나는 자리 바로 아래 — 코스가 짧을 때 빈 칸이 뜨지 않게
  const tearY = Math.min(ty + th - 300, cursor + 62 + spots.length * 62 + 34);
  ctx.textAlign = 'left';
  for (const [i, name] of spots.entries()) {
    const y = cursor + 62 + i * 62;
    ctx.font = p.font(skin.title, 30, 700);
    ctx.fillStyle = accent;
    drawText(p, String(i + 1), p.x(tx + 56), p.y(y), p.x(46));
    ctx.font = p.font(skin.body, 38, 500);
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.9;
    const fit = fitLines(p, name, {
      family: skin.body,
      size: 38,
      weight: 500,
      maxWidth: 700,
      maxLines: 1,
    });
    ctx.font = p.font(skin.body, fit.size, 500);
    drawText(p, fit.lines[0] ?? '', p.x(tx + 110), p.y(y), p.x(tw - 166));
    ctx.globalAlpha = 1;
    // 점선 밑줄 — 표 느낌
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 2 * p.s;
    ctx.setLineDash([6 * p.s, 8 * p.s]);
    ctx.beginPath();
    ctx.moveTo(p.x(tx + 56), p.y(y + 20));
    ctx.lineTo(p.x(tx + tw - 56), p.y(y + 20));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // 절취선 + 좌우 반원 홈
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 3 * p.s;
  ctx.setLineDash([14 * p.s, 12 * p.s]);
  ctx.beginPath();
  ctx.moveTo(p.x(tx + 40), p.y(tearY));
  ctx.lineTo(p.x(tx + tw - 40), p.y(tearY));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // 좌우 홈 — 배경을 그 자리에만 다시 칠해 카드를 물어뜯은 모양을 만든다.
  //   (destination-out으로 파내면 PNG에 투명 구멍이 남아 인스타에서 검게 보인다)
  ctx.save();
  ctx.beginPath();
  for (const cx of [tx, tx + tw]) ctx.arc(p.x(cx), p.y(tearY), 26 * p.s, 0, Math.PI * 2);
  ctx.clip();
  skin.paintBg(p);
  ctx.restore();

  // 아래 스텁: 지역 + 한마디 + 스티커 — 절취선과 티켓 끝 사이에 세로 가운데로 모은다
  ctx.textAlign = 'center';
  const tags = toHashtags(data.regionNames);
  const caption = data.caption?.trim();
  const capFit = caption
    ? fitLines(p, `“${caption}”`, {
        family: skin.body,
        size: 36,
        weight: 500,
        maxWidth: 760,
        maxLines: 2,
      })
    : null;
  const chips = stickerTexts(data.stickers, 2);
  const blockH =
    (tags ? 56 : 0) + (capFit ? capFit.lines.length * 48 + 20 : 0) + (chips.length ? 86 : 0);
  let sy = (tearY + ty + th) / 2 - blockH / 2 + 30;
  if (tags) {
    ctx.font = p.font(skin.body, 34, 700);
    ctx.fillStyle = accent;
    drawText(p, wrapText(ctx, tags, p.x(tw - 80), 1)[0] ?? '', p.W / 2, p.y(sy), p.x(tw - 80));
    sy += 56;
  }
  if (capFit) {
    ctx.font = p.font(skin.body, capFit.size, 500);
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.85;
    for (const [i2, line] of capFit.lines.entries()) drawText(p, line, p.W / 2, p.y(sy + i2 * 48), p.x(tw - 80));
    ctx.globalAlpha = 1;
    sy += capFit.lines.length * 48 + 20;
  }
  if (chips.length) stickerRow(p, chips, sy + 34);

  paintGrain(p);
  ctx.font = p.font(skin.body, 30, 600);
  ctx.fillStyle = skin.ink;
  ctx.globalAlpha = 0.5;
  ctx.textAlign = 'right';
  drawText(p, '우리의 도화지 🖍️', p.x(1080 - 64), p.y(1286), p.x(320));
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ── 매거진 ───────────────────────────────────────────────────────
export async function paintMagazineCard(canvas: HTMLCanvasElement, data: ExtraCardData) {
  const p = createPainter(canvas, data.theme, data.ratio);
  const { ctx, skin } = p;
  const accent = skin.accentFor('#e8637c');
  await loadShareFonts();
  const img = await loadImage(data.photoUrls[0] ?? '');
  const adj = adjustAt(data.adjusts, 0);

  skin.paintBg(p);

  const m = 88; // 바깥 여백
  ctx.textAlign = 'left';

  // 머리글 — 날짜와 지역을 한 줄로, 그 아래 굵은 선
  ctx.font = p.font(skin.body, 30, 700);
  ctx.fillStyle = accent;
  const head = [dotted(data.date), data.regionNames[0]].filter(Boolean).join('   ·   ');
  drawText(p, head, p.x(m), p.y(140), p.x(1080 - m * 2));
  ctx.strokeStyle = skin.ink;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 4 * p.s;
  ctx.beginPath();
  ctx.moveTo(p.x(m), p.y(168));
  ctx.lineTo(p.x(1080 - m), p.y(168));
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 큰 제목 — 왼쪽 정렬 세리프
  const title = fitLines(p, data.title?.trim() || data.subtitle?.trim() || dotted(data.date), {
    family: skin.title,
    size: 82,
    min: 52,
    weight: 700,
    maxWidth: 1080 - m * 2,
    maxLines: 2,
  });
  ctx.font = p.font(skin.title, title.size, 700);
  ctx.fillStyle = skin.ink;
  for (const [i, line] of title.lines.entries()) {
    drawText(p, line, p.x(m), p.y(268 + i * (title.size + 14)), p.x(1080 - m * 2));
  }
  let y = 268 + title.lines.length * (title.size + 14) + 30;

  // 사진 — 넓은 가로 컷
  if (img) {
    const ph = Math.round(560 * adj.scale);
    const x = p.x(m);
    const w = p.x(1080 - m * 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, p.y(y), w, p.vh(ph));
    ctx.clip();
    drawCover(ctx, tuned(p, img), x, p.y(y), w, p.vh(ph), adj.focus);
    tintOver(p, x, p.y(y), w, p.vh(ph));
    ctx.restore();
    y += ph + 56;
  }

  // 본문 — 두 칸 느낌으로 좁게, 첫 줄만 살짝 크게
  const caption = data.caption?.trim() || data.subtitle?.trim();
  if (caption) {
    const fit = fitLines(p, caption, {
      family: skin.body,
      size: 40,
      weight: 500,
      maxWidth: 760,
      maxLines: 4,
    });
    ctx.font = p.font(skin.body, fit.size, 500);
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.85;
    for (const [i, line] of fit.lines.entries()) {
      drawText(p, line, p.x(m), p.y(y + 40 + i * 54), p.x(1080 - m * 2));
    }
    ctx.globalAlpha = 1;
  }

  stickerRow(p, stickerTexts(data.stickers, 2), 1200);
  paintGrain(p);

  ctx.font = p.font(skin.body, 28, 600);
  ctx.fillStyle = skin.ink;
  ctx.globalAlpha = 0.5;
  ctx.textAlign = 'right';
  drawText(p, '우리의 도화지 🖍️', p.x(1080 - m), p.y(1290), p.x(320));
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

export type { Painter };
