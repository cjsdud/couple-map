import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../shared/lib/supabase';

/**
 * 정복 단위 수. 기획 명세는 229였으나 2026-07-01 행정구역 개편(인천 2군 9구)으로
 * 230이 현행 기준 — docs/spike-result.md 참조. 시드(supabase/seed/sigungu.sql)와 동기 유지.
 */
export const SIGUNGU_TOTAL = 230;

/**
 * 정복 현황: status='visited' 기록의 스팟이 가진 시군구 코드 집합.
 * 커플당 행 수가 작아 실시간 계산으로 충분 (tech-design §4).
 * Supabase 미연결(키 미설정) 상태에서는 빈 지도(정복 0%)를 보여준다.
 */
export function useConquest() {
  const { data } = useQuery({
    queryKey: ['conquest'],
    queryFn: async (): Promise<Record<string, number>> => {
      // ?mock=1 — 디자인 확인용 데모 데이터. useRecords의 MOCK_RECORDS(visited 스팟 수)와 동기 유지
      if (new URLSearchParams(window.location.search).has('mock')) {
        return {
          '11440': 3, '11200': 2, '11110': 2, '11680': 2, '11560': 1, // 서울 5구
          '51110': 1, '51150': 1, '41820': 1, '28155': 1, // 춘천·강릉·가평·영종
          '26350': 2, '26500': 1, '30140': 1, '47130': 2, // 부산 2구·대전·경주
          '50110': 2, '50130': 2, // 제주·서귀포
        };
      }
      if (!supabase) return {};
      const { data: rows, error } = await supabase
        .from('spots')
        .select('sigungu_code, records!inner(status)')
        .eq('records.status', 'visited')
        .not('sigungu_code', 'is', null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of rows) {
        const code = row.sigungu_code as string;
        counts[code] = (counts[code] ?? 0) + 1;
      }
      return counts;
    },
  });

  const visitCounts = data ?? {};
  const visitedCount = Object.keys(visitCounts).length;
  return {
    /** 시군구 코드 → 방문(스팟) 횟수. 덧칠 진하기의 입력값 */
    visitCounts,
    visitedCount,
    totalCount: SIGUNGU_TOTAL,
    ratio: visitedCount / SIGUNGU_TOTAL,
  };
}
