/**
 * 공유 카드 페인터 (명세 §7 바이럴 설계) — 기록·오늘·종합 3종.
 * 인스타 세로 규격 1080×1350. 테마 4종(도화지·필름·미니멀·노을)을 골라 낼 수 있다.
 * 원칙: 지출은 카드에서 자동 제외 (명세 §4 공유 격리).
 */

export const CARD_W = 1080;
export const CARD_H = 1350;

const FONT = '-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

// ── 테마 ──────────────────────────────────────────────────────────
export type ShareTheme = 'paper' | 'film' | 'mono' | 'sunset' | 'vintage' | 'pastel';

export const SHARE_THEMES: { key: ShareTheme; label: string; swatch: string }[] = [
  { key: 'paper', label: '도화지', swatch: '#fdfcf7' },
  { key: 'film', label: '필름', swatch: '#211e1b' },
  { key: 'mono', label: '미니멀', swatch: '#ffffff' },
  { key: 'sunset', label: '노을', swatch: '#7a3b52' },
  { key: 'vintage', label: '빈티지', swatch: '#c9a66b' },
  { key: 'pastel', label: '파스텔', swatch: '#f4c9dd' },
];

interface Skin {
  ink: string; // 본문 텍스트
  headerDeco: 'tape' | 'rule'; // 제목 위 장식 (마스킹테이프 / 짧은 선)
  frame: { mat: string; pad: number; radius: number; shadow: number; border: string | null };
  bubbleMe: string;
  bubblePartner: string;
  bubbleAlpha: number;
  bubbleInk: string;
  badgeBg: string;
  badgeInk: string;
  /** 카드별 기본 강조색(pink/yellow/green)을 테마에 맞게 변환 */
  accentFor: (base: string) => string;
  paintBg: (ctx: CanvasRenderingContext2D) => void;
}

const SKINS: Record<ShareTheme, Skin> = {
  paper: {
    ink: '#3b3733',
    headerDeco: 'tape',
    frame: { mat: '#ffffff', pad: 18, radius: 10, shadow: 0.25, border: null },
    bubbleMe: '#9ec3d8',
    bubblePartner: '#e8637c',
    bubbleAlpha: 0.35,
    bubbleInk: '#3b3733',
    badgeBg: '#3b3733',
    badgeInk: '#fdfcf7',
    accentFor: (base) => base,
    paintBg: (ctx) => {
      ctx.fillStyle = '#fdfcf7';
      ctx.fillRect(0, 0, CARD_W, CARD_H);
      ctx.strokeStyle = '#3b3733';
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 3;
      ctx.save();
      ctx.translate(CARD_W / 2, CARD_H / 2);
      ctx.rotate(-0.004);
      ctx.strokeRect(-CARD_W / 2 + 36, -CARD_H / 2 + 36, CARD_W - 72, CARD_H - 72);
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  },
  film: {
    ink: '#f3ede3',
    headerDeco: 'rule',
    frame: { mat: '#0e0d0c', pad: 16, radius: 6, shadow: 0.5, border: 'rgba(224,161,90,0.5)' },
    bubbleMe: '#8aa2ad',
    bubblePartner: '#d98a97',
    bubbleAlpha: 0.22,
    bubbleInk: '#f3ede3',
    badgeBg: '#e0a15a',
    badgeInk: '#211e1b',
    accentFor: () => '#e0a15a',
    paintBg: (ctx) => {
      ctx.fillStyle = '#211e1b';
      ctx.fillRect(0, 0, CARD_W, CARD_H);
      ctx.strokeStyle = 'rgba(224,161,90,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 40, CARD_W - 80, CARD_H - 80);
    },
  },
  mono: {
    ink: '#1a1a1a',
    headerDeco: 'rule',
    frame: { mat: '#ffffff', pad: 14, radius: 4, shadow: 0.14, border: 'rgba(0,0,0,0.08)' },
    bubbleMe: '#111111',
    bubblePartner: '#111111',
    bubbleAlpha: 0.06,
    bubbleInk: '#1a1a1a',
    badgeBg: '#1a1a1a',
    badgeInk: '#ffffff',
    accentFor: () => '#1a1a1a',
    paintBg: (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CARD_W, CARD_H);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(48, 48, CARD_W - 96, CARD_H - 96);
    },
  },
  sunset: {
    ink: '#fff5ef',
    headerDeco: 'rule',
    frame: { mat: '#ffffff', pad: 16, radius: 14, shadow: 0.28, border: null },
    bubbleMe: '#ffffff',
    bubblePartner: '#ffffff',
    bubbleAlpha: 0.16,
    bubbleInk: '#fff5ef',
    badgeBg: '#ffd28a',
    badgeInk: '#3a1f2e',
    accentFor: () => '#ffd28a',
    paintBg: (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, CARD_H);
      g.addColorStop(0, '#2a1a2e');
      g.addColorStop(0.55, '#7a3b52');
      g.addColorStop(1, '#c96b6b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CARD_W, CARD_H);
    },
  },
  vintage: {
    ink: '#4a3b2a',
    headerDeco: 'tape',
    frame: { mat: '#f4ead2', pad: 18, radius: 8, shadow: 0.22, border: 'rgba(74,59,42,0.28)' },
    bubbleMe: '#7d8a63',
    bubblePartner: '#a8613f',
    bubbleAlpha: 0.3,
    bubbleInk: '#4a3b2a',
    badgeBg: '#4a3b2a',
    badgeInk: '#f4ead2',
    accentFor: () => '#a8613f',
    paintBg: (ctx) => {
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(0, 0, CARD_W, CARD_H);
      // 세피아 비네트 — 모서리를 살짝 그을린 오래된 사진 느낌
      const g = ctx.createRadialGradient(CARD_W / 2, CARD_H / 2, CARD_H * 0.3, CARD_W / 2, CARD_H / 2, CARD_H * 0.72);
      g.addColorStop(0, 'rgba(74,59,42,0)');
      g.addColorStop(1, 'rgba(74,59,42,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CARD_W, CARD_H);
      ctx.strokeStyle = 'rgba(74,59,42,0.4)';
      ctx.lineWidth = 3;
      ctx.strokeRect(38, 38, CARD_W - 76, CARD_H - 76);
      ctx.strokeStyle = 'rgba(74,59,42,0.2)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(48, 48, CARD_W - 96, CARD_H - 96);
    },
  },
  pastel: {
    ink: '#5b5570',
    headerDeco: 'rule',
    frame: { mat: '#ffffff', pad: 16, radius: 20, shadow: 0.16, border: null },
    bubbleMe: '#a6c8f4',
    bubblePartner: '#f4a6c0',
    bubbleAlpha: 0.42,
    bubbleInk: '#5b5570',
    badgeBg: '#c9a6e0',
    badgeInk: '#ffffff',
    accentFor: () => '#e58ab0',
    paintBg: (ctx) => {
      const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
      g.addColorStop(0, '#fdeef4');
      g.addColorStop(0.5, '#eef0fb');
      g.addColorStop(1, '#e9f6f1');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CARD_W, CARD_H);
    },
  },
};

function resolveSkin(theme: ShareTheme | undefined): Skin {
  return SKINS[theme ?? 'paper'];
}

// ── 공통 헬퍼 ────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 제목 위 장식 — 도화지는 마스킹테이프, 나머지는 짧은 강조선 */
function paintHeaderDeco(ctx: CanvasRenderingContext2D, skin: Skin, color: string, deg: number) {
  if (skin.headerDeco === 'tape') {
    const cx = CARD_W / 2;
    const cy = 96;
    const w = 300;
    const h = 74;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    roundRect(ctx, -w / 2, -h / 2, w, h, 6);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fdfcf7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 12, -h / 6);
    ctx.lineTo(w / 2 - 12, -h / 6);
    ctx.moveTo(-w / 2 + 12, h / 6);
    ctx.lineTo(w / 2 - 12, h / 6);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  } else {
    // 짧은 강조선
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(CARD_W / 2 - 48, 110);
    ctx.lineTo(CARD_W / 2 + 48, 110);
    ctx.stroke();
    ctx.restore();
  }
}

/** 사진 프레임 (테마별 매트·테두리·그림자) — cover-fit */
function photoFrame(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap | HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  deg: number,
  skin: Skin,
) {
  const { mat, pad, radius, shadow, border } = skin.frame;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((deg * Math.PI) / 180);
  if (shadow > 0) {
    ctx.shadowColor = `rgba(20,16,12,${shadow})`;
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 11;
  }
  ctx.fillStyle = mat;
  roundRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    roundRect(ctx, -w / 2, -h / 2, w, h, radius);
    ctx.stroke();
  }
  const iw = 'width' in img ? img.width : 0;
  const ih = 'height' in img ? img.height : 0;
  const dw = w - pad * 2;
  const dh = h - pad * 2;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  ctx.save();
  roundRect(ctx, -w / 2 + pad, -h / 2 + pad, dw, dh, Math.max(2, radius - 4));
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

/** 사진이 없을 때 가운데를 채우는 점선 하트 낙서 */
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

/** "서울 마포구", "강원 춘천시" → "#서울 #마포구 #강원 #춘천시" (중복 제거) */
function toHashtags(names: string[]): string {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    for (const part of name.split(/\s+/)) {
      const t = part.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      tags.push(`#${t}`);
    }
  }
  return tags.join(' ');
}

/** 좌하단 정복 지역 — 인스타 감성 해시태그 (#부산 #해운대구…), 최대 2줄 */
function paintRegionHashtags(ctx: CanvasRenderingContext2D, names: string[], color: string) {
  const text = toHashtags(names);
  if (!text) return;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  // 워터마크(우하단)와 겹치지 않게 폭 제한
  const lines = wrapText(ctx, text, CARD_W - 360, 2);
  const baseY = CARD_H - 66;
  for (const [i, line] of lines.entries()) {
    ctx.fillText(line, 64, baseY - (lines.length - 1 - i) * 42);
  }
}

function paintWatermark(ctx: CanvasRenderingContext2D, skin: Skin) {
  ctx.font = `600 28px ${FONT}`;
  ctx.fillStyle = skin.ink;
  ctx.globalAlpha = 0.5;
  ctx.textAlign = 'right';
  ctx.fillText('우리의 도화지 🖍️', CARD_W - 64, CARD_H - 64);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

/** total: 전체 사진 수 — 그리드에 못 실린 만큼 마지막 프레임에 "+N" 스티커 */
function paintPhotoGrid(
  ctx: CanvasRenderingContext2D,
  images: (ImageBitmap | null)[],
  top: number,
  height: number,
  skin: Skin,
  total = 0,
) {
  const shots = images.filter((i): i is ImageBitmap => i !== null).slice(0, 4);
  const cx = CARD_W / 2;
  if (shots.length === 0) return;
  const places: [number, number, number, number, number][] = [];
  if (shots.length === 1) {
    places.push([cx - 400, top, 800, height, -1.6]);
  } else if (shots.length === 2) {
    places.push([cx - 420, top + 14, 410, height - 30, -2.2], [cx + 14, top, 410, height - 30, 1.8]);
  } else {
    const w = 405;
    const h = (height - 26) / 2;
    places.push([cx - 420, top, w, h, -2], [cx + 16, top + 10, w, h, 1.6], [cx - 414, top + h + 22, w, h, 1.4]);
    if (shots[3]) places.push([cx + 10, top + h + 30, w, h, -1.8]);
  }
  for (const [i, shot] of shots.entries()) {
    const [x, y, w, h, deg] = places[i];
    photoFrame(ctx, shot, x, y, w, h, deg, skin);
  }
  const extra = Math.max(0, total - shots.length);
  if (extra > 0) {
    const [x, y, w, h] = places[shots.length - 1];
    const bx = x + w - 28;
    const by = y + h - 28;
    ctx.beginPath();
    ctx.arc(bx, by, 46, 0, Math.PI * 2);
    ctx.fillStyle = skin.badgeBg;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = `700 34px ${FONT}`;
    ctx.fillStyle = skin.badgeInk;
    ctx.textAlign = 'center';
    ctx.fillText(`+${extra}`, bx, by + 12);
  }
}

// ── 기록 카드 ────────────────────────────────────────────────────
export interface RecordCardData {
  date: string;
  spotNames: string[];
  memo: string | null;
  regionNames: string[];
  photoUrls: string[];
  theme?: ShareTheme;
}

/** 데이트 기록 카드 — 지출은 명세 §4 원칙대로 넣지 않는다 */
export async function paintRecordCard(canvas: HTMLCanvasElement, data: RecordCardData) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 미지원');
  const skin = resolveSkin(data.theme);
  const accent = skin.accentFor('#e8637c');
  const images = await Promise.all(data.photoUrls.slice(0, 4).map(loadImage));

  skin.paintBg(ctx);
  paintHeaderDeco(ctx, skin, accent, -3.5);

  ctx.fillStyle = skin.ink;
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
  if (hasPhotos) paintPhotoGrid(ctx, images, 420, 620, skin, data.photoUrls.length);

  if (data.memo) {
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.78;
    ctx.textAlign = 'center';
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

  paintRegionHashtags(ctx, data.regionNames, accent);
  paintWatermark(ctx, skin);
}

// ── 오늘(하루) 카드 ──────────────────────────────────────────────
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
  theme?: ShareTheme;
  /** 사용자가 직접 넣는 한마디 (선택) — 사진 아래 인용구로 */
  caption?: string | null;
}

export async function paintDayCard(canvas: HTMLCanvasElement, data: DayCardData) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 미지원');
  const skin = resolveSkin(data.theme);
  const accent = skin.accentFor('#f2c14e');
  const images = await Promise.all(data.photoUrls.slice(0, 2).map(loadImage));

  skin.paintBg(ctx);
  paintHeaderDeco(ctx, skin, accent, 3);

  ctx.fillStyle = skin.ink;
  ctx.textAlign = 'center';
  ctx.font = `700 54px ${FONT}`;
  const [y, m, d] = data.date.split('-');
  ctx.fillText(`${y}년 ${Number(m)}월 ${Number(d)}일의 우리`, CARD_W / 2, 214);

  if (data.myMood || data.partnerMood) {
    ctx.font = `400 110px ${FONT}`;
    ctx.fillText(`${data.myMood ?? ''}  ${data.partnerMood ?? ''}`.trim(), CARD_W / 2, 380);
  }

  let bubbleY = 460;
  const bubble = (label: string, text: string, align: 'left' | 'right', color: string) => {
    ctx.font = `500 34px ${FONT}`;
    const lines = wrapText(ctx, text, 640, 2);
    const w = Math.min(700, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 60);
    const h = 40 + lines.length * 48;
    const x = align === 'left' ? 80 : CARD_W - 80 - w;
    ctx.fillStyle = color;
    ctx.globalAlpha = skin.bubbleAlpha;
    roundRect(ctx, x, bubbleY, w, h, 22);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = skin.bubbleInk;
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
  if (data.myNote) bubble('나', data.myNote, 'left', skin.bubbleMe);
  if (data.partnerNote) bubble('짝꿍', data.partnerNote, 'right', skin.bubblePartner);

  if (data.question && (data.myAnswer || data.partnerAnswer)) {
    ctx.textAlign = 'center';
    ctx.fillStyle = skin.ink;
    ctx.font = `700 36px ${FONT}`;
    ctx.globalAlpha = 0.85;
    for (const [i, line] of wrapText(ctx, `Q. ${data.question}`, CARD_W - 220, 2).entries()) {
      ctx.fillText(line, CARD_W / 2, bubbleY + i * 50);
    }
    ctx.globalAlpha = 1;
    bubbleY += 76;
    ctx.font = `500 32px ${FONT}`;
    ctx.globalAlpha = 0.75;
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

  // 문구가 있으면 하단에 인용구 자리를 비워둔다
  const caption = data.caption?.trim();
  const bottomReserve = caption ? 200 : 110;
  const photoTop = Math.max(bubbleY + 20, 780);
  const photoH = Math.min(430, CARD_H - bottomReserve - photoTop);
  if (photoH >= 200) paintPhotoGrid(ctx, images, photoTop, photoH, skin, data.photoUrls.length);

  if (caption) {
    ctx.textAlign = 'center';
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.8;
    ctx.font = `500 36px ${FONT}`;
    const lines = wrapText(ctx, `“${caption}”`, CARD_W - 240, 2);
    const capY = CARD_H - 150 - (lines.length - 1) * 46;
    for (const [i, line] of lines.entries()) ctx.fillText(line, CARD_W / 2, capY + i * 46);
    ctx.globalAlpha = 1;
  }

  paintWatermark(ctx, skin);
}

// ── 종합(리캡) 카드 ──────────────────────────────────────────────
export interface RecapCardData {
  title: string;
  stats: { value: string; label: string }[];
  regionNames: string[];
  photoUrls: string[];
  photoTotal?: number;
  footer: string | null;
  theme?: ShareTheme;
}

export async function paintRecapCard(canvas: HTMLCanvasElement, data: RecapCardData) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 미지원');
  const skin = resolveSkin(data.theme);
  const accent = skin.accentFor('#8cab68');
  const images = await Promise.all(data.photoUrls.slice(0, 4).map(loadImage));

  skin.paintBg(ctx);
  paintHeaderDeco(ctx, skin, accent, -2.5);

  ctx.fillStyle = skin.ink;
  ctx.textAlign = 'center';
  ctx.font = `700 58px ${FONT}`;
  ctx.fillText(data.title, CARD_W / 2, 220);

  const hasPhotos = images.some((i) => i !== null);

  const stats = data.stats.slice(0, 3);
  const statsTop = hasPhotos ? 300 : 420;
  const colW = (CARD_W - 160) / stats.length;
  for (const [i, s] of stats.entries()) {
    const x = 80 + colW * i + colW / 2;
    ctx.font = `700 ${hasPhotos ? 72 : 84}px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.fillText(s.value, x, statsTop + 72);
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.65;
    ctx.fillText(s.label, x, statsTop + 128);
    ctx.globalAlpha = 1;
  }

  if (hasPhotos) {
    paintPhotoGrid(ctx, images, 490, 560, skin, data.photoTotal ?? data.photoUrls.length);
  } else {
    heartDoodle(ctx, CARD_W / 2, 830, 300, accent);
  }

  if (data.footer) {
    ctx.font = `500 36px ${FONT}`;
    ctx.fillStyle = skin.ink;
    ctx.globalAlpha = 0.72;
    ctx.textAlign = 'center';
    ctx.fillText(data.footer, CARD_W / 2, 1130);
    ctx.globalAlpha = 1;
  }

  paintRegionHashtags(ctx, data.regionNames, accent);
  paintWatermark(ctx, skin);
}

/** 카드 → PNG Blob */
export function cardToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 생성 실패'))), 'image/png');
  });
}
