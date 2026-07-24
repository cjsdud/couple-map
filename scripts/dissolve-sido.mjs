/**
 * sido.json 재생성 — 시군구 폴리곤을 시도별로 융합(dissolve).
 *
 * 왜: 원래 sido.json은 광역시가 구 조각 묶음이라 시도 경계선을 그리면
 * 서울·부산 내부의 구 경계가 전부 진하게 드러났다 (2026-07-24 사용자 피드백).
 * 추가로 아주 작은 섬(< MIN_AREA_KM2)은 시도 경계에서 제외 —
 * 기본 배율에서 인천·전남 앞바다 해안선이 어지럽게 뭉치는 것 방지.
 * (섬 자체는 sigungu.json fill로 계속 그려지고, 정복 판정에도 영향 없음)
 *
 * 실행: node scripts/dissolve-sido.mjs  (요구: npm i --no-save @turf/union @turf/helpers @turf/area)
 */
import fs from 'node:fs';
import { union } from '@turf/union';
import { area } from '@turf/area';
import { featureCollection } from '@turf/helpers';

const MIN_AREA_KM2 = 20;

const src = JSON.parse(fs.readFileSync('public/geo/sigungu.json', 'utf8'));
const bySido = new Map();
for (const f of src.features) {
  if (!bySido.has(f.properties.sido)) bySido.set(f.properties.sido, []);
  bySido.get(f.properties.sido).push(f);
}

const round = (n) => Math.round(n * 1000) / 1000;
const roundRing = (ring) => ring.map(([x, y]) => [round(x), round(y)]);
const polyAreaKm2 = (coords) =>
  area({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: coords } }) / 1e6;

const out = [];
for (const [sido, feats] of bySido) {
  const merged = feats.length === 1 ? feats[0] : union(featureCollection(feats));
  if (!merged) throw new Error(`union 실패: ${sido}`);
  const polys =
    merged.geometry.type === 'Polygon' ? [merged.geometry.coordinates] : merged.geometry.coordinates;
  // 큰 폴리곤(본토·큰 섬)만 시도 경계로 — 최소 1개는 보장
  const kept = polys.filter((p) => polyAreaKm2(p) >= MIN_AREA_KM2);
  const use = kept.length > 0 ? kept : [polys.sort((a, b) => polyAreaKm2(b) - polyAreaKm2(a))[0]];
  const geometry =
    use.length === 1
      ? { type: 'Polygon', coordinates: use[0].map(roundRing) }
      : { type: 'MultiPolygon', coordinates: use.map((p) => p.map(roundRing)) };
  console.log(`${sido}: ${feats.length}개 시군구 → 폴리곤 ${polys.length} → 유지 ${use.length}`);
  out.push({ type: 'Feature', properties: { name: sido }, geometry });
}

fs.writeFileSync('public/geo/sido.json', JSON.stringify({ type: 'FeatureCollection', features: out }));
console.log(`\n완료: ${out.length}개 시도, ${(fs.statSync('public/geo/sido.json').size / 1024).toFixed(0)}KB`);
