import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useConquest } from './useConquest';
import { useRecords } from './useRecords';

type Ring = [number, number][];
interface SigunguFeature {
  properties: { code: string; name: string };
  geometry:
    | { type: 'Polygon'; coordinates: Ring[] }
    | { type: 'MultiPolygon'; coordinates: Ring[][] };
}
interface SigunguGeo {
  features: SigunguFeature[];
}

const VIEW_W = 800;

/** 위도 36° 기준 등장방형 근사 — 정복 개요 지도용으로 충분, SDK 불필요 (tech-design §3) */
function useProjectedPaths(geo: SigunguGeo | undefined) {
  return useMemo(() => {
    if (!geo) return null;
    const K = Math.cos((36 * Math.PI) / 180);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const project = ([lng, lat]: [number, number]): [number, number] => [lng * K, -lat];
    for (const f of geo.features) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys)
        for (const ring of poly)
          for (const pt of ring) {
            const [x, y] = project(pt);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
    }
    const scale = VIEW_W / (maxX - minX);
    const viewH = (maxY - minY) * scale;
    const toXY = (lng: number, lat: number): [number, number] => {
      const [x, y] = project([lng, lat]);
      return [(x - minX) * scale, (y - minY) * scale];
    };
    const toSvg = (pt: [number, number]) => {
      const [x, y] = toXY(pt[0], pt[1]);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    };
    const paths = geo.features.map((f) => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const d = polys
        .flatMap((poly) => poly.map((ring) => `M${ring.map(toSvg).join('L')}Z`))
        .join('');
      return { code: f.properties.code, name: f.properties.name, d };
    });
    return { paths, viewH, toXY };
  }, [geo]);
}

/** 방문 횟수 → 덧칠 단계 (1회 연함 → 5회+ 꽉 채움, 명세 §3.1 재방문 처리) */
function tierOf(count: number): number {
  if (count <= 0) return 0;
  return Math.min(count, 5);
}

const TIER_OPACITY = [0, 0.35, 0.5, 0.65, 0.82, 1];

export default function ConquestMap() {
  const { visitCounts } = useConquest();
  const { data: geo } = useQuery({
    queryKey: ['sigungu-geo'],
    queryFn: async (): Promise<SigunguGeo> => {
      const res = await fetch('/geo/sigungu.json');
      if (!res.ok) throw new Error(`GeoJSON 로드 실패: ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
  });
  const projected = useProjectedPaths(geo);

  if (!projected) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center rounded-2xl border-2 border-ink/10 bg-white/40 text-sm opacity-50">
        도화지를 펼치는 중…
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${projected.viewH.toFixed(0)}`}
      className="w-full rounded-2xl rounded-tr-md border-2 border-ink/10 bg-white/40"
      role="img"
      aria-label="대한민국 시군구 정복 지도"
    >
      <defs>
        {/* 크레용 빗금 — 덧칠(방문 횟수)은 opacity 단계로 표현 */}
        <pattern id="crayon" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="#8cab68" strokeWidth="3.5" strokeLinecap="round" />
        </pattern>
        {/* 손그림 wobble */}
        <filter id="wobble">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" />
        </filter>
      </defs>
      <g filter="url(#wobble)">
        {projected.paths.map((p) => {
          const tier = tierOf(visitCounts[p.code] ?? 0);
          return (
            <g key={p.code}>
              <path d={p.d} fill="#fdfcf7" stroke="#3b3733" strokeOpacity="0.25" strokeWidth="1" />
              {tier > 0 && (
                <path d={p.d} fill="url(#crayon)" opacity={TIER_OPACITY[tier]}>
                  <title>{`${p.name} ×${visitCounts[p.code]}`}</title>
                </path>
              )}
            </g>
          );
        })}
      </g>
      <SpotOverlay toXY={projected.toXY} />
    </svg>
  );
}

/** 기록 스팟 점 + 같은 기록 스팟의 점선 연결 (명세 §3.1 데이트 기록 핀) */
function SpotOverlay({ toXY }: { toXY: (lng: number, lat: number) => [number, number] }) {
  const { data: records = [] } = useRecords();
  return (
    <g>
      {records.map((r) => {
        const pts = r.spots
          .slice()
          .sort((a, b) => a.seq - b.seq)
          .filter((s) => s.lat !== null && s.lng !== null)
          .map((s) => ({ s, xy: toXY(s.lng as number, s.lat as number) }));
        if (pts.length === 0) return null;
        const visited = r.status === 'visited';
        const color = visited ? '#e8637c' : '#3b3733';
        return (
          <g key={r.id} opacity={visited ? 1 : 0.4}>
            {pts.length > 1 && (
              <polyline
                points={pts.map((p) => p.xy.join(',')).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeDasharray="5 5"
                strokeLinecap="round"
              />
            )}
            {pts.map((p) => (
              <circle
                key={p.s.id}
                cx={p.xy[0]}
                cy={p.xy[1]}
                r="6"
                fill={color}
                stroke="#fdfcf7"
                strokeWidth="2.5"
              >
                <title>{p.s.name}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </g>
  );
}
