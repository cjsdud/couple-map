import { useCallback, useEffect, useState } from 'react';

/**
 * Phase 0 스파이크 — "Hello 도화지"
 * 앱인토스 샌드박스 WebView 안에서 아키텍처의 전제 3가지가 동작하는지 진단한다:
 *   ① Supabase REST 익명 쿼리 (외부 API 네트워크 경로 + CORS)
 *   ② Kakao Local REST (키워드 검색 + coord2regioncode)
 *   ③ navigator.geolocation 권한 요청
 * 결과 화면을 캡처해 docs/spike-result.md에 기록한다.
 */

type Status = 'unset' | 'running' | 'ok' | 'warn' | 'fail';

interface CheckResult {
  status: Status;
  detail: string;
}

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

const CHECKS = [
  { key: 'supabase', title: '① Supabase 익명 쿼리', run: checkSupabase },
  { key: 'kakao', title: '② Kakao Local REST', run: checkKakao },
  { key: 'geo', title: '③ 위치 권한 (geolocation)', run: checkGeolocation },
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
  });

  const runOne = useCallback(async (key: CheckKey) => {
    setResults((r) => ({ ...r, [key]: { status: 'running', detail: '' } }));
    const check = CHECKS.find((c) => c.key === key)!;
    const result = await check.run();
    setResults((r) => ({ ...r, [key]: result }));
  }, []);

  useEffect(() => {
    CHECKS.forEach((c) => void runOne(c.key));
  }, [runOne]);

  return (
    <main className="mx-auto max-w-md px-4 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">
          Hello 도화지 <span aria-hidden>🖍️</span>
        </h1>
        <p className="text-sm opacity-70">Phase 0 스파이크 — 앱인토스 WebView 환경 진단</p>
      </header>

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

      <footer className="space-y-1 text-xs opacity-60">
        <p>이 화면을 캡처해서 공유해 주세요. (앱인토스 샌드박스 / 일반 브라우저 각각)</p>
        <p className="break-all">UA: {navigator.userAgent}</p>
      </footer>
    </main>
  );
}
