/**
 * 클래식 레이아웃 — 기록·오늘·종합 3종 (v1부터 쓰던 배치).
 *
 * 헤더 장식 → 제목 → 본문 → 사진 → 해시태그 → 워터마크 순서로 흐른다.
 * 좌표는 전부 1080×1350 기준이고, painter가 비율 3종으로 옮긴다.
 */
import { loadShareFonts } from '../../shareFonts';
import {
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
import type { Painter, ShareRatio, ShareTheme } from '../types';

interface Common {
  theme?: ShareTheme;
  ratio?: ShareRatio;
}

// ── 기록 카드 ────────────────────────────────────────────────────
export interface RecordCardData extends Common {
  date: string;
  spotNames: string[];
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
  ctx.fillText(data.date.replace(/-/g, '. '), p.W / 2, p.y(222));

  ctx.font = p.font(skin.body, 44, 600);
  ctx.globalAlpha = 0.85;
  const course = data.spotNames.join('  →  ');
  for (const [i, line] of wrapText(ctx, course, p.x(1080 - 200), 2).entries()) {
    ctx.fillText(line, p.W / 2, p.y(300 + i * 54));
  }
  ctx.globalAlpha = 1;

  const hasPhotos = images.some((i) => i !== null);
  if (hasPhotos) paintPhotoGrid(p, images, 420, 620, data.photoUrls.length);

  if (data.memo) {
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.85;
    ctx.textAlign = 'center';
    if (hasPhotos) {
      ctx.font = p.font(skin.body, 40, 500);
      for (const [i, line] of wrapText(ctx, `“${data.memo}”`, p.x(1080 - 150), 2).entries()) {
        ctx.fillText(line, p.W / 2, p.y(1140 + i * 52));
      }
    } else {
      ctx.font = p.font(skin.body, 56, 500);
      const lines = wrapText(ctx, `“${data.memo}”`, p.x(1080 - 260), 4);
      const startY = 760 - ((lines.length - 1) * 72) / 2;
      for (const [i, line] of lines.entries()) {
        ctx.fillText(line, p.W / 2, p.y(startY + i * 72));
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

  ctx.fillStyle = skin.ink;
  ctx.textAlign = 'center';
  ctx.font = p.font(skin.title, 58, 700);
  const [y, m, d] = data.date.split('-');
  ctx.fillText(`${y}년 ${Number(m)}월 ${Number(d)}일의 우리`, p.W / 2, p.y(216));

  if (data.myMood || data.partnerMood) {
    ctx.font = p.emoji(110);
    ctx.fillText(`${data.myMood ?? ''}  ${data.partnerMood ?? ''}`.trim(), p.W / 2, p.y(380));
  }

  let bubbleY = 460;
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
    ctx.fillText(label, x + p.x(30), p.y(bubbleY - 8));
    ctx.globalAlpha = 1;
    ctx.font = p.font(skin.body, 38, 500);
    for (const [i, line] of lines.entries()) {
      ctx.fillText(line, x + p.x(30), p.y(bubbleY + 56 + i * 50));
    }
    bubbleY += h + 56;
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
      ctx.fillText(line, p.W / 2, p.y(bubbleY + i * 50));
    }
    ctx.globalAlpha = 1;
    bubbleY += 76;
    ctx.font = p.font(skin.body, 36, 500);
    ctx.globalAlpha = 0.8;
    if (data.myAnswer) {
      const lines = wrapText(ctx, `${myName} · ${data.myAnswer}`, p.x(1080 - 260), 2);
      for (const [i, line] of lines.entries()) {
        ctx.fillText(line, p.W / 2, p.y(bubbleY + i * 46));
      }
      bubbleY += 52 + 46 * (lines.length - 1);
    }
    if (data.partnerAnswer) {
      const lines = wrapText(ctx, `${partnerName} · ${data.partnerAnswer}`, p.x(1080 - 260), 2);
      for (const [i, line] of lines.entries()) {
        ctx.fillText(line, p.W / 2, p.y(bubbleY + i * 46));
      }
      bubbleY += 52;
    }
    ctx.globalAlpha = 1;
  }

  // 문구가 있으면 하단에 인용구 자리를 비워둔다
  const caption = data.caption?.trim();
  const bottomReserve = caption ? 200 : 110;
  const photoTop = Math.max(bubbleY + 20, 780);
  const photoH = Math.min(430, 1350 - bottomReserve - photoTop);
  if (photoH >= 200) paintPhotoGrid(p, images, photoTop, photoH, data.photoUrls.length);

  paintGrain(p);

  if (caption) {
    ctx.textAlign = 'center';
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.85;
    ctx.font = p.font(skin.body, 42, 500);
    const lines = wrapText(ctx, `“${caption}”`, p.x(1080 - 240), 2);
    const capY = 1350 - 150 - (lines.length - 1) * 48;
    for (const [i, line] of lines.entries()) ctx.fillText(line, p.W / 2, p.y(capY + i * 48));
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
  ctx.fillText(data.title, p.W / 2, p.y(222));

  const hasPhotos = images.some((i) => i !== null);

  const stats = data.stats.slice(0, 3);
  const statsTop = hasPhotos ? 300 : 420;
  const colW = (1080 - 160) / stats.length;
  for (const [i, s] of stats.entries()) {
    const x = p.x(80 + colW * i + colW / 2);
    ctx.font = p.font(skin.title, hasPhotos ? 76 : 88, 700);
    ctx.fillStyle = accent;
    ctx.fillText(s.value, x, p.y(statsTop + 74));
    ctx.font = p.font(skin.body, 32, 600);
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.7;
    ctx.fillText(s.label, x, p.y(statsTop + 130));
    ctx.globalAlpha = 1;
  }

  if (hasPhotos) {
    paintPhotoGrid(p, images, 490, 560, data.photoTotal ?? data.photoUrls.length);
  } else {
    heartDoodle(p, 540, 830, 300, accent);
  }

  paintGrain(p);

  if (data.footer) {
    ctx.font = p.font(skin.body, 40, 500);
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.8;
    ctx.textAlign = 'center';
    ctx.fillText(data.footer, p.W / 2, p.y(1128));
    ctx.globalAlpha = 1;
  }

  paintRegionHashtags(p, data.regionNames, accent);
  paintWatermark(p);
}
