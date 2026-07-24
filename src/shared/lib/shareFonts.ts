/**
 * 공유 카드 전용 웹폰트 — 캔버스 렌더 품질의 핵심(시스템 폰트 티 제거).
 * 초기 로딩엔 넣지 않고, 공유 시트를 열 때 1회만 지연 로드해 캐시한다.
 * 로드 실패(구형 WebView 등)해도 카드는 시스템 폰트로 폴백해 계속 그려진다.
 */
export const SHARE_FONT = {
  display: 'DohwajiDisplay', // Black Han Sans — 굵은 임팩트 제목
  hand: 'DohwajiHand', // 나눔펜 — 손글씨 본문·인용
  serif: 'DohwajiSerif', // 나눔명조 — 에디토리얼 세리프
  round: 'DohwajiRound', // 개구 — 둥근 손글씨(파스텔)
} as const;

const FILES: { family: string; url: string }[] = [
  { family: SHARE_FONT.display, url: '/fonts/blackhansans.woff2' },
  { family: SHARE_FONT.hand, url: '/fonts/nanumpen.woff2' },
  { family: SHARE_FONT.serif, url: '/fonts/nanummyeongjo.woff2' },
  { family: SHARE_FONT.round, url: '/fonts/gaegu.woff2' },
];

let loading: Promise<void> | null = null;

export function loadShareFonts(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    await Promise.all(
      FILES.map(async (f) => {
        try {
          // weight '100 900': 캔버스가 어떤 굵기를 요청해도 단일 페이스를 쓰게 해
          //   가짜 볼드(faux-bold) 합성으로 글자가 뭉개지는 것을 막는다.
          const face = new FontFace(f.family, `url(${f.url}) format('woff2')`, {
            weight: '100 900',
            display: 'swap',
          });
          await face.load();
          document.fonts.add(face);
        } catch {
          // 개별 폰트 실패는 무시 — 해당 폰트만 시스템 폴백
        }
      }),
    );
  })();
  return loading;
}
