/**
 * 사진이 주인공인 레이아웃 2종 (계획 §4-①②).
 *
 * - 풀블리드: 사진이 화면 전체. 하단 그라데이션 위에 흰 글씨. 사진이 좋을 때 가장 강하다.
 * - 폴라로이드: 사진 1장 + 아래 넓은 여백에 손글씨. 여백이 주인공이라 사진이 평범해도 산다.
 *
 * 둘 다 사진이 없으면 그릴 수 없다 — 호출부가 사진 유무로 스타일을 노출한다.
 */
import { loadShareFonts } from '../../shareFonts';
import {
  drawCover,
  drawText,
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
import { filmDateStamp, rubberStamp, stickerColumn, stickerTexts, type CardStickers } from '../stickers';
import type { Painter, ShareRatio, ShareTheme } from '../types';

export interface PhotoCardData {
  theme?: ShareTheme;
  ratio?: ShareRatio;
  /** 사진 칸 배율 (사용자 슬라이더) */
  photoScale?: number;
  /** 2026-07-25 */
  date: string;
  /** 큰 글씨 — 없으면 날짜를 쓴다 */
  title?: string | null;
  /** 작은 글씨 — 코스나 지역 */
  subtitle?: string | null;
  /** 손글씨 한마디 */
  caption?: string | null;
  regionNames: string[];
  photoUrls: string[];
  /** 자동으로 붙는 스티커 (계획 §5) */
  stickers?: CardStickers;
}

const dotted = (date: string) => date.replace(/-/g, '. ');

// ── 풀블리드 ─────────────────────────────────────────────────────
export async function paintFullBleedCard(canvas: HTMLCanvasElement, data: PhotoCardData) {
  const p = createPainter(canvas, data.theme, data.ratio, data.photoScale);
  const { ctx, skin } = p;
  await loadShareFonts();
  const img = await loadImage(data.photoUrls[0] ?? '');

  skin.paintBg(p);
  if (img) {
    drawCover(ctx, tuned(p, img), 0, 0, p.W, p.H);
    tintOver(p, 0, 0, p.W, p.H);
  }

  // 글자가 놓일 아래쪽을 어둡게 — 사진이 밝아도 흰 글씨가 읽힌다
  const gradTop = p.y(620);
  const g = ctx.createLinearGradient(0, gradTop, 0, p.bottom);
  g.addColorStop(0, 'rgba(12,10,9,0)');
  g.addColorStop(0.4, 'rgba(12,10,9,0.42)');
  g.addColorStop(0.75, 'rgba(12,10,9,0.74)');
  g.addColorStop(1, 'rgba(12,10,9,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, gradTop, p.W, p.bottom - gradTop);
  // 위쪽에도 옅게 — 날짜 스탬프가 밝은 하늘 위에서도 보이게
  const gt = ctx.createLinearGradient(0, p.top, 0, p.y(300));
  gt.addColorStop(0, 'rgba(12,10,9,0.42)');
  gt.addColorStop(1, 'rgba(12,10,9,0)');
  ctx.fillStyle = gt;
  ctx.fillRect(0, p.top, p.W, p.y(300) - p.top);

  paintGrain(p);

  // 밝은 사진에서도 글자가 뜨게 — 그라데이션 위에 옅은 그림자를 한 겹 더
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18 * p.s;

  // 우상단 날짜 — 필름 카메라 각인 자리
  filmDateStamp(p, data.date, 1080 - 64, 110);
  // 그 아래로 스티커 (처음 칠한 동네 · ×N번째 · D+n · 정복률)
  stickerColumn(p, stickerTexts(data.stickers), { x: 1080 - 64, y: 186, align: 'right', onDark: true });
  ctx.textAlign = 'left';

  // 하단 블록 — 제목 → 코스 → 한마디 → 해시태그 순으로 쌓아 올린다
  let y = 1350 - 78;
  const tags = toHashtags(data.regionNames);
  if (tags) {
    ctx.font = p.font(skin.body, 32, 700);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.72;
    const lines = wrapText(ctx, tags, p.x(1080 - 340), 1);
    drawText(p, lines[0] ?? '', p.x(64), p.y(y), p.x(1080 - 340));
    ctx.globalAlpha = 1;
    y -= 58;
  }
  const caption = data.caption?.trim();
  if (caption) {
    const fit = fitLines(p, `“${caption}”`, {
      family: skin.body,
      size: 42,
      weight: 500,
      maxWidth: 950,
      maxLines: 2,
    });
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.9;
    for (const [i, line] of fit.lines.entries()) {
      drawText(p, line, p.x(64), p.y(y - (fit.lines.length - 1 - i) * 52), p.x(952));
    }
    ctx.globalAlpha = 1;
    y -= fit.lines.length * 52 + 14;
  }
  if (data.subtitle) {
    const fit = fitLines(p, data.subtitle, {
      family: skin.body,
      size: 38,
      weight: 600,
      maxWidth: 950,
      maxLines: 1,
    });
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.8;
    drawText(p, fit.lines[0] ?? '', p.x(64), p.y(y), p.x(952));
    ctx.globalAlpha = 1;
    y -= 66;
  }
  const title = fitLines(p, data.title?.trim() || dotted(data.date), {
    family: skin.title,
    size: 78,
    weight: 700,
    maxWidth: 950,
    maxLines: 2,
  });
  ctx.fillStyle = '#ffffff';
  for (const [i, line] of title.lines.entries()) {
    drawText(p, line, p.x(64), p.y(y - (title.lines.length - 1 - i) * (title.size + 12)), p.x(952));
  }

  ctx.textAlign = 'right';
  ctx.font = p.font(skin.body, 28, 600);
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.55;
  drawText(p, '우리의 도화지 🖍️', p.x(1080 - 64), p.y(1350 - 56), p.x(320));
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';
  ctx.textAlign = 'left';
}

// ── 폴라로이드 ───────────────────────────────────────────────────
export async function paintPolaroidCard(canvas: HTMLCanvasElement, data: PhotoCardData) {
  const p = createPainter(canvas, data.theme, data.ratio, data.photoScale);
  const { ctx, skin } = p;
  await loadShareFonts();
  const img = await loadImage(data.photoUrls[0] ?? '');

  skin.paintBg(p);

  // 폴라로이드 한 장 — 살짝 기울여 손으로 놓은 느낌
  const cardX = 96;
  const cardY = 150;
  const cardW = 888;
  const cardH = 1010;
  const deg = -1.4;
  ctx.save();
  ctx.translate(p.x(cardX + cardW / 2), p.y(cardY + cardH / 2));
  ctx.rotate((deg * Math.PI) / 180);
  const w = p.x(cardW);
  const h = p.vh(cardH);
  ctx.shadowColor = 'rgba(20,16,12,0.28)';
  ctx.shadowBlur = 34 * p.s;
  ctx.shadowOffsetY = 14 * p.s;
  ctx.fillStyle = skin.frame.mat;
  roundRect(ctx, -w / 2, -h / 2, w, h, 8 * p.s);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (skin.frame.border) {
    ctx.strokeStyle = skin.frame.border;
    ctx.lineWidth = 2 * p.s;
    roundRect(ctx, -w / 2, -h / 2, w, h, 8 * p.s);
    ctx.stroke();
  }

  // 사진 — 폴라로이드 규칙대로 위·좌·우 여백은 같고 아래만 넓다
  const pad = p.x(46);
  const photoW = w - pad * 2;
  // 사진 칸 크기 — 슬라이더로 조절. 매트 안에서 위·좌·우 여백은 유지한다
  const photoH = Math.min(h - pad * 2 - p.vh(150), p.vh(760) * p.photoScale);
  const px = -w / 2 + pad;
  const py = -h / 2 + pad;
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, photoW, photoH);
    ctx.clip();
    drawCover(ctx, tuned(p, img), px, py, photoW, photoH);
    tintOver(p, px, py, photoW, photoH);
    ctx.restore();
  } else {
    ctx.fillStyle = skin.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(px, py, photoW, photoH);
  }

  // 사진 위 고무도장 — '처음 칠한 동네'·'×N번째' 같은 사건만 (없으면 안 찍는다)
  const stamp = stickerTexts(data.stickers, 1)[0];
  if (stamp && !stamp.startsWith('D+') && !stamp.startsWith('대한민국')) {
    rubberStamp(p, stamp, px + photoW - p.x(34), py + p.vh(84), { anchor: 'right' });
  }

  // 아래 여백 — 손글씨 한마디 + 날짜
  const inkOnMat = skin.dark ? '#f3ede3' : '#3b3733';
  const caption = data.caption?.trim() || data.subtitle?.trim() || '';
  if (caption) {
    const fit = fitLines(p, caption, {
      family: skin.body,
      size: 48,
      weight: 500,
      maxWidth: 760,
      maxLines: 2,
    });
    ctx.font = p.font(skin.body, fit.size, 500);
    ctx.textAlign = 'center';
    ctx.fillStyle = inkOnMat;
    ctx.globalAlpha = 0.9;
    const baseY = py + photoH + p.vh(84);
    for (const [i, line] of fit.lines.entries()) {
      ctx.fillText(line, 0, baseY + i * p.vh(56), photoW);
    }
    ctx.globalAlpha = 1;
  }
  ctx.font = p.font(skin.body, 30, 700);
  ctx.textAlign = 'right';
  ctx.fillStyle = inkOnMat;
  ctx.globalAlpha = 0.5;
  ctx.fillText(dotted(data.date), w / 2 - pad, h / 2 - p.vh(28), photoW / 2);
  const dday = stickerTexts(data.stickers).find((t) => t.startsWith('D+'));
  if (dday) {
    ctx.textAlign = 'left';
    ctx.fillText(dday, -w / 2 + pad, h / 2 - p.vh(28), photoW / 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // 마스킹테이프 — 도화지·빈티지 톤에만 (계획 §5)
  if (skin.headerDeco === 'tape') {
    tape(p, cardX + 40, cardY - 6, -22, skin.accentFor('#f2c14e'));
    tape(p, cardX + cardW - 40, cardY + 4, 18, skin.accentFor('#9ec3d8'));
  }

  paintGrain(p);

  const tags = toHashtags(data.regionNames);
  if (tags) {
    ctx.font = p.font(skin.body, 32, 700);
    ctx.fillStyle = skin.accentFor('#e8637c');
    ctx.textAlign = 'left';
    drawText(p, wrapText(ctx, tags, p.x(1080 - 340), 1)[0] ?? '', p.x(64), p.y(1284), p.x(1080 - 340));
  }
  ctx.font = p.font(skin.body, 30, 600);
  ctx.fillStyle = skin.ink;
  ctx.globalAlpha = 0.5;
  ctx.textAlign = 'right';
  drawText(p, '우리의 도화지 🖍️', p.x(1080 - 64), p.y(1286), p.x(320));
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

/** 모서리에 붙인 마스킹테이프 한 조각 */
function tape(p: Painter, cx: number, cy: number, deg: number, color: string) {
  const { ctx } = p;
  const w = p.x(190);
  const h = p.vh(54);
  ctx.save();
  ctx.translate(p.x(cx), p.y(cy));
  ctx.rotate((deg * Math.PI) / 180);
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#fdfcf7';
  ctx.lineWidth = 2.5 * p.s;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 10 * p.s, -h / 6);
  ctx.lineTo(w / 2 - 10 * p.s, -h / 6);
  ctx.moveTo(-w / 2 + 10 * p.s, h / 6);
  ctx.lineTo(w / 2 - 10 * p.s, h / 6);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}
