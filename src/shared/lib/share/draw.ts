/**
 * 그리기 기본기 — 모든 레이아웃이 공유한다.
 *
 * 좌표 규칙: 이 파일의 함수는 **1080×1350 기준 좌표**를 받고,
 * 내부에서 painter(p.x/p.y/p.vh)로 실제 픽셀로 옮긴다.
 * roundRect처럼 경로만 그리는 저수준 함수만 실제 픽셀을 받는다.
 */
import type { Painter } from './types';

/** 실제 픽셀 좌표로 둥근 사각형 경로 */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * 글자를 **자소 단위**로 쪼갠다.
 * ❤️(U+2764 U+FE0F)나 가족 이모지처럼 여러 코드포인트가 한 글자를 이루는 경우가 있어,
 * 코드포인트나 코드유닛으로 자르면 줄 끝에서 이모지가 반토막 나 깨져 보인다.
 */
function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } })
    .Segmenter;
  if (Seg) {
    try {
      return [...new Seg('ko', { granularity: 'grapheme' }).segment(text)].map((g) => g.segment);
    } catch {
      // 폴백으로 내려간다
    }
  }
  // 폴백: 코드포인트로 쪼개되 결합 문자(이모지 변형 선택자·ZWJ·피부색)는 앞 글자에 붙인다
  const out: string[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const joins =
      code === 0xfe0f || code === 0x200d || (code >= 0x1f3fb && code <= 0x1f3ff) || (code >= 0x20d0 && code <= 0x20ff);
    if (out.length > 0 && (joins || out[out.length - 1].endsWith('\u200d'))) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/** 줄바꿈 — 넘치면 마지막 줄 끝을 말줄임 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  const cells = graphemes(text);
  let line = '';
  for (const ch of cells) {
    if (ctx.measureText(line + ch).width > maxWidth || ch === '\n') {
      lines.push(line);
      line = ch === '\n' ? '' : ch;
      if (lines.length === maxLines) {
        const cut = graphemes(lines[maxLines - 1]);
        cut.pop();
        lines[maxLines - 1] = cut.join('') + '…';
        return lines;
      }
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * 글자 넘침 방지 (계획 §7) — 줄 수 안에 들어갈 때까지 글자를 줄이고,
 * 최소 크기에서도 넘치면 그때만 말줄임한다. 잘라내기보다 축소가 먼저다.
 */
export function fitLines(
  p: Painter,
  text: string,
  opts: { family: string; size: number; min?: number; weight?: number; maxWidth: number; maxLines: number },
): { lines: string[]; size: number } {
  const min = opts.min ?? Math.round(opts.size * 0.62);
  const width = p.x(opts.maxWidth);
  for (let size = opts.size; size >= min; size -= 2) {
    p.ctx.font = p.font(opts.family, size, opts.weight);
    const lines = wrapText(p.ctx, text, width, opts.maxLines + 1);
    if (lines.length <= opts.maxLines && !lines[lines.length - 1]?.endsWith('…')) {
      return { lines, size };
    }
  }
  p.ctx.font = p.font(opts.family, min, opts.weight);
  return { lines: wrapText(p.ctx, text, width, opts.maxLines), size: min };
}

/** 가운데 정렬 여러 줄 — 시작 y(기준선)와 줄 간격은 1080×1350 기준 */
export function centerLines(p: Painter, lines: string[], y: number, lineHeight: number) {
  p.ctx.textAlign = 'center';
  for (const [i, line] of lines.entries()) {
    p.ctx.fillText(line, p.W / 2, p.y(y + i * lineHeight));
  }
}

/** 제목 위 장식 — 도화지는 마스킹테이프, 나머지는 짧은 강조선 */
export function paintHeaderDeco(p: Painter, color: string, deg: number, cy = 96) {
  const { ctx, skin } = p;
  if (skin.headerDeco === 'tape') {
    const w = p.x(300);
    const h = p.vh(74);
    ctx.save();
    ctx.translate(p.W / 2, p.y(cy));
    ctx.rotate((deg * Math.PI) / 180);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    roundRect(ctx, -w / 2, -h / 2, w, h, 6 * p.s);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fdfcf7';
    ctx.lineWidth = 3 * p.s;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 12 * p.s, -h / 6);
    ctx.lineTo(w / 2 - 12 * p.s, -h / 6);
    ctx.moveTo(-w / 2 + 12 * p.s, h / 6);
    ctx.lineTo(w / 2 - 12 * p.s, h / 6);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  } else {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5 * p.s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.W / 2 - p.x(48), p.y(cy + 14));
    ctx.lineTo(p.W / 2 + p.x(48), p.y(cy + 14));
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 사진 채도 낮추기 — 픽셀 루프(휘도 혼합)라 어느 브라우저에서든 결과가 같다.
 * 실패(컨텍스트 미지원 등) 시 null — 호출부가 원본으로 폴백해 사진이 빠지는 일은 없다.
 */
export function desaturated(img: Drawable, amount: number): HTMLCanvasElement | null {
  const iw = img.width;
  const ih = img.height;
  if (!iw || !ih) return null;
  // 카드 안 사진은 1080px 이하 — 원본이 커도 이만큼이면 충분 (풀블리드는 전폭이라 여유를 둔다)
  const scale = Math.min(1, 1400 / Math.max(iw, ih));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(iw * scale));
  c.height = Math.max(1, Math.round(ih * scale));
  const x = c.getContext('2d');
  if (!x) return null;
  try {
    x.drawImage(img, 0, 0, c.width, c.height);
    const data = x.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] += (g - d[i]) * amount;
      d[i + 1] += (g - d[i + 1]) * amount;
      d[i + 2] += (g - d[i + 2]) * amount;
    }
    x.putImageData(data, 0, 0);
  } catch {
    return null;
  }
  return c;
}

export type Drawable = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

/** 테마 보정을 입힌 사진 원본 — 실패하면 원본 그대로 (사진이 빠지는 것보다 낫다) */
export function tuned(p: Painter, img: Drawable): Drawable {
  return (p.skin.photoDesaturate ? desaturated(img, p.skin.photoDesaturate) : null) ?? img;
}

/**
 * cover-fit 그리기 — 지정한 상자를 꽉 채우고 넘치는 부분은 잘라낸다 (실제 픽셀).
 * bias: 세로로 어디를 남길지 (0 = 위, 0.5 = 가운데, 1 = 아래).
 *   커플 사진은 인물이 많고 얼굴은 위쪽에 있어 기본을 살짝 위로 둔다 — 가운데로 자르면 얼굴이 잘린다.
 */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: Drawable,
  x: number,
  y: number,
  w: number,
  h: number,
  bias = 0.38,
) {
  const iw = img.width;
  const ih = img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) * bias, sw, sh, x, y, w, h);
}

/**
 * 글자 그리기 — 넘치면 그 자리에서 눌러 담는다.
 *
 * measureText로 잰 폭과 실제로 그려지는 폭은 어긋날 수 있다 (이모지가 섞이거나 웹폰트가
 * 폴백으로 대체될 때). 가운데·오른쪽 정렬에서는 그 차이가 그대로 카드 밖으로 밀려 나가
 * 글자가 잘려 보였다. fillText의 maxWidth는 브라우저가 강제로 폭을 맞춰 주므로
 * 측정이 틀려도 카드를 벗어나지 않는다 — 마지막 방어선.
 */
export function drawText(p: Painter, text: string, x: number, y: number, maxWidth: number) {
  p.ctx.fillText(text, x, y, Math.max(1, maxWidth));
}

/** 사진 위 테마 색보정 (실제 픽셀 상자) */
export function tintOver(p: Painter, x: number, y: number, w: number, h: number) {
  const { ctx } = p;
  for (const t of p.skin.photoTint) {
    ctx.globalCompositeOperation = t.mode;
    ctx.globalAlpha = t.alpha;
    ctx.fillStyle = t.color;
    ctx.fillRect(x, y, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/**
 * 사진 한 장 + 매트·테두리·그림자 — **실제 픽셀** 중심·크기를 받는다.
 * 크기는 이미 사진 비율에 맞춰져 있다고 보고 그대로 채운다 (자르지 않는다).
 */
export function drawFramedPhoto(
  p: Painter,
  img: Drawable,
  cx: number,
  cy: number,
  w: number,
  h: number,
  deg: number,
) {
  const { ctx, skin } = p;
  const { mat, radius, shadow, border } = skin.frame;
  const pad = skin.frame.pad * p.s;
  const r = radius * p.s;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  if (shadow > 0) {
    ctx.shadowColor = `rgba(20,16,12,${shadow})`;
    ctx.shadowBlur = 26 * p.s;
    ctx.shadowOffsetY = 11 * p.s;
  }
  ctx.fillStyle = mat;
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 2 * p.s;
    roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.stroke();
  }
  const dw = w - pad * 2;
  const dh = h - pad * 2;
  ctx.save();
  roundRect(ctx, -w / 2 + pad, -h / 2 + pad, dw, dh, Math.max(2, r - 4 * p.s));
  ctx.clip();
  // 비율을 맞춰 놨으므로 잘릴 일이 없다 (반올림 오차만 흡수)
  drawCover(ctx, tuned(p, img), -w / 2 + pad, -h / 2 + pad, dw, dh, 0.5);
  tintOver(p, -w / 2 + pad, -h / 2 + pad, dw, dh);
  ctx.restore();
  ctx.restore();
}

/** 필름/종이 그레인 — 작은 노이즈 타일을 overlay로 깔아 밋밋함을 없앤다 */
export function paintGrain(p: Painter, strength = p.skin.grain) {
  if (strength <= 0) return;
  const { ctx } = p;
  const tile = document.createElement('canvas');
  tile.width = tile.height = 128;
  const tctx = tile.getContext('2d');
  if (!tctx) return;
  const img = tctx.createImageData(128, 128);
  const maxA = Math.round(strength * 42);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.random() * maxA;
  }
  tctx.putImageData(img, 0, 0);
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, p.W, p.H);
  ctx.restore();
}

/** 카드 한 장에 들어가는 사진의 최대 변 — 이보다 크면 줄여서 쓴다 */
const MAX_PHOTO_EDGE = 1400;

/**
 * 사진 받아오기 — **항상 적당한 크기로 줄여서** 돌려준다.
 *
 * iOS Safari는 캔버스·이미지 메모리 한도가 낮아, 큰 원본을 여러 장 그리면 그중 일부가
 * 아무 오류 없이 빈 칸으로 나온다. 실제로 채도 보정이 있는 테마(빈티지·미니멀)는 보정
 * 과정에서 축소본을 만들어 멀쩡했고, 보정이 없는 테마(도화지·필름·파스텔)만 사진이
 * 빠졌다 — 원본을 그대로 그렸기 때문이다. 여기서 한 번 줄여 두면 테마와 무관하게 안전하다.
 */
export async function loadImage(url: string): Promise<Drawable | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    let src: Drawable;
    try {
      src = await createImageBitmap(blob);
    } catch {
      // createImageBitmap이 못 읽는 포맷 — <img>로 한 번 더 시도한다
      src = await decodeWithImgTag(blob);
    }
    return shrinkToFit(src);
  } catch {
    return null;
  }
}

function decodeWithImgTag(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      resolve(im);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지 디코딩 실패'));
    };
    im.src = url;
  });
}

/** 최대 변을 넘으면 캔버스로 줄인 사본을 만든다 (원본 비트맵은 닫아 메모리를 돌려준다) */
function shrinkToFit(img: Drawable): Drawable {
  const iw = img.width;
  const ih = img.height;
  const longest = Math.max(iw, ih);
  if (!longest || longest <= MAX_PHOTO_EDGE) return img;
  const k = MAX_PHOTO_EDGE / longest;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(iw * k));
  c.height = Math.max(1, Math.round(ih * k));
  const x = c.getContext('2d');
  if (!x) return img;
  try {
    x.drawImage(img, 0, 0, c.width, c.height);
  } catch {
    return img;
  }
  if (typeof (img as ImageBitmap).close === 'function') (img as ImageBitmap).close();
  return c;
}

/** 사진이 없을 때 가운데를 채우는 점선 하트 낙서 — 1080×1350 기준 */
export function heartDoodle(p: Painter, cx: number, cy: number, size: number, color: string) {
  const { ctx } = p;
  const s = p.x(size) / 2;
  ctx.save();
  ctx.translate(p.x(cx), p.y(cy));
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
  ctx.lineWidth = 6 * p.s;
  ctx.setLineDash([26 * p.s, 14 * p.s]);
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** "서울 마포구", "강원 춘천시" → "#서울 #마포구 #강원 #춘천시" (중복 제거) */
export function toHashtags(names: string[]): string {
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
export function paintRegionHashtags(p: Painter, names: string[], color: string) {
  const text = toHashtags(names);
  if (!text) return;
  const { ctx } = p;
  ctx.font = p.font(p.skin.body, 32, 700);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  // 워터마크(우하단)와 겹치지 않게 폭 제한
  const lines = wrapText(ctx, text, p.x(1080 - 360), 2);
  for (const [i, line] of lines.entries()) {
    drawText(p, line, p.x(64), p.y(1350 - 66 - (lines.length - 1 - i) * 42), p.x(1080 - 360));
  }
}

export function paintWatermark(p: Painter, alpha = 0.5) {
  const { ctx } = p;
  ctx.font = p.font(p.skin.body, 30, 600);
  ctx.fillStyle = p.skin.ink;
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'right';
  drawText(p, '우리의 도화지 🖍️', p.x(1080 - 64), p.y(1350 - 64), p.x(320));
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

/**
 * 사진 그리드 — 사진 비율을 보고 배치를 정한다.
 *
 * 칸을 꽉 채우려고 자르지 않는다. 대신 사진 비율에 맞춰 프레임 크기를 구하고,
 * 그 실제 크기로 줄을 가운데 정렬한다 — 세로 사진만 있어도 좌우가 성겨 보이지 않는다.
 * total: 전체 사진 수 — 그리드에 못 실린 만큼 마지막 프레임에 "+N" 스티커.
 * 실제로 사진이 끝난 y(1080×1350 기준)를 돌려준다 — 아래 글자를 붙여 놓기 위해.
 */
export function paintPhotoGrid(
  p: Painter,
  images: (Drawable | null)[],
  top: number,
  height: number,
  total = 0,
): number {
  const { ctx, skin } = p;
  const shots = images.filter((i): i is Drawable => i !== null).slice(0, 4);
  if (shots.length === 0) return top;

  const pad = skin.frame.pad * p.s;
  const areaX = p.x(64);
  const areaW = p.x(952);
  const areaY = p.y(top);
  const areaH = p.vh(height);
  const gap = 18 * p.s;
  // 사진 크기 슬라이더 — 칸을 크게 넘어서면 서로 겹치므로 위쪽만 살짝 묶어 둔다
  const scale = Math.min(1.12, p.photoScale);

  const ars = shots.map((s) => (s.width && s.height ? s.width / s.height : 1));
  const allPortrait = ars.every((a) => a < 0.95);
  // 줄 나누기 — 세로 사진 3장은 한 줄에 나란히 놓아야 꽉 찬다
  let rows: number[][];
  if (shots.length === 1) rows = [[0]];
  else if (shots.length === 2) rows = [[0, 1]];
  else if (shots.length === 3) rows = allPortrait ? [[0, 1, 2]] : [[0, 1], [2]];
  else rows = [[0, 1], [2, 3]];

  const rowH = (areaH - gap * (rows.length - 1)) / rows.length;
  const tilts = [-2, 1.6, 1.4, -1.8];
  let lastCell: { cx: number; cy: number; w: number; h: number } | null = null;

  // 줄마다 실제 크기를 먼저 구한다 — 사진이 칸보다 작으면 그만큼 위로 붙여 빈 공간을 없앤다
  const laid = rows.map((row) => {
    const cellW = (areaW - gap * (row.length - 1)) / row.length;
    const sizes = row.map((i) => {
      const innerW = cellW - pad * 2;
      const innerH = rowH - pad * 2;
      let pw = innerW;
      let ph = innerH;
      if (innerW / innerH > ars[i]) pw = innerH * ars[i];
      else ph = innerW / ars[i];
      return { w: (pw + pad * 2) * scale, h: (ph + pad * 2) * scale };
    });
    return { row, sizes, h: Math.max(...sizes.map((s2) => s2.h)) };
  });
  const usedH = laid.reduce((a, b) => a + b.h, 0) + gap * (laid.length - 1);
  // 남는 공간은 위아래로 반반 — 사진이 작게 들어간 날에도 카드가 위로 쏠리지 않게
  let bandY = areaY + Math.max(0, (areaH - usedH) / 2);

  for (const { row, sizes, h: bandH } of laid) {
    const rowW = sizes.reduce((a, b) => a + b.w, 0) + gap * (row.length - 1);
    let x = areaX + (areaW - rowW) / 2;
    for (const [k, i] of row.entries()) {
      const { w, h } = sizes[k];
      const cx = x + w / 2;
      const cy = bandY + bandH / 2;
      drawFramedPhoto(p, shots[i], cx, cy, w, h, tilts[i % tilts.length]);
      lastCell = { cx, cy, w, h };
      x += w + gap;
    }
    bandY += bandH + gap;
  }
  const endY = bandY - gap;

  const extra = Math.max(0, total - shots.length);
  if (extra > 0 && lastCell) {
    const bx = lastCell.cx + lastCell.w / 2 - 28 * p.s;
    const by = lastCell.cy + lastCell.h / 2 - 28 * p.s;
    ctx.beginPath();
    ctx.arc(bx, by, 46 * p.s, 0, Math.PI * 2);
    ctx.fillStyle = skin.badgeBg;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = p.font(skin.title, 34);
    ctx.fillStyle = skin.badgeInk;
    ctx.textAlign = 'center';
    drawText(p, `+${extra}`, bx, by + 12 * p.s, 76 * p.s);
  }
  // 실제로 쓴 아래 끝을 1080×1350 좌표로 되돌려 준다
  return top + (endY - areaY) / (areaH / height);
}
