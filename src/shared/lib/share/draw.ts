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

/** 줄바꿈 — 넘치면 마지막 줄 끝을 말줄임 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
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
export function desaturated(
  img: ImageBitmap | HTMLImageElement,
  amount: number,
): HTMLCanvasElement | null {
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
export function tuned(p: Painter, img: ImageBitmap | HTMLImageElement): Drawable {
  return (p.skin.photoDesaturate ? desaturated(img, p.skin.photoDesaturate) : null) ?? img;
}

/** cover-fit 그리기 — 지정한 상자를 꽉 채우고 넘치는 부분은 잘라낸다 (실제 픽셀) */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: Drawable,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = img.width;
  const ih = img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
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

/** 사진 프레임 (테마별 매트·테두리·그림자) — 1080×1350 기준 좌표 */
export function photoFrame(
  p: Painter,
  img: ImageBitmap | HTMLImageElement,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  deg: number,
) {
  const { ctx, skin } = p;
  const { mat, radius, shadow, border } = skin.frame;
  const pad = skin.frame.pad * p.s;
  const r = radius * p.s;
  const w = p.x(bw);
  const h = p.vh(bh);
  ctx.save();
  ctx.translate(p.x(bx + bw / 2), p.y(by + bh / 2));
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
  drawCover(ctx, tuned(p, img), -w / 2 + pad, -h / 2 + pad, dw, dh);
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

export async function loadImage(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
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
    ctx.fillText(line, p.x(64), p.y(1350 - 66 - (lines.length - 1 - i) * 42));
  }
}

export function paintWatermark(p: Painter, alpha = 0.5) {
  const { ctx } = p;
  ctx.font = p.font(p.skin.body, 30, 600);
  ctx.fillStyle = p.skin.ink;
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'right';
  ctx.fillText('우리의 도화지 🖍️', p.x(1080 - 64), p.y(1350 - 64));
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

/** total: 전체 사진 수 — 그리드에 못 실린 만큼 마지막 프레임에 "+N" 스티커 */
export function paintPhotoGrid(
  p: Painter,
  images: (ImageBitmap | null)[],
  top: number,
  height: number,
  total = 0,
) {
  const { ctx, skin } = p;
  const shots = images.filter((i): i is ImageBitmap => i !== null).slice(0, 4);
  if (shots.length === 0) return;
  const cx = 540;
  const places: [number, number, number, number, number][] = [];
  if (shots.length === 1) {
    places.push([cx - 400, top, 800, height, -1.6]);
  } else if (shots.length === 2) {
    places.push([cx - 420, top + 14, 410, height - 30, -2.2], [cx + 14, top, 410, height - 30, 1.8]);
  } else {
    const w = 405;
    const h = (height - 26) / 2;
    places.push(
      [cx - 420, top, w, h, -2],
      [cx + 16, top + 10, w, h, 1.6],
      [cx - 414, top + h + 22, w, h, 1.4],
    );
    if (shots[3]) places.push([cx + 10, top + h + 30, w, h, -1.8]);
  }
  for (const [i, shot] of shots.entries()) {
    const [x, y, w, h, deg] = places[i];
    photoFrame(p, shot, x, y, w, h, deg);
  }
  const extra = Math.max(0, total - shots.length);
  if (extra > 0) {
    const [x, y, w, h] = places[shots.length - 1];
    const bx = p.x(x + w - 28);
    const by = p.y(y + h - 28);
    ctx.beginPath();
    ctx.arc(bx, by, 46 * p.s, 0, Math.PI * 2);
    ctx.fillStyle = skin.badgeBg;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = p.font(skin.title, 34);
    ctx.fillStyle = skin.badgeInk;
    ctx.textAlign = 'center';
    ctx.fillText(`+${extra}`, bx, by + 12 * p.s);
  }
}
