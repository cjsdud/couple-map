import { SHARE_FONT } from '../shareFonts';
import type { Painter, ShareTheme, Skin } from './types';

/**
 * 팔레트 6종 — 색·폰트·사진 보정·질감만 담는다. 배치는 레이아웃이 정한다.
 * 배경은 캔버스 전체를 채우고(스토리 안전 영역 포함), 테두리 장식만 내용 영역에 맞춘다.
 */
export const PALETTES: Record<ShareTheme, Skin> = {
  paper: {
    ink: '#3b3733',
    title: SHARE_FONT.display,
    body: SHARE_FONT.hand,
    headerDeco: 'tape',
    frame: { mat: '#ffffff', pad: 18, radius: 10, shadow: 0.25, border: null },
    photoTint: [],
    grain: 0,
    bubbleMe: '#9ec3d8',
    bubblePartner: '#e8637c',
    bubbleAlpha: 0.35,
    bubbleInk: '#3b3733',
    badgeBg: '#3b3733',
    badgeInk: '#fdfcf7',
    dark: false,
    map: { sea: '#d6e4ea', land: '#fdfcf7', line: 'rgba(74,69,61,0.34)', fill: '#8cab68', pin: '#e8637c' },
    accentFor: (base) => base,
    paintBg: (p) => {
      const { ctx } = p;
      ctx.fillStyle = '#fdfcf7';
      ctx.fillRect(0, 0, p.W, p.H);
      ctx.strokeStyle = '#3b3733';
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 3 * p.s;
      ctx.save();
      ctx.translate(p.W / 2, (p.top + p.bottom) / 2);
      ctx.rotate(-0.004);
      const w = p.x(1080 - 72);
      const h = p.vh(p.LH - 72);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  },
  film: {
    ink: '#f3ede3',
    title: SHARE_FONT.serif,
    body: SHARE_FONT.hand,
    headerDeco: 'rule',
    frame: { mat: '#0e0d0c', pad: 16, radius: 6, shadow: 0.5, border: 'rgba(224,161,90,0.5)' },
    photoTint: [{ mode: 'soft-light', color: '#e6ad5f', alpha: 0.4 }],
    grain: 0.5,
    bubbleMe: '#8aa2ad',
    bubblePartner: '#d98a97',
    bubbleAlpha: 0.22,
    bubbleInk: '#f3ede3',
    badgeBg: '#e0a15a',
    badgeInk: '#211e1b',
    dark: true,
    map: { sea: '#16130f', land: '#332e27', line: 'rgba(224,161,90,0.45)', fill: '#e0a15a', pin: '#f3ede3' },
    accentFor: () => '#e0a15a',
    paintBg: (p) => {
      const { ctx } = p;
      ctx.fillStyle = '#211e1b';
      ctx.fillRect(0, 0, p.W, p.H);
      ctx.strokeStyle = 'rgba(224,161,90,0.5)';
      ctx.lineWidth = 2 * p.s;
      ctx.strokeRect(p.x(40), p.y(40), p.x(1000), p.vh(1270));
    },
  },
  mono: {
    ink: '#1a1a1a',
    title: SHARE_FONT.serif,
    body: SHARE_FONT.serif,
    headerDeco: 'rule',
    frame: { mat: '#ffffff', pad: 14, radius: 4, shadow: 0.14, border: 'rgba(0,0,0,0.08)' },
    photoDesaturate: 1,
    photoTint: [],
    grain: 0.14,
    bubbleMe: '#111111',
    bubblePartner: '#111111',
    bubbleAlpha: 0.06,
    bubbleInk: '#1a1a1a',
    badgeBg: '#1a1a1a',
    badgeInk: '#ffffff',
    dark: false,
    map: { sea: '#ededed', land: '#ffffff', line: 'rgba(0,0,0,0.38)', fill: '#1a1a1a', pin: '#1a1a1a' },
    accentFor: () => '#1a1a1a',
    paintBg: (p) => {
      const { ctx } = p;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, p.W, p.H);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineWidth = 1 * p.s;
      ctx.strokeRect(p.x(48), p.y(48), p.x(984), p.vh(1254));
    },
  },
  sunset: {
    ink: '#fff5ef',
    title: SHARE_FONT.display,
    body: SHARE_FONT.hand,
    headerDeco: 'rule',
    frame: { mat: '#ffffff', pad: 16, radius: 14, shadow: 0.28, border: null },
    photoTint: [
      { mode: 'soft-light', color: '#ff9ec4', alpha: 0.4 },
      { mode: 'soft-light', color: '#ffd28a', alpha: 0.22 },
    ],
    grain: 0,
    bubbleMe: '#ffffff',
    bubblePartner: '#ffffff',
    bubbleAlpha: 0.16,
    bubbleInk: '#fff5ef',
    badgeBg: '#ffd28a',
    badgeInk: '#3a1f2e',
    dark: true,
    map: { sea: 'rgba(255,255,255,0.10)', land: 'rgba(255,245,239,0.22)', line: 'rgba(255,245,239,0.5)', fill: '#ffd28a', pin: '#ffffff' },
    accentFor: () => '#ffd28a',
    paintBg: (p) => {
      const { ctx } = p;
      const g = ctx.createLinearGradient(0, 0, 0, p.H);
      g.addColorStop(0, '#2a1a2e');
      g.addColorStop(0.55, '#7a3b52');
      g.addColorStop(1, '#c96b6b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, p.W, p.H);
    },
  },
  vintage: {
    ink: '#4a3b2a',
    title: SHARE_FONT.serif,
    body: SHARE_FONT.hand,
    headerDeco: 'tape',
    frame: { mat: '#f4ead2', pad: 18, radius: 8, shadow: 0.22, border: 'rgba(74,59,42,0.28)' },
    photoDesaturate: 0.55,
    photoTint: [{ mode: 'soft-light', color: '#8a5a2a', alpha: 0.5 }],
    grain: 0.4,
    bubbleMe: '#7d8a63',
    bubblePartner: '#a8613f',
    bubbleAlpha: 0.3,
    bubbleInk: '#4a3b2a',
    badgeBg: '#4a3b2a',
    badgeInk: '#f4ead2',
    dark: false,
    map: { sea: '#cfc2a3', land: '#f4ead2', line: 'rgba(74,59,42,0.45)', fill: '#a8613f', pin: '#4a3b2a' },
    accentFor: () => '#a8613f',
    paintBg: (p) => {
      const { ctx } = p;
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(0, 0, p.W, p.H);
      // 세피아 비네트 — 모서리를 살짝 그을린 오래된 사진 느낌
      const cx = p.W / 2;
      const cy = p.H / 2;
      const g = ctx.createRadialGradient(cx, cy, p.H * 0.3, cx, cy, p.H * 0.72);
      g.addColorStop(0, 'rgba(74,59,42,0)');
      g.addColorStop(1, 'rgba(74,59,42,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, p.W, p.H);
      ctx.strokeStyle = 'rgba(74,59,42,0.4)';
      ctx.lineWidth = 3 * p.s;
      ctx.strokeRect(p.x(38), p.y(38), p.x(1004), p.vh(1274));
      ctx.strokeStyle = 'rgba(74,59,42,0.2)';
      ctx.lineWidth = 1.5 * p.s;
      ctx.strokeRect(p.x(48), p.y(48), p.x(984), p.vh(1254));
    },
  },
  pastel: {
    ink: '#5b5570',
    title: SHARE_FONT.round,
    body: SHARE_FONT.round,
    headerDeco: 'rule',
    frame: { mat: '#ffffff', pad: 16, radius: 20, shadow: 0.16, border: null },
    photoTint: [{ mode: 'soft-light', color: '#f4a6c0', alpha: 0.22 }],
    grain: 0,
    bubbleMe: '#a6c8f4',
    bubblePartner: '#f4a6c0',
    bubbleAlpha: 0.42,
    bubbleInk: '#5b5570',
    badgeBg: '#c9a6e0',
    badgeInk: '#ffffff',
    dark: false,
    map: { sea: '#dcebf6', land: '#ffffff', line: 'rgba(91,85,112,0.32)', fill: '#c9a6e0', pin: '#e58ab0' },
    accentFor: () => '#e58ab0',
    paintBg: (p) => {
      const { ctx } = p;
      const g = ctx.createLinearGradient(0, 0, p.W, p.H);
      g.addColorStop(0, '#fdeef4');
      g.addColorStop(0.5, '#eef0fb');
      g.addColorStop(1, '#e9f6f1');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, p.W, p.H);
    },
  },
};

export const SHARE_THEMES: { key: ShareTheme; label: string; swatch: string }[] = [
  { key: 'paper', label: '도화지', swatch: '#fdfcf7' },
  { key: 'film', label: '필름', swatch: '#211e1b' },
  { key: 'mono', label: '미니멀', swatch: '#ffffff' },
  { key: 'sunset', label: '노을', swatch: '#7a3b52' },
  { key: 'vintage', label: '빈티지', swatch: '#c9a66b' },
  { key: 'pastel', label: '파스텔', swatch: '#f4c9dd' },
];

/** 배경 칠하기 — 레이아웃의 첫 줄 */
export function paintBackground(p: Painter) {
  p.skin.paintBg(p);
}
