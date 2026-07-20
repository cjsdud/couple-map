/**
 * Kakao Local REST 래퍼 (tech-design §3 ②: 장소 검색 + 좌표→시군구 판정).
 * SDK 없이 REST 2개만 사용한다 — 홈 화면 렌더는 SDK 호출 0회 원칙.
 *
 * 키: VITE_KAKAO_REST_KEY (Kakao Developers REST API 키).
 * 미설정 시 호출 시점에 명확한 에러를 던진다 (앱 셸은 뜨되 기능만 안내).
 */

const BASE = 'https://dapi.kakao.com/v2/local';

function restKey(): string {
  const key = import.meta.env.VITE_KAKAO_REST_KEY as string | undefined;
  if (!key) {
    // 개발 상세는 콘솔로, 화면에는 사용자 문구만
    console.error('VITE_KAKAO_REST_KEY 미설정 — Kakao Developers에서 REST 키를 발급해 환경변수로 넣어 주세요.');
    throw new Error('장소 검색 준비가 아직 안 됐어요. 잠시 후 다시 시도해 주세요.');
  }
  return key;
}

async function kakaoGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { Authorization: `KakaoAK ${restKey()}` },
  });
  if (!res.ok) {
    console.error(`Kakao Local API HTTP ${res.status} — REST 키·웹 플랫폼 도메인 설정 확인 필요 (${path})`);
    throw new Error('장소 검색이 잠깐 안 되고 있어요. 잠시 후 다시 시도해 주세요.');
  }
  return (await res.json()) as T;
}

/** 키워드 장소 검색 결과 1건 (스팟 입력 ①장소 검색) */
export interface KakaoPlace {
  /** kakao_place_id — 동일 장소 클러스터(×N)의 키 */
  id: string;
  placeName: string;
  categoryName: string;
  roadAddressName: string;
  addressName: string;
  lng: number;
  lat: number;
}

interface RawKeywordDoc {
  id: string;
  place_name: string;
  category_name: string;
  road_address_name: string;
  address_name: string;
  x: string; // lng
  y: string; // lat
}

/** /v2/local/search/keyword.json — 키워드 장소 검색 */
export async function searchPlaces(query: string, size = 10): Promise<KakaoPlace[]> {
  const json = await kakaoGet<{ documents: RawKeywordDoc[] }>('/search/keyword.json', {
    query,
    size: String(size),
  });
  return json.documents.map((d) => ({
    id: d.id,
    placeName: d.place_name,
    categoryName: d.category_name,
    roadAddressName: d.road_address_name,
    addressName: d.address_name,
    lng: Number(d.x),
    lat: Number(d.y),
  }));
}

// 일반구 → 모시(母市) 정규화는 sigunguAlias.ts (행안부 코드표 기반 자동 생성).
// public/geo/sigungu.json·sigungu 시드 모두 같은 법정동코드 앞 5자리 체계라 그대로 매칭된다.
import { normalizeSigunguCode } from './sigunguAlias';
export { normalizeSigunguCode };

/** 좌표→행정구역 판정 결과 */
export interface RegionInfo {
  /** 정규화된 시군구 코드 (spots.sigungu_code에 저장) */
  sigunguCode: string;
  /** 원본 행정구역코드 앞 5자리 (정규화 전) */
  rawCode5: string;
  /** 예: "서울특별시 종로구" */
  regionName: string;
  /** 예: "종로구" */
  sigunguName: string;
}

interface RawRegionDoc {
  region_type: 'H' | 'B';
  code: string; // 10자리 행정구역코드
  address_name: string;
  region_1depth_name: string;
  region_2depth_name: string;
}

/** /v2/local/geo/coord2regioncode.json — 좌표→시군구 코드 (정복 판정 키) */
export async function coordToRegion(lng: number, lat: number): Promise<RegionInfo> {
  const json = await kakaoGet<{ documents: RawRegionDoc[] }>('/geo/coord2regioncode.json', {
    x: String(lng),
    y: String(lat),
  });
  // 법정동(B) 우선 — 행정동(H)은 임의 개편이 잦다. 없으면 첫 문서로 폴백.
  const doc = json.documents.find((d) => d.region_type === 'B') ?? json.documents[0];
  if (!doc) throw new Error('이 좌표의 행정구역을 찾지 못했어요. (해외이거나 바다일 수 있어요)');
  const rawCode5 = doc.code.slice(0, 5);
  return {
    sigunguCode: normalizeSigunguCode(rawCode5),
    rawCode5,
    regionName: [doc.region_1depth_name, doc.region_2depth_name].filter(Boolean).join(' '),
    sigunguName: doc.region_2depth_name || doc.region_1depth_name,
  };
}
