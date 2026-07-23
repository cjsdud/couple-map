import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { paperColor, pinStyle } from '../../shared/lib/theme';
import { useCoupleTheme } from '../couple/useCoupleState';
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
const MAX_ZOOM = 16;
/** 바다 — 수채화 톤 (도화지 감성 유지하면서 육지/바다 대비로 지도답게) */
const SEA_COLOR = '#e2edf3';
/** 정복 색칠 — 크레용 초록 (빗금 대신 솔리드로 곱게 채운다) */
const CONQUEST_FILL = '#8cab68';

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
      // 지역 이름 라벨용 중심점: 가장 큰 폴리곤(본체)의 bbox 중심 (섬 딸린 지역 보정)
      let bestArea = -1;
      let cx = 0;
      let cy = 0;
      const d = polys
        .flatMap((poly) =>
          poly.map((ring, ringIdx) => {
            if (ringIdx === 0) {
              let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
              for (const pt of ring) {
                const [px, py] = toXY(pt[0], pt[1]);
                if (px < mnx) mnx = px;
                if (px > mxx) mxx = px;
                if (py < mny) mny = py;
                if (py > mxy) mxy = py;
              }
              const area = (mxx - mnx) * (mxy - mny);
              if (area > bestArea) {
                bestArea = area;
                cx = (mnx + mxx) / 2;
                cy = (mny + mxy) / 2;
              }
            }
            return `M${ring.map(toSvg).join('L')}Z`;
          }),
        )
        .join('');
      return { code: f.properties.code, name: f.properties.name, d, cx, cy };
    });
    return { paths, viewH, toXY };
  }, [geo]);
}

/** 행정동(3,558개) — 깊은 확대에서만 지연 로드해 시 내부를 세분화 */
function useDongFeatures(toXY: ((lng: number, lat: number) => [number, number]) | undefined, enabled: boolean) {
  const { data: geo } = useQuery({
    queryKey: ['dong-geo'],
    queryFn: async (): Promise<{ features: { properties: { name: string }; geometry: SigunguFeature['geometry'] }[] }> => {
      const res = await fetch('/geo/dong.json');
      if (!res.ok) throw new Error(`행정동 경계 로드 실패: ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
    enabled,
  });
  return useMemo(() => {
    if (!geo || !toXY) return null;
    const toSvg = (pt: [number, number]) => {
      const [x, y] = toXY(pt[0], pt[1]);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    };
    return geo.features.map((f) => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      let bestArea = -1;
      let cx = 0;
      let cy = 0;
      const d = polys
        .flatMap((poly) =>
          poly.map((ring, ringIdx) => {
            if (ringIdx === 0) {
              let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
              for (const pt of ring) {
                const [px, py] = toXY(pt[0], pt[1]);
                if (px < mnx) mnx = px;
                if (px > mxx) mxx = px;
                if (py < mny) mny = py;
                if (py > mxy) mxy = py;
              }
              const area = (mxx - mnx) * (mxy - mny);
              if (area > bestArea) {
                bestArea = area;
                cx = (mnx + mxx) / 2;
                cy = (mny + mxy) / 2;
              }
            }
            return `M${ring.map(toSvg).join('L')}Z`;
          }),
        )
        .join('');
      return { name: f.properties.name, d, cx, cy };
    });
  }, [geo, toXY]);
}

/** 시·도 경계(17개) — 굵은 선 한 겹으로 '지도' 인상을 만든다 */
function useSidoPaths(toXY: ((lng: number, lat: number) => [number, number]) | undefined) {
  const { data: geo } = useQuery({
    queryKey: ['sido-geo'],
    queryFn: async (): Promise<SigunguGeo> => {
      const res = await fetch('/geo/sido.json');
      if (!res.ok) throw new Error(`시도 경계 로드 실패: ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
  });
  return useMemo(() => {
    if (!geo || !toXY) return [];
    const toSvg = (pt: [number, number]) => {
      const [x, y] = toXY(pt[0], pt[1]);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    };
    return geo.features.map((f) => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      return polys.flatMap((poly) => poly.map((ring) => `M${ring.map(toSvg).join('L')}Z`)).join('');
    });
  }, [geo, toXY]);
}

/** 방문 횟수 → 덧칠 단계 (1회 연함 → 5회+ 꽉 채움, 명세 §3.1 재방문 처리) */
function tierOf(count: number): number {
  if (count <= 0) return 0;
  return Math.min(count, 5);
}

const TIER_OPACITY = [0, 0.35, 0.5, 0.65, 0.82, 1];

interface ViewBox {
  x: number;
  y: number;
  w: number;
}

/** 핀치 줌·팬 — 포인터 이벤트만으로 구현 (새 라이브러리 없이, 규칙 7) */
function useZoomPan(viewH: number) {
  const aspect = viewH / VIEW_W;
  const [vb, setVb] = useState<ViewBox>({ x: 0, y: 0, w: VIEW_W });
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);
  const draggedRef = useRef(false);

  const clampView = useCallback(
    (x: number, y: number, w: number): ViewBox => {
      const cw = Math.min(Math.max(w, VIEW_W / MAX_ZOOM), VIEW_W);
      return {
        x: Math.min(Math.max(x, 0), VIEW_W - cw),
        y: Math.min(Math.max(y, 0), viewH - cw * aspect),
        w: cw,
      };
    },
    [aspect, viewH],
  );

  /** 화면 좌표 → viewBox 좌표 */
  const toView = useCallback(
    (clientX: number, clientY: number, v: ViewBox): [number, number] => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return [v.x, v.y];
      return [
        v.x + ((clientX - rect.left) / rect.width) * v.w,
        v.y + ((clientY - rect.top) / rect.height) * v.w * aspect,
      ];
    },
    [aspect],
  );

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      setVb((v) => {
        const [px, py] = toView(clientX, clientY, v);
        const w = Math.min(Math.max(v.w * factor, VIEW_W / MAX_ZOOM), VIEW_W);
        const k = w / v.w;
        return clampView(px - (px - v.x) * k, py - (py - v.y) * k, w);
      });
    },
    [clampView, toView],
  );

  const zoomCenter = useCallback(
    (factor: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    },
    [zoomAt],
  );

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
    if (pointers.current.size === 1) draggedRef.current = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2) {
        // 핀치: 두 손가락 거리 변화 비율로 중점 기준 줌
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist.current > 0 && dist > 0) {
          zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinchDist.current / dist);
        }
        pinchDist.current = dist;
        draggedRef.current = true;
        return;
      }

      // 팬: 확대 상태에서 한 손가락 드래그 (기본 배율에서는 페이지 스크롤 우선)
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) draggedRef.current = true;
      setVb((v) => {
        if (v.w >= VIEW_W) return v;
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return v;
        return clampView(v.x - (dx / rect.width) * v.w, v.y - (dy / rect.height) * v.w * aspect, v.w);
      });
    },
    [aspect, clampView, zoomAt],
  );

  const onPointerEnd = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = 0;
  }, []);

  // 드래그·핀치 직후의 클릭은 스팟 탭으로 취급하지 않는다
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (draggedRef.current) {
      e.stopPropagation();
      draggedRef.current = false;
    }
  }, []);

  const reset = useCallback(() => setVb({ x: 0, y: 0, w: VIEW_W }), []);

  return {
    svgRef,
    vb,
    viewBoxAttr: `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${(vb.w * aspect).toFixed(1)}`,
    scaleFactor: vb.w / VIEW_W,
    zoomed: vb.w < VIEW_W,
    zoomCenter,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture,
    },
  };
}

export default function ConquestMap({
  onSelectRecord,
}: {
  /** 스팟 점 탭 → 기록 상세 시트 오픈 */
  onSelectRecord?: (recordId: string) => void;
}) {
  const { visitCounts } = useConquest();
  const theme = useCoupleTheme();
  const paper = paperColor(theme);
  const pin = pinStyle(theme);
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
  const sidoPaths = useSidoPaths(projected?.toXY);
  const { svgRef, vb, viewBoxAttr, scaleFactor, zoomed, zoomCenter, reset, handlers } = useZoomPan(
    projected?.viewH ?? VIEW_W,
  );
  // 시군구 이름은 2.6배부터, 동 경계는 4배부터(지연 로드).
  // 동 '이름'은 표시하지 않는다 — 깊게 확대해도 큰 도시(시군구) 단위 글자만 (사용자 요청 2026-07-23).
  const showRegionNames = scaleFactor <= 1 / 2.6;
  const showDong = scaleFactor <= 1 / 4;
  const dongFeatures = useDongFeatures(projected?.toXY, showDong);
  // 라벨은 현재 화면 안의 지역만 — 경계 밖에 걸친 글자 방지
  const viewH = projected?.viewH ?? VIEW_W;
  const vbH = vb.w * (viewH / VIEW_W);
  const inView = (cx: number, cy: number) =>
    cx >= vb.x && cx <= vb.x + vb.w && cy >= vb.y && cy <= vb.y + vbH;

  if (!projected) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center rounded-2xl border-2 border-ink/10 bg-white/40 text-sm opacity-50">
        도화지를 펼치는 중…
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={viewBoxAttr}
        className="w-full select-none rounded-2xl rounded-tr-md border-2 border-ink/10"
        style={{ touchAction: zoomed ? 'none' : 'pan-y', backgroundColor: SEA_COLOR }}
        role="img"
        aria-label="대한민국 시군구 정복 지도 (핀치로 확대·축소)"
        {...handlers}
      >
        <defs>
          {/* 손그림 wobble */}
          <filter id="wobble">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" />
          </filter>
        </defs>
        {/* wobble 필터는 기본 배율에서만 — 확대 시 iOS가 필터 래스터 한계로 지도를 통째로 안 그리는 문제 회피 */}
        <g filter={zoomed ? undefined : 'url(#wobble)'}>
          {projected.paths.map((p) => {
            const tier = tierOf(visitCounts[p.code] ?? 0);
            return (
              <g key={p.code}>
                <path
                  d={p.d}
                  fill={paper}
                  stroke="#3b3733"
                  strokeOpacity="0.25"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                {tier > 0 && (
                  <path d={p.d} fill={CONQUEST_FILL} opacity={TIER_OPACITY[tier]}>
                    <title>{`${p.name} ×${visitCounts[p.code]}`}</title>
                  </path>
                )}
              </g>
            );
          })}
        </g>
        {/* 행정동 경계 — 깊은 확대에서 시 안을 세분화 (실선보다 옅은 헤어라인) */}
        {showDong && dongFeatures && (
          <g pointerEvents="none">
            {dongFeatures.map((f, i) => (
              <path
                key={i}
                d={f.d}
                fill="none"
                stroke="#3b3733"
                strokeOpacity="0.13"
                strokeWidth="0.8"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )}
        {/* 시·도 경계 — 한 겹으로 지도 인상 강화 */}
        <g>
          {sidoPaths.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="#3b3733"
              strokeOpacity="0.3"
              strokeWidth="1.05"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {/* 확대하면 시군구 이름 — 화면 안의 지역만 (경계 밖 글자 방지) */}
        {showRegionNames && (
          <g pointerEvents="none">
            {projected.paths
              .filter((p) => inView(p.cx, p.cy))
              .map((p) => (
                <text
                  key={`label-${p.code}`}
                  x={p.cx}
                  y={p.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={26 * scaleFactor}
                  fontWeight={700}
                  fill="#3b3733"
                  opacity={0.72}
                  stroke={paper}
                  strokeWidth={5 * scaleFactor}
                  paintOrder="stroke"
                >
                  {p.name}
                </text>
              ))}
          </g>
        )}
        <SpotOverlay toXY={projected.toXY} onSelectRecord={onSelectRecord} scaleFactor={scaleFactor} pin={pin} />
      </svg>

      {/* 줌 컨트롤 — 핀치가 어려운 환경 대비 */}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button
          type="button"
          aria-label="지도 확대"
          onClick={() => zoomCenter(1 / 1.5)}
          className="h-9 w-9 rounded-xl rounded-tl-sm border border-ink/15 bg-paper/90 text-lg font-bold shadow-sm active:translate-y-px"
        >
          +
        </button>
        <button
          type="button"
          aria-label="지도 축소"
          onClick={() => zoomCenter(1.5)}
          className="h-9 w-9 rounded-xl rounded-br-sm border border-ink/15 bg-paper/90 text-lg font-bold shadow-sm active:translate-y-px"
        >
          −
        </button>
        {zoomed && (
          <button
            type="button"
            aria-label="전체 지도 보기"
            onClick={reset}
            className="h-9 w-9 rounded-xl border border-ink/15 bg-paper/90 text-sm shadow-sm active:translate-y-px"
          >
            ⤢
          </button>
        )}
      </div>
    </div>
  );
}

/** 기록 스팟 점 + 같은 기록 스팟의 점선 연결 (명세 §3.1 데이트 기록 핀) — 점 탭 시 기록 상세 */
/** 핀 모양 렌더 (도화지 꾸미기 A안) — 그림자·흰 테두리·하이라이트로 입체감, 화면상 크기 일정 */
function PinShape({ style, x, y, r, color, sf }: { style: string; x: number; y: number; r: number; color: string; sf: number }) {
  const stroke = { stroke: '#fdfcf7', strokeWidth: 2 * sf, strokeLinejoin: 'round' as const };
  const shadow = (cy: number) => (
    <ellipse cx={x} cy={cy} rx={r * 1.15} ry={r * 0.38} fill="#3b3733" opacity={0.16} />
  );
  if (style === 'heart') {
    const d = `M ${x} ${y + r * 1.25} C ${x - r * 2.1} ${y - r * 0.7}, ${x - r * 0.7} ${y - r * 1.7}, ${x} ${y - r * 0.4} C ${x + r * 0.7} ${y - r * 1.7}, ${x + r * 2.1} ${y - r * 0.7}, ${x} ${y + r * 1.25} Z`;
    return (
      <>
        {shadow(y + r * 1.55)}
        <path d={d} fill={color} {...stroke} />
        <circle cx={x - r * 0.8} cy={y - r * 0.75} r={r * 0.34} fill="#fdfcf7" opacity={0.85} />
      </>
    );
  }
  if (style === 'star') {
    const pts: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const angle = ((-90 + i * 36) * Math.PI) / 180;
      const rad = i % 2 === 0 ? r * 1.55 : r * 0.7;
      pts.push(`${x + Math.cos(angle) * rad},${y + Math.sin(angle) * rad}`);
    }
    return (
      <>
        {shadow(y + r * 1.8)}
        <polygon points={pts.join(' ')} fill={color} {...stroke} />
        <circle cx={x - r * 0.35} cy={y - r * 0.45} r={r * 0.3} fill="#fdfcf7" opacity={0.85} />
      </>
    );
  }
  if (style === 'tape') {
    return (
      <>
        {shadow(y + r * 1.35)}
        <g transform={`rotate(-8 ${x} ${y})`}>
          <rect x={x - r * 1.7} y={y - r * 0.95} width={r * 3.4} height={r * 1.9} rx={r * 0.25} fill={color} opacity={0.92} {...stroke} />
          {/* 마스킹테이프 질감 줄 */}
          <line x1={x - r * 1.2} y1={y - r * 0.32} x2={x + r * 1.2} y2={y - r * 0.32} stroke="#fdfcf7" strokeWidth={0.9 * sf} opacity={0.5} />
          <line x1={x - r * 1.2} y1={y + r * 0.32} x2={x + r * 1.2} y2={y + r * 0.32} stroke="#fdfcf7" strokeWidth={0.9 * sf} opacity={0.5} />
        </g>
      </>
    );
  }
  // 기본 '콕 핀': 물방울 지도핀 — 꼭짓점이 정확한 위치를 가리킨다
  const d = `M ${x} ${y} C ${x - r * 1.5} ${y - r * 1.3} ${x - r * 1.4} ${y - r * 3.1} ${x} ${y - r * 3.1} C ${x + r * 1.4} ${y - r * 3.1} ${x + r * 1.5} ${y - r * 1.3} ${x} ${y} Z`;
  return (
    <>
      <ellipse cx={x} cy={y + r * 0.35} rx={r * 0.9} ry={r * 0.32} fill="#3b3733" opacity={0.16} />
      <path d={d} fill={color} {...stroke} />
      <circle cx={x} cy={y - r * 1.95} r={r * 0.55} fill="#fdfcf7" />
    </>
  );
}

function SpotOverlay({
  toXY,
  onSelectRecord,
  scaleFactor,
  pin,
}: {
  toXY: (lng: number, lat: number) => [number, number];
  onSelectRecord?: (recordId: string) => void;
  /** 줌 배율 보정 — 확대해도 점 크기가 화면상 일정하게 */
  scaleFactor: number;
  /** 핀 모양 (도화지 꾸미기) */
  pin: string;
}) {
  const { data: records = [] } = useRecords();
  // 핀을 크게 — 화면상 크기는 scaleFactor 보정으로 확대해도 일정 (사용자 요청 2026-07-23)
  const r = 15 * scaleFactor;
  const hitR = 24 * scaleFactor;
  // 2.2배 이상 확대하면 점 아래에 장소 이름 라벨 (사용자 요청 2026-07-21)
  const showLabels = scaleFactor <= 1 / 2.2;
  return (
    <g>
      {records.map((rec) => {
        const pts = rec.spots
          .slice()
          .sort((a, b) => a.seq - b.seq)
          .filter((s) => s.lat !== null && s.lng !== null)
          .map((s) => ({ s, xy: toXY(s.lng as number, s.lat as number) }));
        if (pts.length === 0) return null;
        const visited = rec.status === 'visited';
        const color = visited ? '#e8637c' : '#3b3733';
        return (
          <g key={rec.id} opacity={visited ? 1 : 0.4}>
            {pts.length > 1 && (
              <polyline
                points={pts.map((p) => p.xy.join(',')).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeDasharray="5 5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {pts.map((p) => (
              <g
                key={p.s.id}
                role={onSelectRecord ? 'button' : undefined}
                aria-label={`${p.s.name} 기록 보기`}
                onClick={() => onSelectRecord?.(rec.id)}
                className={onSelectRecord ? 'cursor-pointer' : undefined}
              >
                <title>{p.s.name}</title>
                <PinShape style={pin} x={p.xy[0]} y={p.xy[1]} r={r} color={color} sf={scaleFactor} />
                {showLabels && (
                  // 종이색 테두리 글자 — 경계선 위에서도 읽히게 (화면상 크기 일정)
                  <text
                    x={p.xy[0]}
                    y={p.xy[1] + 16 * scaleFactor}
                    textAnchor="middle"
                    dominantBaseline="hanging"
                    fontSize={15 * scaleFactor}
                    fontWeight={700}
                    fill="#3b3733"
                    stroke="#fdfcf7"
                    strokeWidth={3.5 * scaleFactor}
                    paintOrder="stroke"
                  >
                    {p.s.name}
                  </text>
                )}
                {/* 투명 히트 영역 — 작은 점도 엄지로 탭 가능하게 */}
                <circle cx={p.xy[0]} cy={p.xy[1]} r={hitR} fill="transparent" />
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}
