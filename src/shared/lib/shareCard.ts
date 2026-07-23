/**
 * 공유 카드 페인터 (명세 §7 바이럴 설계의 v1 선행 — 기록·오늘 2종).
 * 인스타 세로 규격 1080×1350, 도화지 감성(종이 톤·마스킹테이프·폴라로이드 프레임).
 * 원칙: 지출은 카드에서 자동 제외 (명세 §4 공유 격리).
 */

export const CARD_W = 1080;
export const CARD_H = 1350;

const PAPER = '#fdfcf7';
const INK = '#3b3733';
const PINK = '#e8637c';
const GREEN = '#8cab68';
const YELLOW = '#f2c14e';

const FONT = '-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 마스킹테이프 조각 */
function tape(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, deg: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 12, -h / 6);
  ctx.lineTo(w / 2 - 12, -h / 6);
  ctx.moveTo(-w / 2 + 12, h / 6);
  ctx.lineTo(w / 2 - 12, h / 6);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** 사진을 cover로 그려주는 폴라로이드 프레임 */
function polaroid(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap | HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  deg: number,
) {
  const pad = 18;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.shadowColor = 'rgba(59,55,51,0.25)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, -w / 2, -h / 2, w, h, 10);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // cover-fit
  const iw = 'width' in img ? img.width : 0;
  const ih = 'height' in img ? img.height : 0;
  const dw = w - pad * 2;
  const dh = h - pad * 2;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  ctx.save();
  roundRect(ctx, -w / 2 + pad, -h / 2 + pad, dw, dh, 6);
  ctx.clip();
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, -w / 2 + pad, -h / 2 + pad, dw, dh);
  ctx.restore();
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth || ch === '\n') {
      lines.push(line);
      line = ch === '\n' ? '' : ch;
      if (lines.length === maxLines) {
        lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
        return lines;
      }
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function loadImage(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

function paintBase(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // 손그림 테두리 (살짝 기운 이중 프레임)
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 3;
  ctx.save();
  ctx.translate(CARD_W / 2, CARD_H / 2);
  ctx.rotate(-0.004);
  ctx.strokeRect(-CARD_W / 2 + 36, -CARD_H / 2 + 36, CARD_W - 72, CARD_H - 72);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** 사진이 없을 때 가운데를 채우는 크레용 하트 낙서 */
function heartDoodle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  const s = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.06);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.9);
  ctx.bezierCurveTo(-s * 1.4, s * 0.05, -s * 0.7, -s, 0, -s * 0.35);
  ctx.bezierCurveTo(s * 0.7, -s, s * 1.4, s * 0.05, 0, s * 0.9);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.15;
  ctx.fill();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.setLineDash([26, 14]);
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** 좌하단 정복 지역 칩 — 3개까지 + "외 N곳", 워터마크 영역은 침범하지 않는다 */
function paintRegionChips(ctx: CanvasRenderingContext2D, names: string[]) {
  if (names.length === 0) return;
  ctx.textAlign = 'left';
  const shown = names.slice(0, 3);
  const labels = names.length > shown.length ? [...shown, `외 ${names.length - shown.length}곳`] : shown;
  let chipX = 64;
  ctx.font = `700 30px ${FONT}`;
  for (const label of labels) {
    const w = ctx.measureText(label).width + 48;
    if (chipX + w > CARD_W - 320) break;
    ctx.fillStyle = GREEN;
    ctx.globalAlpha = 0.9;
    roundRect(ctx, chipX, CARD_H - 100, w, 52, 26);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, chipX + 24, CARD_H - 64);
    chipX += w + 14;
  }
}

function paintWatermark(ctx: CanvasRenderingContext2D) {
  ctx.font = `600 30px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.45;
  ctx.textAlign = 'right';
  ctx.fillText('우리의 도화지 🖍️', CARD_W - 64, CARD_H - 64);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function paintPhotoGrid(ctx: CanvasRenderingContext2D, images: (ImageBitmap | null)[], top: number, height: number) {
  const shots = images.filter((i): i is ImageBitmap => i !== null).slice(0, 4);
  const cx = CARD_W / 2;
  if (shots.length === 0) return;
  if (shots.length === 1) {
    polaroid(ctx, shots[0], cx - 400, top, 800, height, -1.6);
  } else if (shots.length === 2) {
    polaroid(ctx, shots[0], cx - 420, top + 14, 410, height - 30, -2.2);
    polaroid(ctx, shots[1], cx + 14, top, 410, height - 30, 1.8);
  } else {
    const w = 405;
    const h = (height - 26) / 2;
    polaroid(ctx, shots[0], cx - 420, top, w, h, -2);
    polaroid(ctx, shots[1], cx + 16, top + 10, w, h, 1.6);
    polaroid(ctx, shots[2], cx - 414, top + h + 22, w, h, 1.4);
    if (shots[3]) polaroid(ctx, shots[3], cx + 10, top + h + 30, w, h, -1.8);
  }
}

export interface RecordCardData {
  date: string;
  spotNames: string[];
  memo: string | null;
  regionNames: string[];
  photoUrls: string[];
}

/** 데이트 기록 카드 — 지출은 명세 §4 원칙대로 넣지 않는다 */
export async function paintRecordCard(canvas: HTMLCanvasElement, data: RecordCardData) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 미지원');
  const images = await Promise.all(data.photoUrls.slice(0, 4).map(loadImage));

  paintBase(ctx);
  tape(ctx, CARD_W / 2, 96, 300, 74, -3.5, PINK);

  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `700 58px ${FONT}`;
  ctx.fillText(data.date.replace(/-/g, '. '), CARD_W / 2, 220);

  ctx.font = `600 40px ${FONT}`;
  ctx.globalAlpha = 0.8;
  const course = data.spotNames.join('  →  ');
  for (const [i, line] of wrapText(ctx, course, CARD_W - 200, 2).entries()) {
    ctx.fillText(line, CARD_W / 2, 296 + i * 54);
  }
  ctx.globalAlpha = 1;

  const hasPhotos = images.some((i) => i !== null);
  if (hasPhotos) paintPhotoGrid(ctx, images, 420, 620);

  if (data.memo) {
    // 사진이 없으면 메모가 주인공 — 중앙에 크게, 사진이 있으면 아래 캡션으로
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.75;
    if (hasPhotos) {
      ctx.font = `500 38px ${FONT}`;
      for (const [i, line] of wrapText(ctx, `“${data.memo}”`, CARD_W - 240, 2).entries()) {
        ctx.fillText(line, CARD_W / 2, 1140 + i * 54);
      }
    } else {
      ctx.font = `500 46px ${FONT}`;
      const lines = wrapText(ctx, `“${data.memo}”`, CARD_W - 260, 4);
      const startY = 760 - ((lines.length - 1) * 68) / 2;
      for (const [i, line] of lines.entries()) {
        ctx.fillText(line, CARD_W / 2, startY + i * 68);
      }
    }
    ctx.globalAlpha = 1;
  }

  paintRegionChips(ctx, data.regionNames);
  paintWatermark(ctx);
}

export interface DayCardData {
  date: string;
  myMood: string | null;
  partnerMood: string | null;
  myNote: string | null;
  partnerNote: string | null;
  question: string | null;
  myAnswer: string | null;
  partnerAnswer: string | null;
  photoUrls: string[];
}

/** 오늘(하루) 카드 — 기분·일기·질문 답·사진 */
export async function paintDayCard(canvas: HTMLCanvasElement, data: DayCardData) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 미지원');
  const images = await Promise.all(data.photoUrls.slice(0, 2).map(loadImage));

  paintBase(ctx);
  tape(ctx, CARD_W / 2, 96, 300, 74, 3, YELLOW);

  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `700 54px ${FONT}`;
  const [y, m, d] = data.date.split('-');
  ctx.fillText(`${y}년 ${Number(m)}월 ${Number(d)}일의 우리`, CARD_W / 2, 214);

  // 기분
  if (data.myMood || data.partnerMood) {
    ctx.font = `400 110px ${FONT}`;
    ctx.fillText(`${data.myMood ?? ''}  ${data.partnerMood ?? ''}`.trim(), CARD_W / 2, 380);
  }

  // 한 줄 일기 말풍선
  let bubbleY = 460;
  const bubble = (label: string, text: string, align: 'left' | 'right', color: string) => {
    ctx.font = `500 34px ${FONT}`;
    const lines = wrapText(ctx, text, 640, 2);
    const w = Math.min(700, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 60);
    const h = 40 + lines.length * 48;
    const x = align === 'left' ? 80 : CARD_W - 80 - w;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    roundRect(ctx, x, bubbleY, w, h, 22);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.font = `700 26px ${FONT}`;
    ctx.globalAlpha = 0.6;
    ctx.fillText(label, x + 30, bubbleY - 8);
    ctx.globalAlpha = 1;
    ctx.font = `500 34px ${FONT}`;
    for (const [i, line] of lines.entries()) {
      ctx.fillText(line, x + 30, bubbleY + 52 + i * 48);
    }
    bubbleY += h + 56;
  };
  if (data.myNote) bubble('나', data.myNote, 'left', '#9ec3d8');
  if (data.partnerNote) bubble('짝꿍', data.partnerNote, 'right', '#e8637c');

  // 질문 + 답
  if (data.question && (data.myAnswer || data.partnerAnswer)) {
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = `700 36px ${FONT}`;
    ctx.globalAlpha = 0.85;
    for (const [i, line] of wrapText(ctx, `Q. ${data.question}`, CARD_W - 220, 2).entries()) {
      ctx.fillText(line, CARD_W / 2, bubbleY + i * 50);
    }
    ctx.globalAlpha = 1;
    bubbleY += 76;
    ctx.font = `500 32px ${FONT}`;
    ctx.globalAlpha = 0.72;
    if (data.myAnswer) {
      for (const [i, line] of wrapText(ctx, `나 · ${data.myAnswer}`, CARD_W - 260, 2).entries()) {
        ctx.fillText(line, CARD_W / 2, bubbleY + i * 44);
      }
      bubbleY += 50 + 44 * (wrapText(ctx, `나 · ${data.myAnswer}`, CARD_W - 260, 2).length - 1);
    }
    if (data.partnerAnswer) {
      for (const [i, line] of wrapText(ctx, `짝꿍 · ${data.partnerAnswer}`, CARD_W - 260, 2).entries()) {
        ctx.fillText(line, CARD_W / 2, bubbleY + i * 44);
      }
      bubbleY += 50;
    }
    ctx.globalAlpha = 1;
  }

  paintPhotoGrid(ctx, images, Math.max(bubbleY + 20, 780), 420);
  paintWatermark(ctx);
}

export interface RecapCardData {
  /** 예: "2026년 7월의 우리" / "지금까지의 우리" */
  title: string;
  /** 큰 숫자 통계 2~3칸 (예: value "12번" label "데이트") */
  stats: { value: string; label: string }[];
  regionNames: string[];
  photoUrls: string[];
  /** 하단 한 줄 (예: "대한민국 8/230 지역에 우리 발자국") */
  footer: string | null;
}

/** 종합 카드 — 여러 기록을 한 장으로 (월간 리캡·전체 리캡 공용). 지출은 여기도 제외 */
export async function paintRecapCard(canvas: HTMLCanvasElement, data: RecapCardData) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 미지원');
  const images = await Promise.all(data.photoUrls.slice(0, 4).map(loadImage));

  paintBase(ctx);
  tape(ctx, CARD_W / 2, 96, 300, 74, -2.5, GREEN);

  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `700 58px ${FONT}`;
  ctx.fillText(data.title, CARD_W / 2, 220);

  const hasPhotos = images.some((i) => i !== null);

  // 통계 칸 — 사진이 없으면 통계가 주인공이라 더 크게, 아래로
  const stats = data.stats.slice(0, 3);
  const statsTop = hasPhotos ? 300 : 420;
  const colW = (CARD_W - 160) / stats.length;
  for (const [i, s] of stats.entries()) {
    const x = 80 + colW * i + colW / 2;
    ctx.font = `700 ${hasPhotos ? 72 : 84}px ${FONT}`;
    ctx.fillStyle = PINK;
    ctx.fillText(s.value, x, statsTop + 72);
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.6;
    ctx.fillText(s.label, x, statsTop + 128);
    ctx.globalAlpha = 1;
  }

  if (hasPhotos) {
    paintPhotoGrid(ctx, images, 490, 560);
  } else {
    heartDoodle(ctx, CARD_W / 2, 830, 300, PINK);
  }

  if (data.footer) {
    ctx.font = `500 36px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.7;
    ctx.textAlign = 'center';
    ctx.fillText(data.footer, CARD_W / 2, 1130);
    ctx.globalAlpha = 1;
  }

  paintRegionChips(ctx, data.regionNames);
  paintWatermark(ctx);
}

/** 카드 → PNG Blob */
export function cardToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 생성 실패'))), 'image/png');
  });
}
