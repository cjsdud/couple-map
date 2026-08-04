/**
 * 실지도(카카오맵) 오버레이용 핀 SVG 문자열 — 도화지 지도의 PinShape와 같은 기하.
 *
 * ConquestMap은 React SVG(PinShape)로 그리고, 카카오맵 CustomOverlay는 DOM 문자열이
 * 필요해서 같은 좌표식을 문자열로 한 번 더 만든다. 모양을 고치면 두 곳을 같이 고칠 것.
 */

export interface PinMarkup {
  html: string;
  /** true면 도형 중심이 좌표에 놓인다(translate -50%,-50%), false면 아래 꼭짓점(콕 핀) */
  centered: boolean;
  /** 라벨을 좌표에서 얼마나 아래로 내릴지(px) — 도형과 겹치지 않는 시작점 */
  labelOffset: number;
}

const STROKE = 'stroke="#fdfcf7" stroke-width="2" stroke-linejoin="round"';

function heartD(x: number, y: number, r: number): string {
  return `M ${x} ${y + r * 1.25} C ${x - r * 2.1} ${y - r * 0.7}, ${x - r * 0.7} ${y - r * 1.7}, ${x} ${y - r * 0.4} C ${x + r * 0.7} ${y - r * 1.7}, ${x + r * 2.1} ${y - r * 0.7}, ${x} ${y + r * 1.25} Z`;
}

function starPoints(x: number, y: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = ((-90 + i * 36) * Math.PI) / 180;
    const rad = i % 2 === 0 ? r * 1.55 : r * 0.7;
    pts.push(`${(x + Math.cos(angle) * rad).toFixed(2)},${(y + Math.sin(angle) * rad).toFixed(2)}`);
  }
  return pts.join(' ');
}

export function pinMarkup(style: string, color: string): PinMarkup {
  if (style === 'heart') {
    const r = 7.5;
    const x = 18;
    const y = 14.7; // 위(-1.7r)·아래(+1.25r) 범위가 세로 가운데 오게
    return {
      html: `<svg width="36" height="26" viewBox="0 0 36 26" aria-hidden="true">
        <path d="${heartD(x, y, r)}" fill="${color}" ${STROKE}/>
        <circle cx="${x - r * 0.8}" cy="${y - r * 0.75}" r="${r * 0.34}" fill="#fdfcf7" opacity="0.85"/>
      </svg>`,
      centered: true,
      labelOffset: 15,
    };
  }
  if (style === 'star') {
    const r = 7;
    return {
      html: `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <polygon points="${starPoints(13, 13, r)}" fill="${color}" ${STROKE}/>
        <circle cx="${13 - r * 0.35}" cy="${13 - r * 0.45}" r="${r * 0.3}" fill="#fdfcf7" opacity="0.85"/>
      </svg>`,
      centered: true,
      labelOffset: 15,
    };
  }
  if (style === 'tape') {
    const r = 7.5;
    const w = r * 3.4;
    const h = r * 1.9;
    return {
      html: `<svg width="32" height="20" viewBox="0 0 32 20" aria-hidden="true">
        <g transform="rotate(-8 16 10)">
          <rect x="${16 - w / 2}" y="${10 - h / 2}" width="${w}" height="${h}" rx="${r * 0.25}" fill="${color}" opacity="0.92" ${STROKE}/>
          <line x1="${16 - r * 1.2}" y1="${10 - r * 0.32}" x2="${16 + r * 1.2}" y2="${10 - r * 0.32}" stroke="#fdfcf7" stroke-width="0.9" opacity="0.5"/>
          <line x1="${16 - r * 1.2}" y1="${10 + r * 0.32}" x2="${16 + r * 1.2}" y2="${10 + r * 0.32}" stroke="#fdfcf7" stroke-width="0.9" opacity="0.5"/>
        </g>
      </svg>`,
      centered: true,
      labelOffset: 13,
    };
  }
  if (style === 'ribbon') {
    const r = 7;
    const x = 16;
    const y = 9;
    const wing = (dir: 1 | -1) =>
      `M ${x} ${y} L ${x + dir * r * 1.7} ${y - r * 1.05} C ${x + dir * r * 2.05} ${y - r * 0.35} ${x + dir * r * 2.05} ${y + r * 0.35} ${x + dir * r * 1.7} ${y + r * 1.05} Z`;
    return {
      html: `<svg width="32" height="18" viewBox="0 0 32 18" aria-hidden="true">
        <path d="${wing(-1)}" fill="${color}" ${STROKE}/>
        <path d="${wing(1)}" fill="${color}" ${STROKE}/>
        <circle cx="${x}" cy="${y}" r="${r * 0.52}" fill="${color}" ${STROKE}/>
        <circle cx="${x - r * 0.16}" cy="${y - r * 0.16}" r="${r * 0.16}" fill="#fdfcf7" opacity="0.85"/>
      </svg>`,
      centered: true,
      labelOffset: 12,
    };
  }
  if (style === 'buddy') {
    const r = 8;
    const x = 18;
    const y = 11.5;
    return {
      html: `<svg width="36" height="24" viewBox="0 0 36 24" aria-hidden="true">
        <path d="${heartD(x - r * 0.5, y + r * 0.15, r * 0.78)}" fill="${color}" ${STROKE} opacity="0.94"/>
        <path d="${heartD(x + r * 0.62, y - r * 0.5, r * 0.6)}" fill="${color}" ${STROKE}/>
        <circle cx="${x + r * 0.28}" cy="${y - r * 0.95}" r="${r * 0.22}" fill="#fdfcf7" opacity="0.85"/>
      </svg>`,
      centered: true,
      labelOffset: 14,
    };
  }
  // 기본 '콕 핀' — 뾰족한 끝(12,31)이 좌표에 닿는다
  return {
    html: `<svg width="24" height="32" viewBox="0 0 24 32" aria-hidden="true">
      <path d="M12 31C5 22 1.5 17 1.5 11.5a10.5 10.5 0 1 1 21 0C22.5 17 19 22 12 31Z"
            fill="${color}" stroke="#fdfcf7" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="12" cy="11.5" r="4" fill="#fdfcf7"/>
    </svg>`,
    centered: false,
    labelOffset: 4,
  };
}
