/**
 * 클래식 레이아웃 — 기록·오늘·종합 3종 (v1부터 쓰던 배치).
 *
 * 헤더 장식 → 제목 → 본문 → 사진 → 해시태그 → 워터마크 순서로 흐른다.
 * 좌표는 전부 1080×1350 기준이고, painter가 비율 3종으로 옮긴다.
 */
import { loadShareFonts } from '../../shareFonts';
import {
  drawText,
  heartDoodle,
  loadImage,
  paintGrain,
  paintHeaderDeco,
  paintPhotoGrid,
  paintRegionHashtags,
  paintWatermark,
  roundRect,
  wrapText,
} from '../draw';
import { createPainter } from '../painter';
import { stickerRow, stickerTexts, type CardStickers } from '../stickers';
import type { Painter, PhotoAdjust, PhotoAlign, ShareRatio, ShareTheme } from '../types';

interface Common {
  theme?: ShareTheme;
  ratio?: ShareRatio;
  /** 사진별 조정값 (크기·크롭 위치·기울기) — photoUrls와 같은 순서 */
  adjusts?: PhotoAdjust[];
  /** 사진 묶음이 카드 안에서 놓이는 자리 */
  photoAlign?: PhotoAlign;
  /** 자동으로 붙는 스티커 (계획 §5) */
  stickers?: CardStickers;
}

// ── 기록 카드 ────────────────────────────────────────────────────
export interface RecordCardData extends Common {
  date: string;
  spotNames: string[];
  /** 스팟별 한마디 (0016) — spotNames와 같은 순서. 있는 줄만 코스 아래에 붙는다 */
  spotNotes?: (string | null)[];
  memo: string | null;
  regionNames: string[];
  photoUrls: string[];
}

/** 데이트 기록 카드 — 지출은 명세 §4 원칙대로 넣지 않는다 */
export async function paintRecordCard(canvas: HTMLCanvasElement, data: RecordCardData) {
  const p = createPainter(canvas, data.theme, data.ratio);
  const { ctx, skin } = p;
  const accent = skin.accentFor('#e8637c');
  await loadShareFonts();
  const images = await Promise.all(data.photoUrls.slice(0, 4).map(loadImage));

  skin.paintBg(p);
  paintHeaderDeco(p, accent, -3.5);

  ctx.fillStyle = skin.ink;
  ctx.textAlign = 'center';
  ctx.font = p.font(skin.title, 62, 700);
  drawText(p, data.date.replace(/-/g, '. '), p.W / 2, p.y(222), p.x(900));

  ctx.font = p.font(skin.body, 44, 600);
  ctx.globalAlpha = 0.85;
  const course = data.spotNames.join('  →  ');
  const courseLines = wrapText(ctx, course, p.x(1080 - 200), 2);
  for (const [i, line] of courseLines.entries()) {
    drawText(p, line, p.W / 2, p.y(300 + i * 54), p.x(1080 - 160));
  }
  ctx.globalAlpha = 1;

  // 코스가 두 줄이 될 수 있으니 아래 요소는 흘려 내린다 — 고정 y로 두면 스티커가 글자를 덮는다
  let flow = 300 + courseLines.length * 54;

  // 스팟별 한마디 — 이름과 붙여 작게, 많으면 두 줄까지만 (카드의 주인공은 사진이다)
  const notes = (data.spotNames ?? [])
    .map((name, i) => ({ name, note: data.spotNotes?.[i]?.trim() }))
    .filter((x): x is { name: string; note: string } => Boolean(x.note))
    .slice(0, 2);
  if (notes.length > 0) {
    ctx.font = p.font(skin.body, 30, 500);
    ctx.globalAlpha = 0.65;
    for (const n of notes) {
      const text = notes.length > 1 || data.spotNames.length > 1 ? `${n.name} — ${n.note}` : n.note;
      const line = wrapText(ctx, text, p.x(1080 - 240), 1)[0] ?? '';
      drawText(p, line, p.W / 2, p.y(flow + 8), p.x(1080 - 200));
      flow += 44;
    }
    ctx.globalAlpha = 1;
    flow += 6;
  }

  const chips = stickerTexts(data.stickers, 2);
  if (chips.length > 0) {
    stickerRow(p, chips, flow + 20);
    flow += 76;
  }

  const hasPhotos = images.some((i) => i !== null);
  // 메모가 있으면 아래 두 줄을 비워 둔다 — 아래 경계는 비율마다 다르니 LH에서 뺀다
  const photoBottom = data.memo ? p.LH - 220 : p.LH - 100;
  const photoTop = flow + 14;
  let photoEnd = photoTop;
  if (hasPhotos && photoBottom - photoTop > 240) {
    photoEnd = paintPhotoGrid(p, images, photoTop, photoBottom - photoTop, data.photoUrls.length, {
      adjusts: data.adjusts,
      align: data.photoAlign,
    });
  }

  if (data.memo) {
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.85;
    ctx.textAlign = 'center';
    if (hasPhotos) {
      ctx.font = p.font(skin.body, 40, 500);
      // 사진이 끝나는 자리 바로 아래 — 사진이 작게 들어간 날에도 글이 멀리 떨어지지 않게
      const memoLines = wrapText(ctx, `“${data.memo}”`, p.x(1080 - 150), 2);
      const memoY = Math.min(p.LH - 130 - (memoLines.length - 1) * 52, photoEnd + 74);
      for (const [i, line] of memoLines.entries()) {
        drawText(p, line, p.W / 2, p.y(memoY + i * 52), p.x(1080 - 120));
      }
    } else {
      ctx.font = p.font(skin.body, 56, 500);
      const lines = wrapText(ctx, `“${data.memo}”`, p.x(1080 - 260), 4);
      const startY = p.LH * 0.56 - ((lines.length - 1) * 72) / 2;
      for (const [i, line] of lines.entries()) {
        drawText(p, line, p.W / 2, p.y(startY + i * 72), p.x(1080 - 200));
      }
    }
    ctx.globalAlpha = 1;
  }

  paintGrain(p);
  paintRegionHashtags(p, data.regionNames, accent);
  paintWatermark(p);
}

// ── 오늘(하루) 카드 ──────────────────────────────────────────────
export interface DayCardData extends Common {
  date: string;
  myMood: string | null;
  partnerMood: string | null;
  myNote: string | null;
  partnerNote: string | null;
  question: string | null;
  myAnswer: string | null;
  partnerAnswer: string | null;
  photoUrls: string[];
  /** 사용자가 직접 넣는 한마디 (선택) — 사진 아래 인용구로 */
  caption?: string | null;
  /** 말풍선·답변 앞에 붙는 이름. 없으면 '나'/'짝꿍'으로 (연결 전·미리보기) */
  myName?: string;
  partnerName?: string;
}

export async function paintDayCard(canvas: HTMLCanvasElement, data: DayCardData) {
  const p = createPainter(canvas, data.theme, data.ratio);
  const { ctx, skin } = p;
  const accent = skin.accentFor('#f2c14e');
  await loadShareFonts();
  const images = await Promise.all(data.photoUrls.slice(0, 2).map(loadImage));

  skin.paintBg(p);
  paintHeaderDeco(p, accent, 3);

  // 정사각처럼 세로가 짧으면 글 블록 사이 간격을 줄여 눌러 담는다 (글자 크기는 그대로)
  const squeeze = Math.max(0, 1350 - p.LH);

  ctx.fillStyle = skin.ink;
  ctx.textAlign = 'center';
  ctx.font = p.font(skin.title, 58, 700);
  const [y, m, d] = data.date.split('-');
  drawText(p, `${y}년 ${Number(m)}월 ${Number(d)}일의 우리`, p.W / 2, p.y(216 - squeeze * 0.1), p.x(940));

  if (data.myMood || data.partnerMood) {
    ctx.font = p.emoji(110);
    ctx.fillText(
      `${data.myMood ?? ''}  ${data.partnerMood ?? ''}`.trim(),
      p.W / 2,
      p.y(380 - squeeze * 0.2),
    );
  }

  let bubbleY = 460 - squeeze * 0.24;
  const bubbleGap = 56 - squeeze * 0.08;
  const bubble = (label: string, text: string, align: 'left' | 'right', color: string) => {
    ctx.font = p.font(skin.body, 38, 500);
    const lines = wrapText(ctx, text, p.x(640), 2);
    const w = Math.min(p.x(700), Math.max(...lines.map((l) => ctx.measureText(l).width)) + p.x(60));
    const h = 44 + lines.length * 50;
    const x = align === 'left' ? p.x(80) : p.W - p.x(80) - w;
    ctx.fillStyle = color;
    ctx.globalAlpha = skin.bubbleAlpha;
    roundRect(ctx, x, p.y(bubbleY), w, p.vh(h), 24 * p.s);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = skin.bubbleInk;
    ctx.textAlign = 'left';
    ctx.font = p.font(skin.body, 26, 700);
    ctx.globalAlpha = 0.6;
    drawText(p, label, x + p.x(30), p.y(bubbleY - 8), w - p.x(40));
    ctx.globalAlpha = 1;
    ctx.font = p.font(skin.body, 38, 500);
    for (const [i, line] of lines.entries()) {
      drawText(p, line, x + p.x(30), p.y(bubbleY + 56 + i * 50), w - p.x(50));
    }
    bubbleY += h + bubbleGap;
  };
  const myName = data.myName?.trim() || '나';
  const partnerName = data.partnerName?.trim() || '짝꿍';
  if (data.myNote) bubble(myName, data.myNote, 'left', skin.bubbleMe);
  if (data.partnerNote) bubble(partnerName, data.partnerNote, 'right', skin.bubblePartner);

  if (data.question && (data.myAnswer || data.partnerAnswer)) {
    ctx.textAlign = 'center';
    ctx.fillStyle = skin.ink;
    ctx.font = p.font(skin.body, 38, 700);
    ctx.globalAlpha = 0.9;
    for (const [i, line] of wrapText(ctx, `Q. ${data.question}`, p.x(1080 - 220), 2).entries()) {
      drawText(p, line, p.W / 2, p.y(bubbleY + i * 50), p.x(1080 - 180));
    }
    ctx.globalAlpha = 1;
    bubbleY += 76;
    ctx.font = p.font(skin.body, 36, 500);
    ctx.globalAlpha = 0.8;
    if (data.myAnswer) {
      const lines = wrapText(ctx, `${myName} · ${data.myAnswer}`, p.x(1080 - 260), 2);
      for (const [i, line] of lines.entries()) {
        drawText(p, line, p.W / 2, p.y(bubbleY + i * 46), p.x(1080 - 200));
      }
      bubbleY += 52 + 46 * (lines.length - 1);
    }
    if (data.partnerAnswer) {
      const lines = wrapText(ctx, `${partnerName} · ${data.partnerAnswer}`, p.x(1080 - 260), 2);
      for (const [i, line] of lines.entries()) {
        drawText(p, line, p.W / 2, p.y(bubbleY + i * 46), p.x(1080 - 200));
      }
      bubbleY += 52;
    }
    ctx.globalAlpha = 1;
  }

  // 문구가 있으면 하단에 인용구 자리를 비워둔다
  const caption = data.caption?.trim();
  const bottomReserve = caption ? 200 : 110;
  const photoTop = Math.max(bubbleY + 20, 780 - squeeze * 0.24);
  // 스토리처럼 세로가 길면 사진이 그만큼 자란다 — 남는 높이를 사진이 흡수한다
  const photoH = Math.min(430 + Math.max(0, p.LH - 1350), p.LH - bottomReserve - photoTop);
  if (photoH >= 170) {
    paintPhotoGrid(p, images, photoTop, photoH, data.photoUrls.length, {
      adjusts: data.adjusts,
      align: data.photoAlign,
    });
  }

  paintGrain(p);

  if (caption) {
    ctx.textAlign = 'center';
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.85;
    ctx.font = p.font(skin.body, 42, 500);
    const lines = wrapText(ctx, `“${caption}”`, p.x(1080 - 240), 2);
    const capY = p.LH - 150 - (lines.length - 1) * 48;
    for (const [i, line] of lines.entries()) drawText(p, line, p.W / 2, p.y(capY + i * 48), p.x(1080 - 180));
    ctx.globalAlpha = 1;
  }

  paintWatermark(p);
}

// ── 종합(리캡) 카드 ──────────────────────────────────────────────
export interface RecapCardData extends Common {
  title: string;
  stats: { value: string; label: string }[];
  regionNames: string[];
  photoUrls: string[];
  photoTotal?: number;
  footer: string | null;
}

export async function paintRecapCard(canvas: HTMLCanvasElement, data: RecapCardData) {
  const p: Painter = createPainter(canvas, data.theme, data.ratio);
  const { ctx, skin } = p;
  const accent = skin.accentFor('#8cab68');
  await loadShareFonts();
  const images = await Promise.all(data.photoUrls.slice(0, 4).map(loadImage));

  skin.paintBg(p);
  paintHeaderDeco(p, accent, -2.5);

  ctx.fillStyle = skin.ink;
  ctx.textAlign = 'center';
  ctx.font = p.font(skin.title, 60, 700);
  drawText(p, data.title, p.W / 2, p.y(222), p.x(920));

  const hasPhotos = images.some((i) => i !== null);

  const stats = data.stats.slice(0, 3);
  const statsTop = hasPhotos ? 300 : 420;
  const colW = (1080 - 160) / stats.length;
  for (const [i, s] of stats.entries()) {
    const x = p.x(80 + colW * i + colW / 2);
    ctx.font = p.font(skin.title, hasPhotos ? 76 : 88, 700);
    ctx.fillStyle = accent;
    drawText(p, s.value, x, p.y(statsTop + 74), p.x(colW - 20));
    ctx.font = p.font(skin.body, 32, 600);
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.7;
    drawText(p, s.label, x, p.y(statsTop + 130), p.x(colW - 12));
    ctx.globalAlpha = 1;
  }

  // 사진 영역이 비율마다 남는 높이를 흡수한다 — 정사각은 짧게, 스토리는 길게
  const gridTop = 480;
  const gridH = p.LH - 270 - gridTop;
  if (hasPhotos) {
    paintPhotoGrid(p, images, gridTop, gridH, data.photoTotal ?? data.photoUrls.length, {
      adjusts: data.adjusts,
      align: data.photoAlign,
    });
  } else {
    heartDoodle(p, 540, gridTop + gridH / 2, Math.min(300, gridH * 0.6), accent);
  }

  paintGrain(p);

  if (data.footer) {
    ctx.font = p.font(skin.body, 40, 500);
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.8;
    ctx.textAlign = 'center';
    drawText(p, data.footer, p.W / 2, p.y(p.LH - 222), p.x(1080 - 140));
    ctx.globalAlpha = 1;
  }

  paintRegionHashtags(p, data.regionNames, accent);
  paintWatermark(p);
}
