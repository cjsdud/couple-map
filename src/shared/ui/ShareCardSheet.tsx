import { useEffect, useRef, useState } from 'react';
import {
  cardToBlob,
  DEFAULT_TILTS,
  photoHitsOf,
  SHARE_RATIOS,
  SHARE_SIZES,
  SHARE_THEMES,
  type PhotoAdjust,
  type PhotoAlign,
  type PhotoHit,
  type ShareRatio,
  type ShareTheme,
} from '../lib/shareCard';
import BottomSheet from './BottomSheet';

/** 페인터에 넘기는 선택값 — 스타일·테마·비율·문구·사진 */
export interface ShareOptions {
  theme: ShareTheme;
  ratio: ShareRatio;
  caption: string;
  /** 사용자가 고른 사진 (고른 순서대로) */
  photoUrls: string[];
  /** 사진별 조정값 — photoUrls와 같은 순서 */
  adjusts: PhotoAdjust[];
  /** 사진 묶음이 카드 안에서 놓이는 자리 */
  photoAlign: PhotoAlign;
}

export interface ShareStyle {
  key: string;
  label: string;
  /** 이 스타일이 쓰는 사진 장수 (기본 4) — 풀블리드처럼 한 장짜리는 1 */
  maxPhotos?: number;
  /** 카드를 캔버스에 그리는 페인터 */
  paint: (canvas: HTMLCanvasElement, o: ShareOptions) => Promise<void>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * 스타일 목록 — 사용자는 완성된 한 장을 고르기만 한다 (레이아웃·색을 조합하지 않는다,
   * docs/share-card-v2-plan.md §3). 1개면 선택 줄을 숨긴다.
   */
  styles: ShareStyle[];
  /** 고를 수 있는 사진 전부 — 비어 있으면 사진 줄을 숨긴다 */
  photos?: string[];
  fileName: string;
  /** 문구 입력의 초기값 (예: 기록 메모) */
  defaultCaption?: string;
  /** 문구 입력 안내 문구 */
  captionPlaceholder?: string;
  /**
   * 카드에 들어가는 비동기 데이터의 준비 상태 키 (예: `${사진수}-${지역수}`).
   * 열린 뒤 사진·지역명이 늦게 도착해도 이 키가 바뀌며 다시 그린다.
   */
  contentKey?: string;
}

/**
 * 공유 카드 시트 — 테마·문구를 고쳐가며 미리보기 후 공유하기·이미지 저장.
 * BottomSheet 안 레이어 (IA 원칙: 새 화면 금지).
 *
 * 사진 손보기는 버튼이 아니라 **미리보기 위에서 손가락으로** 한다 (사용자 결정 2026-08-02):
 * 사진을 끌면 보일 부분, 두 손가락으로 크기·기울기, 두 번 톡 치면 처음으로.
 */
export default function ShareCardSheet({
  open,
  onClose,
  styles,
  photos = [],
  fileName,
  defaultCaption = '',
  captionPlaceholder = '문구 넣기 (선택)',
  contentKey = '',
}: Props) {
  const [theme, setTheme] = useState<ShareTheme>('paper');
  const [ratio, setRatio] = useState<ShareRatio>('feed');
  const [styleKey, setStyleKey] = useState(styles[0]?.key ?? '');
  const [caption, setCaption] = useState(defaultCaption);
  const [picked, setPicked] = useState<number[]>([]);
  // 사진별 설정은 URL로 기억한다 — 고른 순서를 바꿔도 그 사진의 설정이 따라온다
  const [tweaks, setTweaks] = useState<Record<string, Partial<PhotoAdjust>>>({});
  const [photoAlign, setPhotoAlign] = useState<PhotoAlign>('center');
  const applied = useDebounced(caption, 450);
  const style = styles.find((s) => s.key === styleKey) ?? styles[0];

  // 스타일마다 쓰는 장수가 달라 고른 것을 앞에서부터 잘라 쓴다.
  // 아직 고르지 않았으면 있는 순서대로 (지금까지와 같은 결과)
  const maxPhotos = style?.maxPhotos ?? 4;
  const order = picked.filter((i) => i < photos.length);
  const chosen = (order.length ? order : photos.map((_, i) => i)).slice(0, maxPhotos);
  const photoUrls = chosen.map((i) => photos[i]);
  const adjusts: PhotoAdjust[] = photoUrls.map((url, i) => ({
    url,
    scale: tweaks[url]?.scale ?? 1,
    focus: tweaks[url]?.focus ?? 0.38,
    tilt: tweaks[url]?.tilt ?? DEFAULT_TILTS[i % DEFAULT_TILTS.length],
  }));
  const setTweak = (url: string, patch: Partial<PhotoAdjust>) =>
    setTweaks((prev) => ({ ...prev, [url]: { ...prev[url], ...patch } }));
  const toggle = (i: number) =>
    setPicked((prev) => {
      const base = prev.filter((n) => n < photos.length);
      if (base.includes(i)) return base.filter((n) => n !== i);
      // 한 장짜리 스타일에서는 방금 고른 것으로 바꿔치기 — 지웠다 고르는 수고를 없앤다
      if (maxPhotos === 1) return [i];
      return [...base, i];
    });

  // 미리보기 제스처 → 그 사진의 조정값으로
  const adjustAtIndex = (index: number, patch: Partial<PhotoAdjust>) => {
    const url = photoUrls[index];
    if (url) setTweak(url, patch);
  };
  const resetAtIndex = (index: number) => {
    const url = photoUrls[index];
    if (!url) return;
    setTweaks((prev) => {
      const next = { ...prev };
      delete next[url];
      return next;
    });
  };

  const paintKey = [
    style?.key,
    theme,
    ratio,
    photoAlign,
    adjusts.map((a) => `${a.scale.toFixed(3)},${a.focus.toFixed(3)},${a.tilt.toFixed(2)}`).join('|'),
    chosen.join(','),
    applied,
    contentKey,
  ].join('§');

  return (
    <BottomSheet open={open} onClose={onClose} title="공유 카드">
      <div className="space-y-3 pb-2">
        {styles.length > 1 && (
          <StylePicker
            options={styles.map((s) => ({ key: s.key, label: s.label }))}
            value={style?.key ?? ''}
            onPick={setStyleKey}
          />
        )}
        {photos.length > 0 && (
          <PhotoPicker photos={photos} chosen={chosen} max={maxPhotos} onToggle={toggle} />
        )}
        {maxPhotos > 1 && photoUrls.length > 1 && (
          <AlignRow align={photoAlign} onAlign={setPhotoAlign} />
        )}
        <ThemePicker theme={theme} onPick={setTheme} />
        <RatioPicker ratio={ratio} onPick={setRatio} />
        <CaptionField value={caption} onChange={setCaption} placeholder={captionPlaceholder} />
        <CardPreview
          paintKey={paintKey}
          paint={(canvas) =>
            style?.paint(canvas, {
              theme,
              ratio,
              caption: applied,
              photoUrls,
              adjusts,
              photoAlign,
            }) ?? Promise.resolve()
          }
          fileName={fileName}
          note={SHARE_SIZES[ratio].note}
          aspect={SHARE_SIZES[ratio].w / SHARE_SIZES[ratio].h}
          gestures={
            photoUrls.length > 0
              ? { adjusts, onAdjust: adjustAtIndex, onReset: resetAtIndex }
              : undefined
          }
        />
      </div>
    </BottomSheet>
  );
}

/** 스타일 고르기 — 완성된 한 장 단위. 조합(레이아웃×테마)을 노출하지 않는다 */
export function StylePicker({
  options,
  value,
  onPick,
}: {
  options: { key: string; label: string }[];
  value: string;
  onPick: (key: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold opacity-50">스타일</p>
      {/* 3개 이상이면 두 줄로 — 한 줄에 밀어 넣으면 글자가 잘린다 */}
      <div className={options.length > 2 ? 'grid grid-cols-2 gap-2' : 'flex gap-2'}>
        {options.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onPick(s.key)}
            className={`flex-1 rounded-2xl rounded-tl-md border-2 py-2 text-xs font-semibold active:translate-y-px ${
              value === s.key ? 'border-pink bg-pink/10' : 'border-ink/15 bg-white/60'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 사진 고르기 — 탭한 순서대로 카드에 들어간다.
 * 한 장짜리 스타일(풀블리드 등)에서는 탭하면 그 사진으로 바뀐다.
 */
export function PhotoPicker({
  photos,
  chosen,
  max,
  onToggle,
}: {
  photos: string[];
  chosen: number[];
  max: number;
  onToggle: (i: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="text-xs font-semibold opacity-50">사진</p>
        <p className="text-xs opacity-40">
          {max === 1 ? '한 장을 골라요' : `탭한 순서대로 · 최대 ${max}장`}
        </p>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {photos.map((url, i) => {
          const at = chosen.indexOf(i);
          return (
            <button
              key={url}
              type="button"
              onClick={() => onToggle(i)}
              aria-label={`사진 ${i + 1} ${at >= 0 ? '빼기' : '넣기'}`}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl rounded-tl-sm border-2 active:translate-y-px ${
                at >= 0 ? 'border-pink' : 'border-ink/15 opacity-50'
              }`}
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
              {at >= 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-pink text-[11px] font-bold text-white">
                  {max === 1 ? '✓' : at + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 사진 묶음을 카드 위/가운데/아래 어디에 둘지 — 여러 장 스타일에서만 뜬다 */
function AlignRow({ align, onAlign }: { align: PhotoAlign; onAlign: (a: PhotoAlign) => void }) {
  const aligns: { label: string; value: PhotoAlign }[] = [
    { label: '위', value: 'top' },
    { label: '가운데', value: 'center' },
    { label: '아래', value: 'bottom' },
  ];
  return (
    <div className="flex items-center gap-2">
      <p className="w-16 shrink-0 text-xs font-semibold opacity-50">사진 자리</p>
      <div className="flex flex-1 gap-2">
        {aligns.map((a) => (
          <button
            key={a.value}
            type="button"
            onClick={() => onAlign(a.value)}
            className={`flex-1 rounded-2xl rounded-tl-md border-2 py-1.5 text-xs font-semibold active:translate-y-px ${
              align === a.value ? 'border-pink bg-pink/10' : 'border-ink/15 bg-white/60'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 비율 고르기 — 세로(4:5)·정사각(1:1)·스토리(9:16) 3종 (계획 §6) */
export function RatioPicker({ ratio, onPick }: { ratio: ShareRatio; onPick: (r: ShareRatio) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold opacity-50">비율</p>
      <div className="flex gap-2">
        {SHARE_RATIOS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => onPick(r.key)}
            className={`flex-1 rounded-2xl rounded-tl-md border-2 py-2 text-xs font-semibold active:translate-y-px ${
              ratio === r.key ? 'border-pink bg-pink/10' : 'border-ink/15 bg-white/60'
            }`}
          >
            {r.label} <span className="opacity-50">{r.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 잦은 재렌더 방지 — 입력이 멈춘 뒤에만 값 반영 */
function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function CaptionField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold opacity-50">문구</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={80}
        placeholder={placeholder}
        className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-2.5 outline-none focus:border-pink"
      />
    </div>
  );
}

/** 테마 선택 칩 — 공유/종합 카드 시트 공용 (6종, 3열 그리드) */
export function ThemePicker({ theme, onPick }: { theme: ShareTheme; onPick: (t: ShareTheme) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold opacity-50">테마</p>
      <div className="grid grid-cols-3 gap-2">
        {SHARE_THEMES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onPick(t.key)}
            className={`flex items-center justify-center gap-1.5 rounded-2xl rounded-tl-md border-2 py-2 text-xs font-semibold active:translate-y-px ${
              theme === t.key ? 'border-pink bg-pink/10' : 'border-ink/15 bg-white/60'
            }`}
          >
            <span
              className="h-4 w-4 shrink-0 rounded-full border border-ink/15"
              style={{ backgroundColor: t.swatch }}
              aria-hidden
            />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 미리보기 위 손가락 제스처 콜백 — index는 photoUrls 순서 */
interface PreviewGestures {
  /** 지금 값 — 제스처 시작점을 여기서 읽는다 */
  adjusts: PhotoAdjust[];
  onAdjust: (index: number, patch: Partial<PhotoAdjust>) => void;
  onReset: (index: number) => void;
}

/** 진행 중 제스처 상태 — 렌더와 무관하게 ref로 들고 간다 */
interface GestureState {
  index: number;
  hitH: number;
  /** 프레임이 사진을 잘라내는가 — true면 끌기가 focus, false면 크기 */
  crop: boolean;
  origin: { x: number; y: number };
  /** 제스처 시작 시점 값 — 여기서부터의 변화량으로 계산한다 */
  start: { scale: number; focus: number; tilt: number };
  /** 지금까지 보낸 값 — 핀치 기준점 재설정에 쓴다 */
  cur: { scale: number; focus: number; tilt: number };
  pinch: { dist: number; angle: number; scale0: number; tilt0: number } | null;
}

/**
 * 미리보기 + 공유/저장 본체.
 *
 * - `paintKey`가 바뀌면 **그 자리에서 다시 그린다** — 예전처럼 통째로 갈아끼우며
 *   '그리는 중…'으로 깜빡이지 않는다. 그리는 동안 이전 카드가 그대로 남는다.
 * - 사진 위에서는 손가락으로 직접: 끌면 보일 부분(focus), 두 손가락 핀치로 크기,
 *   비틀면 기울기, 두 번 톡 치면 처음값. 데스크톱은 휠로 크기.
 */
export function CardPreview({
  paint,
  paintKey = '',
  fileName,
  note = '인스타 세로 규격(4:5)이에요',
  aspect = 1080 / 1350,
  gestures,
}: {
  paint: (canvas: HTMLCanvasElement) => Promise<void>;
  /** 바뀌면 다시 그린다. 안 주면 처음 한 번만 그린다 */
  paintKey?: string;
  fileName: string;
  /** 미리보기 아래 안내 한 줄 (비율에 따라 바뀐다) */
  note?: string;
  /** 캔버스가 그려지기 전에도 자리를 잡아 두는 가로/세로 비 */
  aspect?: number;
  /** 있으면 사진 위 손가락 조작을 켠다 */
  gestures?: PreviewGestures;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [repainting, setRepainting] = useState(false);
  const [hits, setHits] = useState<PhotoHit[]>([]);
  const [dims, setDims] = useState({ w: 1080, h: 1350 });
  const [active, setActive] = useState<number | null>(null);

  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
  });
  const busyRef = useRef(false);
  const queuedRef = useRef(false);

  // paintKey가 바뀔 때마다 다시 그린다. 그리는 중에 또 바뀌면 몰아서 마지막 것만 —
  // 제스처처럼 빠르게 연달아 바뀌어도 밀리지 않는다.
  useEffect(() => {
    if (busyRef.current) {
      queuedRef.current = true;
      return;
    }
    const run = async () => {
      busyRef.current = true;
      setRepainting(true);
      try {
        do {
          queuedRef.current = false;
          const off = document.createElement('canvas');
          try {
            await paintRef.current(off);
            const cv = canvasRef.current;
            if (cv && off.width > 0) {
              cv.width = off.width;
              cv.height = off.height;
              cv.getContext('2d')?.drawImage(off, 0, 0);
              setHits(photoHitsOf(off));
              setDims({ w: off.width, h: off.height });
              setReady(true);
              setFailed(false);
            }
          } catch {
            setFailed(true);
          }
        } while (queuedRef.current);
      } finally {
        busyRef.current = false;
        setRepainting(false);
      }
    };
    void run();
  }, [paintKey]);

  // ── 제스처 (Pointer Events — 터치·마우스 공통) ────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<GestureState | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number; index: number } | null>(null);

  const currentAdjust = (hit: PhotoHit) => {
    const a = gestures?.adjusts[hit.index];
    // 조정한 적 없는 사진은 지금 그려진 기울기(hit.deg)가 곧 현재값
    return a ? { scale: a.scale, focus: a.focus, tilt: a.tilt } : { scale: 1, focus: 0.38, tilt: hit.deg };
  };

  const canvasPos = (e: { clientX: number; clientY: number }) => {
    const cv = canvasRef.current;
    if (!cv) return { x: 0, y: 0 };
    const rect = cv.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * dims.w,
      y: ((e.clientY - rect.top) / rect.height) * dims.h,
    };
  };

  const hitAt = (pos: { x: number; y: number }): PhotoHit | null => {
    // 나중에 그린 사진이 위에 있다 — 뒤에서부터 판정. 손가락은 정확하지 않으니 여유를 둔다
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      const rad = (-h.deg * Math.PI) / 180;
      const dx = pos.x - h.cx;
      const dy = pos.y - h.cy;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      if (Math.abs(lx) <= h.w / 2 + 24 && Math.abs(ly) <= h.h / 2 + 24) return h;
    }
    return null;
  };

  const emit = (patch: Partial<PhotoAdjust>) => {
    const g = gesture.current;
    if (!g || !gestures) return;
    g.cur = { ...g.cur, ...patch };
    gestures.onAdjust(g.index, patch);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!gestures || hits.length === 0) return;
    const pos = canvasPos(e);

    // 두 번째 손가락 — 사진을 살짝 벗어나 닿아도 핀치로 잇는다 (손가락은 정확하지 않다)
    if (gesture.current && pointers.current.size === 1) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, pos);
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        scale0: gesture.current.cur.scale,
        tilt0: gesture.current.cur.tilt,
      };
      return;
    }

    const hit = hitAt(pos);
    if (!hit) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, pos);

    // 두 번 톡 — 처음값으로
    const tap = lastTap.current;
    const now = performance.now();
    if (tap && now - tap.t < 350 && Math.hypot(pos.x - tap.x, pos.y - tap.y) < 60 && tap.index === hit.index) {
      lastTap.current = null;
      gesture.current = null;
      gestures.onReset(hit.index);
      setActive(hit.index);
      window.setTimeout(() => setActive((a) => (a === hit.index ? null : a)), 500);
      return;
    }
    const start = currentAdjust(hit);
    gesture.current = {
      index: hit.index,
      hitH: hit.h,
      crop: hit.crop,
      origin: pos,
      start,
      cur: { ...start },
      pinch: null,
    };
    setActive(hit.index);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    const pos = canvasPos(e);
    pointers.current.set(e.pointerId, pos);

    if (pointers.current.size >= 2 && g.pinch) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const scale = clamp(g.pinch.scale0 * (dist / Math.max(1, g.pinch.dist)), 0.6, 1.35);
      const tilt = clamp(g.pinch.tilt0 + ((angle - g.pinch.angle) * 180) / Math.PI, -12, 12);
      emit({ scale, tilt });
    } else if (pointers.current.size === 1) {
      const dy = pos.y - g.origin.y;
      if (g.crop) {
        // 위아래로 끌면 사진이 따라 움직인다 — 아래로 끌면 윗부분이 보인다
        emit({ focus: clamp(g.start.focus - (dy / Math.max(1, g.hitH)) * 1.4, 0, 1) });
      } else {
        // 액자(그리드) 사진은 잘리는 게 없어 focus가 안 보인다 — 끌기로 크기를 조절한다 (위로 = 크게)
        emit({ scale: clamp(g.start.scale * (1 - dy / Math.max(1, g.hitH * 1.4)), 0.6, 1.35) });
      }
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    const g = gesture.current;
    const had = pointers.current.delete(e.pointerId);
    if (!had || !g) return;
    if (pointers.current.size === 1) {
      // 핀치에서 한 손가락만 남으면 남은 손가락 기준으로 끌기를 다시 잡는다
      const [remain] = [...pointers.current.values()];
      g.origin = remain;
      g.start = { ...g.cur };
      g.pinch = null;
    } else if (pointers.current.size === 0) {
      const pos = canvasPos(e);
      const moved = Math.hypot(pos.x - g.origin.x, pos.y - g.origin.y) > 18;
      lastTap.current = moved ? null : { t: performance.now(), x: pos.x, y: pos.y, index: g.index };
      gesture.current = null;
      setActive(null);
    }
  };

  // 데스크톱 보조 — 사진 위에서 휠을 굴리면 크기 (React 휠 리스너는 passive라 preventDefault는 안 한다)
  const onWheel = (e: React.WheelEvent) => {
    if (!gestures || hits.length === 0) return;
    const pos = canvasPos(e);
    const hit = hitAt(pos);
    if (!hit) return;
    const cur = currentAdjust(hit);
    gestures.onAdjust(hit.index, { scale: clamp(cur.scale - e.deltaY * 0.0015, 0.6, 1.35) });
  };

  // ── 저장·공유 — 누르는 순간의 캔버스를 그대로 내보낸다 ────────
  const download = async () => {
    const cv = canvasRef.current;
    if (!cv) return;
    try {
      const blob = await cardToBlob(cv);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      // 내보내기 실패 — 버튼을 다시 누르면 재시도된다
    }
  };

  const canShare = typeof navigator.share === 'function';
  const share = async () => {
    const cv = canvasRef.current;
    if (!cv) return;
    try {
      const blob = await cardToBlob(cv);
      const file = new File([blob], fileName, { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        await download();
      }
    } catch {
      // 공유 시트를 그냥 닫은 경우 — 조용히 무시
    }
  };

  const activeHit = active !== null ? hits.find((h) => h.index === active) : null;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  if (failed && !ready) {
    return (
      <p className="py-10 text-center text-sm text-pink">
        카드를 그리다가 문제가 생겼어요. 시트를 닫고 다시 열어 주세요.
      </p>
    );
  }

  return (
    <div className="space-y-3 pb-2">
      <div
        className={`relative w-full overflow-hidden rounded-2xl rounded-tl-md border-2 border-ink/10 shadow-sm ${
          active !== null ? 'touch-none' : ''
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onWheel}
      >
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ aspectRatio: `${aspect}` }}
          aria-label="공유 카드 미리보기"
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <p className="text-sm opacity-60">카드를 그리는 중…</p>
          </div>
        )}
        {/* 사진 자리마다 투명한 터치 판 — 여기 위에서는 브라우저 스크롤 대신 제스처가 잡힌다 */}
        {gestures &&
          ready &&
          hits.map((h) => (
            <div
              key={h.index}
              className="absolute touch-none"
              style={{
                left: pct(h.cx - h.w / 2, dims.w),
                top: pct(h.cy - h.h / 2, dims.h),
                width: pct(h.w, dims.w),
                height: pct(h.h, dims.h),
                transform: `rotate(${h.deg}deg)`,
                cursor: 'grab',
              }}
              aria-label={`${h.index + 1}번째 사진 조절`}
            />
          ))}
        {/* 만지는 중인 사진 표시 */}
        {activeHit && (
          <div
            className="pointer-events-none absolute rounded-md border-2 border-dashed border-pink/90"
            style={{
              left: pct(activeHit.cx - activeHit.w / 2, dims.w),
              top: pct(activeHit.cy - activeHit.h / 2, dims.h),
              width: pct(activeHit.w, dims.w),
              height: pct(activeHit.h, dims.h),
              transform: `rotate(${activeHit.deg}deg)`,
            }}
          />
        )}
        {repainting && ready && (
          <span className="absolute right-2 top-2 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold opacity-70">
            그리는 중…
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {canShare && (
          <button
            type="button"
            onClick={() => void share()}
            className="flex-1 rounded-2xl rounded-tl-md bg-pink py-3 text-sm font-bold text-white active:translate-y-px"
          >
            공유하기
          </button>
        )}
        <button
          type="button"
          onClick={() => void download()}
          className={`flex-1 rounded-2xl py-3 text-sm font-bold active:translate-y-px ${
            canShare ? 'rounded-br-md border-2 border-ink/15 bg-white/70' : 'rounded-tl-md bg-pink text-white'
          }`}
        >
          이미지 저장
        </button>
      </div>
      <p className="break-keep text-center text-xs opacity-50">
        {note} · 지출은 담지 않아요
      </p>
      {gestures && hits.length > 0 && (
        <p className="break-keep text-center text-xs opacity-40">
          사진은 미리보기에서 손가락으로 — 끌고, 두 손가락으로 벌리고, 비틀어 보세요. 두 번 톡 치면
          처음으로 돌아와요
        </p>
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
