import { useQuery } from '@tanstack/react-query';

interface SigunguGeoFeature {
  properties: { code: string; name: string; sido: string };
}

/**
 * 시군구 코드 → "시도 이름" 표시명 (예: 11110 → "서울 종로구").
 * KakaoBaseMap과 같은 queryKey를 써서 원본 GeoJSON 캐시를 공유한다.
 */
export function useSigunguNames(enabled = true) {
  return useQuery({
    queryKey: ['sigungu-geo-raw'],
    queryFn: async (): Promise<{ features: SigunguGeoFeature[] }> => {
      const res = await fetch('/geo/sigungu.json');
      if (!res.ok) throw new Error(`GeoJSON 로드 실패: ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
    select: (geo) => {
      const names: Record<string, string> = {};
      for (const f of geo.features) names[f.properties.code] = `${f.properties.sido} ${f.properties.name}`;
      return names;
    },
    enabled,
  });
}
