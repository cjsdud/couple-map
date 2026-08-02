/**
 * 공유 카드 렌더 엔진 — 타입 정의.
 *
 * 구조: 팔레트(색·폰트·질감) / 레이아웃(배치) / 장식(스티커·뱃지)을 분리한다.
 * 사용자에게는 "스타일" 프리셋 하나로만 노출하고, 조합은 내부에서만 만든다
 * (docs/share-card-v2-plan.md §3).
 */

/** 팔레트 키 — 화면에서는 '테마'로 부른다 */
export type ShareTheme = 'paper' | 'film' | 'mono' | 'sunset' | 'vintage' | 'pastel';

/** 비율 3종 (계획 §6) */
export type ShareRatio = 'feed' | 'square' | 'story';

/**
 * 사진 한 장의 조정값 — 사용자가 카드 안에서 손댈 수 있는 전부.
 *
 * 자유도를 최소한으로 쪼갰다: 크게/작게, 어디를 보여줄지, 얼마나 기울일지.
 * 위치를 마음대로 끌어다 놓게 하지 않는 이유는 계획 §2 — 무엇을 골라도 실패하지 않아야 한다.
 */
export interface PhotoAdjust {
  url: string;
  /** 칸 대비 크기 배율 (작게 0.78 · 보통 1 · 크게 1.28) */
  scale: number;
  /** 세로로 어디를 남길지 0(위)~1(아래). 인물은 얼굴이 위쪽이라 기본이 0.38 */
  focus: number;
  /** 기울기(도) — 손으로 붙인 느낌 */
  tilt: number;
}

/** 사진 묶음이 카드 안에서 놓이는 자리 */
export type PhotoAlign = 'top' | 'center' | 'bottom';

/**
 * 그려진 사진 한 장의 실제 위치 (실제 픽셀, 회전 포함).
 * 미리보기가 이 사각형으로 손가락 제스처(끌기·핀치)를 어느 사진에 보낼지 판정한다.
 */
export interface PhotoHit {
  /** photoUrls에서의 순서 — 시트가 이 순서로 조정값을 찾는다 */
  index: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 기울기(도) */
  deg: number;
  /**
   * 프레임이 사진을 잘라내는가 — 잘라내면 끌기가 '보일 부분'(focus)을 움직이고,
   * 사진 비율 그대로인 액자(그리드)는 focus가 보이지 않으므로 끌기를 크기로 보낸다.
   */
  crop: boolean;
}

export interface CardSize {
  key: ShareRatio;
  label: string;
  /** 버튼에 붙는 짧은 비율 표기 (4:5) */
  hint: string;
  /** 미리보기 아래 안내 한 줄 */
  note: string;
  w: number;
  h: number;
  /**
   * 인스타 UI(프로필·답장창)가 덮는 위·아래 영역.
   * 레이아웃은 이 안쪽에만 그린다 — 배경만 끝까지 채운다.
   */
  safeTop: number;
  safeBottom: number;
}

export interface PhotoTint {
  /**
   * separable 모드만 허용 (soft-light 등). 'saturation' 같은 non-separable 블렌드는
   * 브라우저(특히 WebKit·인앱 WebView)마다 동작이 갈려 사진이 아예 안 보일 수 있다 —
   * 채도 낮추기는 photoDesaturate(픽셀 연산)로만 한다.
   */
  mode: GlobalCompositeOperation;
  color: string;
  alpha: number;
}

/** 팔레트 — 색·폰트·사진 보정·질감. 배치는 모른다. */
export interface Skin {
  ink: string; // 본문 텍스트
  /** 제목·날짜·통계용 폰트 패밀리 */
  title: string;
  /** 본문·인용·라벨용 폰트 패밀리 */
  body: string;
  headerDeco: 'tape' | 'rule'; // 제목 위 장식 (마스킹테이프 / 짧은 선)
  frame: { mat: string; pad: number; radius: number; shadow: number; border: string | null };
  /** 사진 채도 낮추기 0(원본)~1(흑백) — 모든 브라우저에서 동일하게 동작하는 픽셀 연산 */
  photoDesaturate?: number;
  /** 사진 위 색보정 (테마 톤으로 통일) */
  photoTint: PhotoTint[];
  /** 필름/종이 그레인 세기 (0 = 없음) */
  grain: number;
  bubbleMe: string;
  bubblePartner: string;
  bubbleAlpha: number;
  bubbleInk: string;
  badgeBg: string;
  badgeInk: string;
  /** 어두운 배경인가 — 그라데이션·낙서 색을 고를 때 쓴다 */
  dark: boolean;
  /** 지도 카드 색 — 바다·육지·경계선·정복 색칠·핀 */
  map: { sea: string; land: string; line: string; fill: string; pin: string };
  /** 카드별 기본 강조색(pink/yellow/green)을 테마에 맞게 변환 */
  accentFor: (base: string) => string;
  paintBg: (p: Painter) => void;
}

/**
 * 페인터 — 캔버스 + 좌표 변환.
 *
 * 레이아웃은 **가로 1080 기준 좌표**로 쓰고, 실제 비율 변환은 여기서 흡수한다.
 * 세로는 찌그러뜨리지 않는다 — 예전엔 1350 기준 세로를 비율마다 눌러 담아서
 * 정사각·스토리에서 사진이 납작해지거나 늘어났다. 지금은 가로·세로 같은 배율이고,
 * 대신 내용 높이(`LH`)가 비율마다 달라진다. 레이아웃은 위는 고정 좌표로,
 * 아래는 `LH` 기준으로 앉히고, 사진처럼 유연한 영역이 남는 높이를 흡수한다.
 */
export interface Painter {
  ctx: CanvasRenderingContext2D;
  /** 캔버스 실제 크기 */
  W: number;
  H: number;
  size: CardSize;
  skin: Skin;
  /** 배율 (1080 기준) — 가로·세로 공통. 글자·선 굵기에 곱한다 */
  s: number;
  /**
   * 내용 영역의 세로 길이 (1080 기준 좌표계).
   * 세로(4:5) 1350 · 정사각 1080 · 스토리 ~1480 — 아래 요소는 여기서부터 뺀 자리에 앉힌다.
   */
  LH: number;
  /** 1080 기준 x → 실제 x */
  x: (v: number) => number;
  /** 기준 y → 실제 y (안전 영역 반영, 세로 배율은 가로와 같다) */
  y: (v: number) => number;
  /** 기준 세로 길이 → 실제 길이 */
  vh: (v: number) => number;
  /** 내용 영역 위·아래 경계 (실제 픽셀) */
  top: number;
  bottom: number;
  /** 폰트 문자열 — 크기는 1080 기준으로 넣으면 배율이 적용된다 */
  font: (family: string, size: number, weight?: number) => string;
  /** 이모지(기분)는 시스템 이모지 폰트로 */
  emoji: (size: number) => string;
  /** 이번 그리기에서 사진이 앉은 자리들 — 미리보기 제스처 판정용 */
  hits: PhotoHit[];
}
