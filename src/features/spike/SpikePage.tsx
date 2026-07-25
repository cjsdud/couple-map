import { useCallback, useEffect, useState } from 'react';
import { KAKAO_JS_KEY, loadKakaoMaps } from '../../shared/lib/kakaoMap';

/**
 * Phase 0 스파이크 — "Hello 도화지"
 * 앱인토스 샌드박스 WebView 안에서 아키텍처의 전제가 동작하는지 진단한다:
 *   ① Supabase REST 익명 쿼리 (외부 API 네트워크 경로 + CORS)
 *   ② Kakao Local REST (키워드 검색 + coord2regioncode)
 *   ③ navigator.geolocation 권한 요청
 *   ④ 저장소 지속성 (미니앱 재진입 시 Supabase 세션이 살아남는지)
 * 실행 Origin은 CORS·플랫폼 도메인 등록값이 되므로 화면 맨 위에 크게 띄운다
 * (샌드박스는 Vercel URL이 아니라 dohwaji.private-apps.tossmini.com에서 서빙됨).
 * 결과를 복사해 docs/spike-result.md에 기록한다.
 */

type Status = 'unset' | 'running' | 'ok' | 'warn' | 'fail';

interface CheckResult {
  status: Status;
  detail: string;
}

/** 재진입 판정용 스탬프 — '다시 실행'이 방금 쓴 값을 이전 방문으로 오인하지 않도록 모듈 로드 시 1회만 읽는다 */
const STAMP_KEY = 'dohwaji-spike-stamp';
const PRIOR_STAMP = (() => {
  try {
    return localStorage.getItem(STAMP_KEY);
  } catch {
    return null;
  }
})();

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const KAKAO_REST_KEY = import.meta.env.VITE_KAKAO_REST_KEY as string | undefined;

async function checkSupabase(): Promise<CheckResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { status: 'unset', detail: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 환경변수가 설정되지 않았어요.' };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/spike_ping?select=*&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (res.ok) {
      const rows: unknown[] = await res.json();
      return {
        status: 'ok',
        detail: `네트워크·CORS·익명 쿼리 성공 (${rows.length}행 수신). WebView에서 Supabase 사용 가능.`,
      };
    }
    return {
      status: 'warn',
      detail: `서버 도달은 성공했지만 HTTP ${res.status} 응답. spike_ping 테이블·RLS 정책이 준비됐는지 확인 필요 (네트워크 경로 자체는 열려 있음).`,
    };
  } catch (e) {
    return { status: 'fail', detail: `fetch 실패 — WebView가 supabase.co 호출을 차단했을 가능성. (${String(e)})` };
  }
}

async function checkKakao(): Promise<CheckResult> {
  if (!KAKAO_REST_KEY) {
    return { status: 'unset', detail: 'VITE_KAKAO_REST_KEY 환경변수가 설정되지 않았어요.' };
  }
  const headers = { Authorization: `KakaoAK ${KAKAO_REST_KEY}` };
  try {
    const search = await fetch(
      'https://dapi.kakao.com/v2/local/search/keyword.json?query=%EC%B9%B4%ED%8E%98&size=1',
      { headers },
    );
    if (!search.ok) {
      return {
        status: 'warn',
        detail: `dapi.kakao.com 도달은 성공, HTTP ${search.status} — REST 키 또는 플랫폼(웹 도메인) 설정 확인 필요.`,
      };
    }
    const searchJson = await search.json();
    const first = searchJson.documents?.[0]?.place_name ?? '(결과 없음)';

    // 강남역 좌표로 정복 판정 API(coord2regioncode)까지 확인
    const region = await fetch(
      'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=127.0276&y=37.4979',
      { headers },
    );
    const regionJson = region.ok ? await region.json() : null;
    const regionName = regionJson?.documents?.find((d: { region_type: string }) => d.region_type === 'H')
      ?? regionJson?.documents?.[0];

    return {
      status: 'ok',
      detail: `키워드 검색 OK ("${first}"), coord2regioncode ${region.ok ? `OK (${regionName?.address_name ?? '?'}, 코드 ${regionName?.code ?? '?'})` : `HTTP ${region.status}`}.`,
    };
  } catch (e) {
    return { status: 'fail', detail: `fetch 실패 — WebView가 dapi.kakao.com 호출을 차단했을 가능성. (${String(e)})` };
  }
}

function checkGeolocation(): Promise<CheckResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ status: 'fail', detail: '이 WebView에는 navigator.geolocation API가 없어요.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          status: 'ok',
          detail: `위치 획득 성공 (약 ${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)} · 정확도 ${Math.round(pos.coords.accuracy)}m). "지금 여기" 기능 가능.`,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          resolve({
            status: 'fail',
            detail: '권한 거부됨 — 앱인토스 권한 정책 확인 필요. 거부가 OS 다이얼로그였는지, 다이얼로그 없이 즉시 실패였는지 기록해 주세요.',
          });
        } else {
          resolve({ status: 'warn', detail: `권한은 통과했지만 위치 획득 실패 (code ${err.code}: ${err.message}).` });
        }
      },
      { timeout: 15000, maximumAge: 0 },
    );
  });
}

/**
 * ④ 저장소 지속성 — Supabase 세션은 localStorage에 저장되므로,
 * 미니앱을 닫았다 다시 열었을 때 값이 남아야 "재진입 시 로그인 유지"가 성립한다.
 */
async function checkStorage(): Promise<CheckResult> {
  const now = Date.now();
  let local: string;
  try {
    localStorage.setItem(STAMP_KEY, String(now));
    local = localStorage.getItem(STAMP_KEY) === String(now) ? '쓰기·읽기 OK' : '쓴 값이 되읽히지 않음';
  } catch (e) {
    return {
      status: 'fail',
      detail: `localStorage 사용 불가 — 이 WebView에서는 로그인 유지가 안 돼요. 세션 저장 방식을 바꿔야 합니다. (${String(e)})`,
    };
  }

  let cookie = '차단됨';
  try {
    document.cookie = `${STAMP_KEY}=${now}; path=/; max-age=86400; SameSite=Lax`;
    if (document.cookie.includes(STAMP_KEY)) cookie = '동작';
  } catch {
    // 쿠키는 보조 지표 — 실패해도 localStorage가 되면 세션 유지에는 문제없다
  }

  if (!PRIOR_STAMP) {
    return {
      status: 'warn',
      detail: `localStorage ${local} · 쿠키 ${cookie}. 아직 이전 방문 기록이 없어요 — 미니앱을 완전히 닫았다가 다시 열어 이 항목을 확인해 주세요 (그때 '성공'으로 바뀌면 재진입 유지 OK).`,
    };
  }
  const minutes = Math.round((now - Number(PRIOR_STAMP)) / 60000);
  return {
    status: 'ok',
    detail: `localStorage ${local} · 쿠키 ${cookie}. 이전 방문 기록이 살아 있어요 (${minutes}분 전). 재진입해도 Supabase 세션이 유지됩니다.`,
  };
}

/**
 * ⑤ Kakao Maps JS SDK — REST(②)와 달리 **사이트 도메인 검사**가 있다.
 * Kakao Developers 플랫폼(Web)에 실행 Origin이 등록돼 있지 않으면 여기서만 실패한다.
 * 실지도 모드의 동작 여부가 이 항목에 달려 있다.
 */
async function checkKakaoSdk(): Promise<CheckResult> {
  if (!KAKAO_JS_KEY) {
    return { status: 'unset', detail: 'VITE_KAKAO_JS_KEY 환경변수가 설정되지 않았어요.' };
  }
  try {
    await Promise.race([
      loadKakaoMaps(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('10초 안에 응답 없음')), 10000)),
    ]);
  } catch (e) {
    return {
      status: 'fail',
      detail: `SDK 로드 실패 — Kakao Developers 플랫폼(Web) 사이트 도메인에 "${window.location.origin}"이 등록됐는지 확인해 주세요. (${String(e)})`,
    };
  }
  // 로드만으로는 부족 — 실제 지도 객체를 만들어봐야 도메인 거부가 드러난다
  try {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-9999px;width:200px;height:200px';
    document.body.appendChild(probe);
    new window.kakao.maps.Map(probe, {
      center: new window.kakao.maps.LatLng(37.5665, 126.978),
      level: 5,
    });
    probe.remove();
    return { status: 'ok', detail: '지도 SDK 로드·지도 생성 성공. 실지도 모드 사용 가능.' };
  } catch (e) {
    return { status: 'warn', detail: `SDK는 받았지만 지도 생성 실패 (${String(e)}).` };
  }
}

const CHECKS = [
  { key: 'supabase', title: '① Supabase 익명 쿼리', run: checkSupabase },
  { key: 'kakao', title: '② Kakao Local REST', run: checkKakao },
  { key: 'geo', title: '③ 위치 권한 (geolocation)', run: checkGeolocation },
  { key: 'storage', title: '④ 저장소 지속성 (재진입)', run: checkStorage },
  { key: 'kakaoSdk', title: '⑤ Kakao 지도 SDK (도메인 검사)', run: checkKakaoSdk },
] as const;

type CheckKey = (typeof CHECKS)[number]['key'];

const STATUS_UI: Record<Status, { label: string; cls: string }> = {
  unset: { label: '키 미설정', cls: 'bg-yellow/20 text-ink' },
  running: { label: '확인 중…', cls: 'bg-sky/30 text-ink' },
  ok: { label: '성공', cls: 'bg-green text-white' },
  warn: { label: '부분 성공', cls: 'bg-yellow text-ink' },
  fail: { label: '실패', cls: 'bg-pink text-white' },
};

export default function SpikePage() {
  const [results, setResults] = useState<Record<CheckKey, CheckResult>>({
    supabase: { status: 'running', detail: '' },
    kakao: { status: 'running', detail: '' },
    geo: { status: 'running', detail: '' },
    storage: { status: 'running', detail: '' },
    kakaoSdk: { status: 'running', detail: '' },
  });
  const [copied, setCopied] = useState(false);

  const runOne = useCallback(async (key: CheckKey) => {
    setResults((r) => ({ ...r, [key]: { status: 'running', detail: '' } }));
    const check = CHECKS.find((c) => c.key === key)!;
    const result = await check.run();
    setResults((r) => ({ ...r, [key]: result }));
  }, []);

  useEffect(() => {
    CHECKS.forEach((c) => void runOne(c.key));
  }, [runOne]);

  // 캡처 대신 텍스트로 넘길 수 있게 — WebView에서는 스크린샷 공유가 번거롭다
  const report = [
    `[도화지 스파이크 결과]`,
    `Origin: ${window.location.origin}`,
    `URL: ${window.location.href}`,
    `UA: ${navigator.userAgent}`,
    ...CHECKS.map((c) => `${c.title}: ${STATUS_UI[results[c.key].status].label} — ${results[c.key].detail}`),
  ].join('\n');

  const copyReport = () => {
    void navigator.clipboard
      ?.writeText(report)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <main className="mx-auto max-w-md px-4 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">
          Hello 도화지 <span aria-hidden>🖍️</span>
        </h1>
        <p className="text-sm opacity-70">Phase 0 스파이크 — 앱인토스 WebView 환경 진단</p>
      </header>

      {/* Origin은 Supabase CORS·카카오 플랫폼 도메인에 등록할 값 — 샌드박스에서 제일 먼저 확인한다 */}
      <section className="rounded-2xl rounded-tl-md border-2 border-sky/60 bg-sky/10 p-4 space-y-1">
        <h2 className="text-sm font-bold">실행 위치 (Origin)</h2>
        <p className="break-all font-mono text-sm font-bold">{window.location.origin}</p>
        <p className="text-xs leading-relaxed opacity-70">
          이 주소를 Supabase 허용 도메인과 카카오 플랫폼에 등록해야 해요. 샌드박스라면{' '}
          <span className="font-mono">dohwaji.private-apps.tossmini.com</span> 형태여야 정상이에요.
        </p>
      </section>

      {CHECKS.map((c) => {
        const r = results[c.key];
        const ui = STATUS_UI[r.status];
        return (
          <section
            key={c.key}
            className="rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/60 p-4 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{c.title}</h2>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${ui.cls}`}>{ui.label}</span>
            </div>
            {r.detail && <p className="text-sm leading-relaxed break-all">{r.detail}</p>}
            <button
              type="button"
              onClick={() => void runOne(c.key)}
              className="rounded-full border border-ink/25 px-3 py-1 text-xs active:bg-ink/10"
            >
              다시 실행
            </button>
          </section>
        );
      })}

      <section className="space-y-2">
        <button
          type="button"
          onClick={copyReport}
          className="w-full rounded-2xl rounded-tl-md bg-pink py-3 text-sm font-bold text-white active:translate-y-px"
        >
          {copied ? '복사됐어요 — 붙여넣어 공유해 주세요' : '결과 전체 복사하기'}
        </button>
        <textarea
          readOnly
          value={report}
          rows={6}
          className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 p-3 font-mono text-[11px] leading-relaxed"
        />
      </section>

      <footer className="space-y-3 text-xs opacity-60">
        <p>복사가 안 되면 위 상자의 내용을 길게 눌러 선택·복사하거나, 화면을 캡처해 주세요.</p>
        <p>앱인토스 샌드박스와 일반 브라우저에서 각각 한 번씩 실행하면 비교가 됩니다.</p>
        {/* 미니앱 WebView엔 뒤로가기 주소창이 없다 — 앱으로 돌아갈 길을 남긴다 */}
        <button
          type="button"
          onClick={() => {
            window.location.hash = '';
          }}
          className="rounded-full border border-ink/25 px-4 py-1.5 font-semibold active:bg-ink/10"
        >
          ← 도화지로 돌아가기
        </button>
      </footer>
    </main>
  );
}
