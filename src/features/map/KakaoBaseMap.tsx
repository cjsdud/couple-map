import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadKakaoMaps } from '../../shared/lib/kakaoMap';
import { useConquest } from './useConquest';
import { useRecords } from './useRecords';

interface SigunguGeoFeature {
  properties: { code: string; name: string };
  geometry:
    | { type: 'Polygon'; coordinates: [number, number][][] }
    | { type: 'MultiPolygon'; coordinates: [number, number][][][] };
}

/** 방문 횟수 → 정복 오버레이 투명도 (도화지 지도의 덧칠 단계와 동일 감각) */
const TIER_FILL = [0, 0.16, 0.22, 0.28, 0.34, 0.4];
/** 도화지 지도와 같은 색연필 초록 테두리 — 실지도 위에서도 '선 안에 색칠한' 느낌 */
const CONQUEST_STROKE = '#6f9450';

/**
 * 실지도 모드 — 카카오맵 위에 정복 색칠(반투명 폴리곤)·스팟 핀·코스 점선을 얹는다.
 * 도화지 모드(ConquestMap)와 나란히 토글로 제공 (사용자 결정 2026-07-21).
 */
export default function KakaoBaseMap({
  onSelectRecord,
  onError,
}: {
  onSelectRecord?: (recordId: string) => void;
  /** SDK 로드 실패 시 — 부모가 도화지 모드로 폴백할 수 있게 알린다 */
  onError?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const { visitCounts } = useConquest();
  const { data: records = [] } = useRecords();
  const { data: geo } = useQuery({
    queryKey: ['sigungu-geo-raw'],
    queryFn: async (): Promise<{ features: SigunguGeoFeature[] }> => {
      const res = await fetch('/geo/sigungu.json');
      if (!res.ok) throw new Error(`GeoJSON 로드 실패: ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
  });

  // 지도 초기화 (1회)
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });
  useEffect(() => {
    let cancelled = false;
    void loadKakaoMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        // 기본 UI는 최소로 — 줌컨트롤 등 부가 요소 없이 지도만 (지저분함 제거, 핀치/더블탭 줌은 SDK 기본)
        const map = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(36.3, 127.8),
          level: 13,
        });
        mapRef.current = map;
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        onErrorRef.current?.();
      });
    return () => {
      cancelled = true;
      mapRef.current = null;
    };
  }, []);

  // 정복 색칠 폴리곤 — 방문한 시군구만 초록 반투명
  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map || !geo) return;
    const polygons: kakao.maps.Polygon[] = [];
    for (const f of geo.features) {
      const tier = Math.min(visitCounts[f.properties.code] ?? 0, 5);
      if (tier === 0) continue; // 미정복 지역은 카카오맵 원본 그대로
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) {
        polygons.push(
          new window.kakao.maps.Polygon({
            map,
            path: poly.map((ring) => ring.map(([lng, lat]) => new window.kakao.maps.LatLng(lat, lng))),
            strokeWeight: 2,
            strokeColor: CONQUEST_STROKE,
            strokeOpacity: 0.85,
            fillColor: '#8cab68',
            fillOpacity: TIER_FILL[tier],
          }),
        );
      }
    }
    return () => polygons.forEach((p) => p.setMap(null));
  }, [status, geo, visitCounts]);

  // 스팟 핀 + 같은 기록 점선 코스
  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    const overlays: (kakao.maps.CustomOverlay | kakao.maps.Polyline)[] = [];
    // 핀 이름 라벨은 도시권 확대(level<=8)에서만 — 전국 뷰에서 이름들이 겹쳐 지저분해지는 것 방지
    const labels: HTMLElement[] = [];
    const syncLabels = () => {
      const show = map.getLevel() <= 8;
      for (const el of labels) el.style.display = show ? '' : 'none';
    };
    for (const rec of records) {
      const spots = rec.spots
        .slice()
        .sort((a, b) => a.seq - b.seq)
        .filter((s) => s.lat !== null && s.lng !== null);
      if (spots.length === 0) continue;
      const visited = rec.status === 'visited';
      const color = visited ? '#e8637c' : '#8a857f';
      if (spots.length > 1) {
        overlays.push(
          new window.kakao.maps.Polyline({
            map,
            path: spots.map((s) => new window.kakao.maps.LatLng(s.lat as number, s.lng as number)),
            strokeWeight: 2.5,
            strokeColor: color,
            strokeOpacity: 0.85,
            strokeStyle: 'shortdash',
          }),
        );
      }
      for (const s of spots) {
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('aria-label', `${s.name} 기록 보기`);
        // 콕 핀 모양 HTML 핀 — 도화지 톤 유지
        el.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(2px)">
            <div style="width:22px;height:22px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);
                        background:${color};border:2px solid #fdfcf7;box-shadow:0 2px 5px rgba(59,55,51,.35);
                        display:flex;align-items:center;justify-content:center">
              <span style="width:7px;height:7px;border-radius:50%;background:#fdfcf7;transform:rotate(45deg)"></span>
            </div>
            <span data-pin-label style="margin-top:3px;font-size:11px;font-weight:700;color:#3b3733;
                         text-shadow:0 0 3px #fdfcf7,0 0 3px #fdfcf7;white-space:nowrap">${s.name}</span>
          </div>`;
        el.style.cssText = 'background:none;border:none;padding:0;cursor:pointer';
        const label = el.querySelector<HTMLElement>('[data-pin-label]');
        if (label) labels.push(label);
        el.addEventListener('click', () => onSelectRecord?.(rec.id));
        overlays.push(
          new window.kakao.maps.CustomOverlay({
            map,
            position: new window.kakao.maps.LatLng(s.lat as number, s.lng as number),
            content: el,
            yAnchor: 0.5,
            zIndex: 3,
          }),
        );
      }
    }
    syncLabels();
    window.kakao.maps.event.addListener(map, 'zoom_changed', syncLabels);
    return () => {
      window.kakao.maps.event.removeListener(map, 'zoom_changed', syncLabels);
      overlays.forEach((o) => o.setMap(null));
    };
  }, [status, records, onSelectRecord]);

  if (status === 'error') {
    return (
      <div className="flex aspect-[4/5] items-center justify-center rounded-2xl border-2 border-ink/10 bg-white/40 px-6 text-center text-sm opacity-60">
        실지도를 불러오지 못했어요 — 도화지 지도로 봐 주세요
      </div>
    );
  }
  return (
    <div className="relative">
      <div ref={containerRef} className="aspect-[4/5] w-full overflow-hidden rounded-2xl rounded-tr-md border-2 border-ink/10" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/50 text-sm opacity-60">
          실지도를 펼치는 중…
        </div>
      )}
    </div>
  );
}
