import { useEffect, useRef, useState } from 'react';
import {
  cardToBlob,
  SHARE_RATIOS,
  SHARE_SIZES,
  SHARE_THEMES,
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
  /** 사진 칸 배율 (0.7~1.3) */
  photoScale: number;
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
  const [scale, setScale] = useState(100);
  const applied = useDebounced(caption, 450);
  const style = styles.find((s) => s.key === styleKey) ?? styles[0];

  // 스타일마다 쓰는 장수가 달라 고른 것을 앞에서부터 잘라 쓴다.
  // 아직 고르지 않았으면 있는 순서대로 (지금까지와 같은 결과)
  const maxPhotos = style?.maxPhotos ?? 4;
  const order = picked.filter((i) => i < photos.length);
  const chosen = (order.length ? order : photos.map((_, i) => i)).slice(0, maxPhotos);
  const photoUrls = chosen.map((i) => photos[i]);
  const toggle = (i: number) =>
    setPicked((prev) => {
      const base = prev.filter((n) => n < photos.length);
      if (base.includes(i)) return base.filter((n) => n !== i);
      // 한 장짜리 스타일에서는 방금 고른 것으로 바꿔치기 — 지웠다 고르는 수고를 없앤다
      if (maxPhotos === 1) return [i];
      return [...base, i];
    });

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
          <PhotoPicker
            photos={photos}
            chosen={chosen}
            max={maxPhotos}
            onToggle={toggle}
            scale={scale}
            onScale={setScale}
          />
        )}
        <ThemePicker theme={theme} onPick={setTheme} />
        <RatioPicker ratio={ratio} onPick={setRatio} />
        <CaptionField value={caption} onChange={setCaption} placeholder={captionPlaceholder} />
        {/* 스타일·테마·비율·문구·데이터 준비 상태가 바뀌면 새로 그린다 */}
        <CardPreview
          key={`${style?.key}|${theme}|${ratio}|${scale}|${chosen.join(',')}|${applied}|${contentKey}`}
          paint={(canvas) =>
            style?.paint(canvas, {
              theme,
              ratio,
              caption: applied,
              photoUrls,
              photoScale: scale / 100,
            }) ?? Promise.resolve()
          }
          fileName={fileName}
          note={SHARE_SIZES[ratio].note}
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
  scale,
  onScale,
}: {
  photos: string[];
  chosen: number[];
  max: number;
  onToggle: (i: number) => void;
  scale: number;
  onScale: (v: number) => void;
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
      <label className="mt-2 flex items-center gap-2">
        <span className="shrink-0 text-xs font-semibold opacity-50">사진 크기</span>
        <input
          type="range"
          min={70}
          max={130}
          step={5}
          value={scale}
          onChange={(e) => onScale(Number(e.target.value))}
          className="h-1.5 w-full accent-pink"
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums opacity-50">{scale}%</span>
      </label>
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

/** 미리보기 + 공유/저장 본체. key로 다시 그리기 제어 (마운트 시 1회 그림) */
export function CardPreview({
  paint,
  fileName,
  note = '인스타 세로 규격(4:5)이에요',
}: {
  paint: (canvas: HTMLCanvasElement) => Promise<void>;
  fileName: string;
  /** 미리보기 아래 안내 한 줄 (비율에 따라 바뀐다) */
  note?: string;
}) {
  const paintRef = useRef(paint);
  const blobRef = useRef<Blob | null>(null);
  const [status, setStatus] = useState<'painting' | 'ready' | 'error'>('painting');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    paintRef
      .current(canvas)
      .then(() => cardToBlob(canvas))
      .then((blob) => {
        if (cancelled) return;
        blobRef.current = blob;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  };

  const canShare = typeof navigator.share === 'function';
  const share = () => {
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/png' });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).catch(() => {
        // 공유 시트를 그냥 닫은 경우 — 조용히 무시
      });
    } else {
      download();
    }
  };

  if (status === 'painting') {
    return <p className="py-10 text-center text-sm opacity-50">카드를 그리는 중…</p>;
  }
  if (status === 'error' || !url) {
    return (
      <p className="py-10 text-center text-sm text-pink">
        카드를 그리다가 문제가 생겼어요. 시트를 닫고 다시 열어 주세요.
      </p>
    );
  }
  return (
    <div className="space-y-3 pb-2">
      <img
        src={url}
        alt="공유 카드 미리보기"
        className="w-full rounded-2xl rounded-tl-md border-2 border-ink/10 shadow-sm"
      />
      <div className="flex gap-2">
        {canShare && (
          <button
            type="button"
            onClick={share}
            className="flex-1 rounded-2xl rounded-tl-md bg-pink py-3 text-sm font-bold text-white active:translate-y-px"
          >
            공유하기
          </button>
        )}
        <button
          type="button"
          onClick={download}
          className={`flex-1 rounded-2xl py-3 text-sm font-bold active:translate-y-px ${
            canShare ? 'rounded-br-md border-2 border-ink/15 bg-white/70' : 'rounded-tl-md bg-pink text-white'
          }`}
        >
          이미지 저장
        </button>
      </div>
      <p className="break-keep text-center text-xs opacity-50">
        {note} · 지출은 담지 않아요 · 미리보기를 길게 눌러도 저장돼요
      </p>
    </div>
  );
}
