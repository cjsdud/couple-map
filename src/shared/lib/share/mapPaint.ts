/**
 * 캔버스용 정복 지도 — 공유 카드의 차별화 요소 (계획 §4-④).
 *
 * 화면의 `ConquestMap`(SVG)과 **같은 투영**을 쓴다: 위도 36° 기준 등장방형 근사로
 * 폭 800짜리 좌표계를 만든다. 여기서는 그 좌표계를 카드 안 상자에 맞춰 넣기만 한다.
 * GeoJSON은 한 번만 받아 Path2D로 캐시한다 (테마·비율을 바꿔도 다시 만들지 않는다).
 */
import { roundRect } from './draw';
import type { Painter } from './types';

type Ring = [number, number][];
interface GeoFeature {
  properties: { code: string; name: string };
  geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
}
interface GeoFile {
  features: GeoFeature[];
}

/** 투영 좌표계 폭 — ConquestMap과 동일 */
const PROJ_W = 800;

interface ProjectedRegion {
  code: string;
  name: string;
  path: Path2D;
  /** 본체 bbox — 라벨 자리 판정용 */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

interface Projection {
  regions: ProjectedRegion[];
  sido: Path2D;
  height: number;
  toXY: (lng: number, lat: number) => [number, number];
}

let cached: Promise<Projection | null> | null = null;

/** 시군구·시도 GeoJSON을 받아 투영 + Path2D 캐시 (모듈 수명 동안 1회) */
export function loadMapProjection(): Promise<Projection | null> {
  if (cached) return cached;
  cached = (async () => {
    try {
      const [sgRes, sdRes] = await Promise.all([fetch('/geo/sigungu.json'), fetch('/geo/sido.json')]);
      if (!sgRes.ok) return null;
      const sigungu = (await sgRes.json()) as GeoFile;
      const sido = sdRes.ok ? ((await sdRes.json()) as GeoFile) : { features: [] };

      const K = Math.cos((36 * Math.PI) / 180);
      const project = ([lng, lat]: [number, number]): [number, number] => [lng * K, -lat];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      const eachRing = (file: GeoFile, fn: (ring: Ring, feature: GeoFeature, ringIdx: number) => void) => {
        for (const f of file.features) {
          const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
          for (const poly of polys) for (const [i, ring] of poly.entries()) fn(ring, f, i);
        }
      };
      eachRing(sigungu, (ring) => {
        for (const pt of ring) {
          const [x, y] = project(pt);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      });
      if (!Number.isFinite(minX)) return null;
      const scale = PROJ_W / (maxX - minX);
      const height = (maxY - minY) * scale;
      const toXY = (lng: number, lat: number): [number, number] => {
        const [x, y] = project([lng, lat]);
        return [(x - minX) * scale, (y - minY) * scale];
      };

      const regions: ProjectedRegion[] = sigungu.features.map((f) => {
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        const path = new Path2D();
        // 라벨 자리: 가장 큰 폴리곤(본체)의 bbox 중심 — 섬이 딸린 지역 보정
        let best = -1;
        let cx = 0;
        let cy = 0;
        let w = 0;
        let h = 0;
        for (const poly of polys) {
          for (const [i, ring] of poly.entries()) {
            let mnx = Infinity;
            let mny = Infinity;
            let mxx = -Infinity;
            let mxy = -Infinity;
            for (const [j, pt] of ring.entries()) {
              const [px, py] = toXY(pt[0], pt[1]);
              if (j === 0) path.moveTo(px, py);
              else path.lineTo(px, py);
              if (px < mnx) mnx = px;
              if (px > mxx) mxx = px;
              if (py < mny) mny = py;
              if (py > mxy) mxy = py;
            }
            path.closePath();
            if (i === 0) {
              const area = (mxx - mnx) * (mxy - mny);
              if (area > best) {
                best = area;
                cx = (mnx + mxx) / 2;
                cy = (mny + mxy) / 2;
                w = mxx - mnx;
                h = mxy - mny;
              }
            }
          }
        }
        return { code: f.properties.code, name: f.properties.name, path, cx, cy, w, h };
      });

      const sidoPath = new Path2D();
      eachRing(sido, (ring) => {
        for (const [j, pt] of ring.entries()) {
          const [px, py] = toXY(pt[0], pt[1]);
          if (j === 0) sidoPath.moveTo(px, py);
          else sidoPath.lineTo(px, py);
        }
        sidoPath.closePath();
      });

      return { regions, sido: sidoPath, height, toXY };
    } catch {
      return null;
    }
  })();
  return cached;
}

/** 방문 횟수별 색칠 진하기 — ConquestMap과 동일 (덧칠 = 진하기, 명세 §3.1) */
const TIER_OPACITY = [0, 0.42, 0.54, 0.66, 0.78, 0.9];
const tierOf = (n: number) => Math.max(0, Math.min(n, 5));

export interface MapPin {
  lng: number;
  lat: number;
  label?: string;
}

export interface MapPaintOptions {
  /** 시군구 코드 → 방문 스팟 수 (칠하기 진하기) */
  visitCounts: Record<string, number>;
  /** 이번 카드의 스팟 — 코스 순서대로 */
  pins: MapPin[];
  /** 'pins' = 핀 주변만 확대, 'all' = 전국 */
  focus: 'pins' | 'all';
  /** 확대했을 때 지역 이름을 적을지 */
  showNames?: boolean;
}

/** 카드 안 지도 상자 (1080×1350 기준) */
export interface MapBox {
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
}

/**
 * 카드 안에 지도를 그린다. GeoJSON을 못 받으면 false — 호출부가 대체 구성을 쓴다.
 */
export async function paintMap(p: Painter, box: MapBox, opts: MapPaintOptions): Promise<boolean> {
  const proj = await loadMapProjection();
  if (!proj) return false;
  const { ctx } = p;
  const m = p.skin.map;

  const bx = p.x(box.x);
  const by = p.y(box.y);
  const bw = p.x(box.w);
  const bh = p.vh(box.h);
  const radius = (box.radius ?? 24) * p.s;

  // ① 볼 범위 정하기 — 핀 주변(여백 넉넉히) 또는 전국
  const pts = opts.pins.map((pin) => proj.toXY(pin.lng, pin.lat));
  let mnx = Infinity;
  let mny = Infinity;
  let mxx = -Infinity;
  let mxy = -Infinity;
  for (const [x, y] of pts) {
    if (x < mnx) mnx = x;
    if (x > mxx) mxx = x;
    if (y < mny) mny = y;
    if (y > mxy) mxy = y;
  }
  let vx: number;
  let vy: number;
  let vw: number;
  let vh: number;
  if (opts.focus === 'pins' && pts.length > 0) {
    // 핀만 꽉 채우면 어디인지 알 수 없고, 너무 넓히면 점 세 개짜리 지도가 된다.
    // 투영 1단위 ≈ 0.6km. 한 동네 데이트는 13km쯤, 멀리 다닌 날은 핀이 다 들어오게 넓힌다.
    const spread = Math.max(mxx - mnx, mxy - mny);
    const span = Math.max(spread * 1.4 + 6, Math.min(Math.max(spread * 4, 22), 70));
    const cx = (mnx + mxx) / 2;
    const cy = (mny + mxy) / 2;
    vx = cx - span / 2;
    vy = cy - span / 2;
    vw = span;
    vh = span;
  } else {
    // 전국: 데이터 bbox를 그대로 쓰면 울릉도·독도가 폭을 늘려 바다만 넓어진다.
    // 본토+제주가 꽉 차게 잡고, 그 밖에 핀이 있으면 그때만 넓힌다.
    const [x1, y1] = proj.toXY(125.55, 38.72);
    const [x2, y2] = proj.toXY(129.78, 33.05);
    vx = Math.min(x1, pts.length ? mnx - 20 : x1);
    vy = Math.min(y1, pts.length ? mny - 20 : y1);
    vw = Math.max(x2, pts.length ? mxx + 20 : x2) - vx;
    vh = Math.max(y2, pts.length ? mxy + 20 : y2) - vy;
  }
  // 상자 비율에 맞춰 넓은 쪽 기준으로 맞춘다 (지도가 늘어나지 않게)
  const k = Math.min(bw / vw, bh / vh);
  const drawW = vw * k;
  const drawH = vh * k;
  const offX = bx + (bw - drawW) / 2 - vx * k;
  const offY = by + (bh - drawH) / 2 - vy * k;
  const toCanvas = (x: number, y: number): [number, number] => [offX + x * k, offY + y * k];

  // 전국 지도는 세로로 길어, 상자를 그대로 쓰면 좌우가 전부 바다가 된다.
  // 그릴 만큼만 상자를 줄여 지도가 꽉 찬 한 장이 되게 한다 (핀 확대는 상자를 그대로 채운다).
  const fitted = opts.focus === 'all';
  const rx = fitted ? bx + (bw - drawW) / 2 : bx;
  const ry = fitted ? by + (bh - drawH) / 2 : by;
  const rw = fitted ? drawW : bw;
  const rh = fitted ? drawH : bh;

  ctx.save();
  roundRect(ctx, rx, ry, rw, rh, radius);
  ctx.clip();

  // ② 바다
  ctx.fillStyle = m.sea;
  ctx.fillRect(rx, ry, rw, rh);

  // ③ 육지·정복 색칠 — 투영 좌표계 그대로 그리도록 변환을 걸어 둔다
  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(k, k);
  ctx.fillStyle = m.land;
  for (const r of proj.regions) ctx.fill(r.path);
  ctx.lineJoin = 'round';
  // 확대했을 때만 시·군·구 경계 — 전국 축소에서는 그물망이 되어 선거지도처럼 보인다
  if (opts.focus === 'pins') {
    ctx.strokeStyle = m.line;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(0.6, 1 * p.s) / k;
    for (const r of proj.regions) ctx.stroke(r.path);
    ctx.globalAlpha = 1;
  }
  for (const r of proj.regions) {
    const tier = tierOf(opts.visitCounts[r.code] ?? 0);
    if (tier === 0) continue;
    ctx.globalAlpha = TIER_OPACITY[tier];
    ctx.fillStyle = m.fill;
    ctx.fill(r.path);
    // 칠한 자국 테두리 — 축소해도 '여기 칠했다'가 또렷하게 남는다
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = m.fill;
    ctx.lineWidth = Math.max(0.8, 1.4 * p.s) / k;
    ctx.stroke(r.path);
    ctx.globalAlpha = 1;
  }
  // 시·도 경계 + 해안선 — 손으로 그린 지도 인상을 만드는 한 겹
  ctx.strokeStyle = m.line;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(0.6, 1.15 * p.s) / k;
  ctx.stroke(proj.sido);
  ctx.restore();

  // ④ 지역 이름 — 확대했을 때만, 글자가 지역 안에 들어가고 핀과 안 겹치는 곳만
  const canvasPts = pts.map(([x, y]) => toCanvas(x, y));
  if (opts.showNames && opts.focus === 'pins') {
    const size = 26 * p.s;
    ctx.font = p.font(p.skin.body, 26, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of proj.regions) {
      // 칠한 동네만 이름을 적는다 — 안 가 본 곳까지 적으면 지도가 아니라 행정지도가 된다
      if (!opts.visitCounts[r.code]) continue;
      const [lx, ly] = toCanvas(r.cx, r.cy);
      if (lx < rx || lx > rx + rw || ly < ry || ly > ry + rh) continue;
      if (r.name.length * size > r.w * k * 0.9 || size * 1.4 > r.h * k) continue;
      // 핀 근처는 비운다 — 스팟 이름과 지역 이름이 겹치면 둘 다 못 읽는다
      if (canvasPts.some(([px, py]) => Math.hypot(px - lx, py - ly) < 150 * p.s)) continue;
      ctx.lineWidth = 5 * p.s;
      ctx.strokeStyle = m.land;
      ctx.strokeText(r.name, lx, ly);
      ctx.fillStyle = p.skin.ink;
      ctx.globalAlpha = 0.55;
      ctx.fillText(r.name, lx, ly);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ⑤ 코스 선 + 핀 — 코스 선은 하루 기록(핀 확대)일 때만.
  //    전국 카드에서 멀리 떨어진 핀을 이으면 지도가 실뭉치처럼 된다.
  if (opts.focus === 'pins' && canvasPts.length > 1) {
    ctx.strokeStyle = m.pin;
    ctx.lineWidth = 5 * p.s;
    ctx.lineCap = 'round';
    ctx.setLineDash([14 * p.s, 12 * p.s]);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (const [i, [x, y]] of canvasPts.entries()) {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  const r = Math.max(9, Math.min(20, 26 * p.s * (opts.focus === 'all' ? 0.62 : 1)));
  for (const [x, y] of canvasPts) drawPin(p, x, y, r, m.pin);

  // 핀이 적을 때만 장소 이름 — 많으면 글자가 서로 겹쳐 지저분해진다.
  // 자리는 아래→위→옆 순으로 비어 있는 곳을 찾아 놓고, 끝내 겹치면 그 이름은 포기한다.
  if (opts.focus === 'pins' && canvasPts.length <= 4) {
    ctx.font = p.font(p.skin.body, 30, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = 36 * p.s;
    const taken: [number, number, number, number][] = []; // 이미 글자가 있는 자리
    const hits = (a: [number, number, number, number]) =>
      taken.some((b) => Math.abs(a[0] - b[0]) < (a[2] + b[2]) / 2 && Math.abs(a[1] - b[1]) < (a[3] + b[3]) / 2);
    for (const [i, [x, y]] of canvasPts.entries()) {
      const label = opts.pins[i]?.label;
      if (!label) continue;
      const lw = ctx.measureText(label).width + 12 * p.s;
      const spots: [number, number][] = [
        [x, y + r * 1.7],
        [x, y - r * 4.0],
        [x + lw / 2 + r * 1.2, y - r * 1.4],
        [x - lw / 2 - r * 1.2, y - r * 1.4],
        [x, y + r * 3.2],
      ];
      const place = spots.find((s) => {
        const rect: [number, number, number, number] = [s[0], s[1], lw, lh];
        return (
          s[0] - lw / 2 > rx + 8 * p.s &&
          s[0] + lw / 2 < rx + rw - 8 * p.s &&
          s[1] - lh / 2 > ry + 8 * p.s &&
          s[1] + lh / 2 < ry + rh - 8 * p.s &&
          !hits(rect)
        );
      });
      if (!place) continue;
      taken.push([place[0], place[1], lw, lh]);
      ctx.lineWidth = 7 * p.s;
      ctx.strokeStyle = m.land;
      ctx.lineJoin = 'round';
      ctx.strokeText(label, place[0], place[1]);
      ctx.fillStyle = p.skin.ink;
      ctx.fillText(label, place[0], place[1]);
    }
    ctx.textBaseline = 'alphabetic';
  }

  ctx.restore();

  // ⑥ 상자 테두리 — 지도를 카드에 '붙인' 느낌
  ctx.strokeStyle = p.skin.ink;
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 3 * p.s;
  roundRect(ctx, rx, ry, rw, rh, radius);
  ctx.stroke();
  ctx.globalAlpha = 1;
  return true;
}

/** 물방울 지도핀 — 꼭짓점이 정확한 위치를 가리킨다 (ConquestMap 'dot'과 같은 모양) */
function drawPin(p: Painter, x: number, y: number, r: number, color: string) {
  const { ctx } = p;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.35, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#3b3733';
  ctx.globalAlpha = 0.16;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - r * 1.5, y - r * 1.3, x - r * 1.4, y - r * 3.1, x, y - r * 3.1);
  ctx.bezierCurveTo(x + r * 1.4, y - r * 3.1, x + r * 1.5, y - r * 1.3, x, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#fdfcf7';
  ctx.lineWidth = 2.4 * p.s;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - r * 1.95, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = '#fdfcf7';
  ctx.fill();
  ctx.restore();
}
