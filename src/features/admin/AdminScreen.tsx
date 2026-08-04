import { useEffect, useState } from 'react';
import { apiUrl } from '../../shared/lib/apiBase';
import { supabase } from '../../shared/lib/supabase';
import { ACTIVITY_ICONS, relativeTime, type ActivityKind } from '../activity/useActivity';

/**
 * 관리자 현황 (/admin) — 운영자(박천영)만 보는 별도 관문 페이지.
 *
 * 커플 앱 3탭(절대 규칙 1) 밖의 페이지다 — /install과 같은 층.
 * 데이터는 전부 서버 함수(api/admin-stats, service role + ADMIN_USER_IDS 화이트리스트)에서
 * 온다. 클라이언트는 남의 데이터를 직접 읽지 않는다 (절대 규칙 5).
 *
 * 기록·오늘의 글 내용까지 그대로 보여준다 (운영자 결정 2026-08-03 — 분석 목적).
 * 사진 원본은 담지 않는다. 개인정보 처리방침에 운영자 열람 범위를 밝혀 두는 것을 전제로 한다.
 */

interface AdminUser {
  userId: string;
  nickname: string;
  email: string | null;
  createdAt: string;
  coupleId: string | null;
  coupleStatus: string | null;
  partnerNickname: string | null;
  recordCount: number;
  dailyCount: number;
  lastSeen: string | null;
}
interface AdminActivity {
  id: string;
  actorId: string;
  actorNickname: string;
  kind: string;
  title: string;
  createdAt: string;
}
interface AdminRecord {
  id: string;
  coupleId: string;
  createdBy: string | null;
  createdByNickname: string | null;
  date: string;
  status: string;
  memo: string | null;
  spots: { name: string; note: string | null }[];
  expenseTotal: number;
  createdAt: string;
}
interface AdminDailyEntry {
  userId: string;
  nickname: string;
  entryDate: string;
  mood: string | null;
  note: string | null;
  answer: string | null;
  questionText: string | null;
  createdAt: string;
}
interface AdminGrowth {
  signups: { today: number; week: number; prevWeek: number; total: number };
  active: { today: number; week: number };
  perUser: { records: number; daily: number };
  engagedRate: number;
  signupDaily: { date: string; events: number }[];
}
interface AdminStats {
  generatedAt: string;
  growth: AdminGrowth;
  totals: {
    users: number;
    couples: number;
    couplesActive: number;
    couplesPending: number;
    records: number;
    recordsVisited: number;
    recordsPlanned: number;
    spots: number;
    recordPhotos: number;
    dailyEntries: number;
    dailyPhotos: number;
    pushSubs: number;
    activityEvents: number;
  };
  users: AdminUser[];
  activity: AdminActivity[];
  daily: { date: string; events: number }[];
  records: AdminRecord[];
  dailyEntries: AdminDailyEntry[];
}

type Load =
  | { state: 'loading' }
  | { state: 'no-login' }
  | { state: 'not-admin'; yourUserId: string }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: AdminStats };

const MOCK_STATS: AdminStats = {
  generatedAt: new Date().toISOString(),
  growth: {
    signups: { today: 2, week: 9, prevWeek: 4, total: 24 },
    active: { today: 5, week: 14 },
    perUser: { records: 1.8, daily: 3.4 },
    engagedRate: 0.71,
    signupDaily: Array.from({ length: 14 }, (_, i) => ({
      date: new Date(Date.now() - (13 - i) * 86400_000).toISOString().slice(0, 10),
      events: [0, 0, 1, 0, 2, 1, 0, 1, 3, 0, 1, 2, 1, 2][i],
    })),
  },
  totals: {
    users: 4,
    couples: 2,
    couplesActive: 1,
    couplesPending: 1,
    records: 17,
    recordsVisited: 14,
    recordsPlanned: 3,
    spots: 29,
    recordPhotos: 41,
    dailyEntries: 22,
    dailyPhotos: 35,
    pushSubs: 3,
    activityEvents: 63,
  },
  users: [
    { userId: 'u1', nickname: '체리', email: 'cherry@kakao.com', createdAt: '2026-07-01T02:00:00Z', coupleId: 'c1', coupleStatus: 'active', partnerNickname: '두부', recordCount: 9, dailyCount: 12, lastSeen: new Date(Date.now() - 40 * 60000).toISOString() },
    { userId: 'u2', nickname: '두부', email: 'dubu@kakao.com', createdAt: '2026-07-01T03:00:00Z', coupleId: 'c1', coupleStatus: 'active', partnerNickname: '체리', recordCount: 8, dailyCount: 10, lastSeen: new Date(Date.now() - 3 * 3600_000).toISOString() },
    { userId: 'u3', nickname: '망고', email: null, createdAt: '2026-08-01T09:00:00Z', coupleId: 'c2', coupleStatus: 'pending', partnerNickname: null, recordCount: 0, dailyCount: 0, lastSeen: new Date(Date.now() - 26 * 3600_000).toISOString() },
    { userId: 'u4', nickname: '라떼', email: 'latte@kakao.com', createdAt: '2026-08-02T11:00:00Z', coupleId: null, coupleStatus: null, partnerNickname: null, recordCount: 0, dailyCount: 0, lastSeen: null },
  ],
  activity: [
    { id: 'a1', actorId: 'u1', actorNickname: '체리', kind: 'record_create', title: '망원한강공원 데이트를 남겼어요', createdAt: new Date(Date.now() - 40 * 60000).toISOString() },
    { id: 'a2', actorId: 'u2', actorNickname: '두부', kind: 'today', title: '오늘을 남겼어요', createdAt: new Date(Date.now() - 3 * 3600_000).toISOString() },
    { id: 'a3', actorId: 'u1', actorNickname: '체리', kind: 'couple_theme', title: '도화지 옷을 갈아입혔어요', createdAt: new Date(Date.now() - 20 * 3600_000).toISOString() },
  ],
  daily: Array.from({ length: 14 }, (_, i) => ({
    date: new Date(Date.now() - (13 - i) * 86400_000).toISOString().slice(0, 10),
    events: [0, 1, 3, 2, 0, 4, 5, 2, 1, 0, 3, 6, 2, 4][i],
  })),
  records: [
    {
      id: 'r1', coupleId: 'c1', createdBy: 'u1', createdByNickname: '체리', date: '2026-08-02', status: 'visited',
      memo: '한강 보고 걷다가 발견한 집, 또 가자고 약속함',
      spots: [
        { name: '망원한강공원', note: null },
        { name: '소금집 델리', note: '창가 자리 앉아서 두 시간 수다 떨었다' },
      ],
      expenseTotal: 45000, createdAt: new Date(Date.now() - 40 * 60000).toISOString(),
    },
    {
      id: 'r2', coupleId: 'c1', createdBy: 'u2', createdByNickname: '두부', date: '2026-07-28', status: 'planned',
      memo: null, spots: [{ name: '여수 낭만포차거리', note: null }], expenseTotal: 0,
      createdAt: new Date(Date.now() - 5 * 86400_000).toISOString(),
    },
  ],
  dailyEntries: [
    {
      userId: 'u1', nickname: '체리', entryDate: '2026-08-02', mood: '🥰',
      note: '퇴근길에 하늘이 예뻐서 사진 찍었다', answer: '제주',
      questionText: '요즘 제일 가고 싶은 곳은?', createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    },
    {
      userId: 'u2', nickname: '두부', entryDate: '2026-08-02', mood: '😆',
      note: null, answer: '삿포로', questionText: '요즘 제일 가고 싶은 곳은?',
      createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    },
  ],
};

function kst(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AdminScreen() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    void (async () => {
      if (new URLSearchParams(window.location.search).has('mock')) {
        setLoad({ state: 'ready', data: MOCK_STATS });
        return;
      }
      if (!supabase) {
        setLoad({ state: 'error', message: '서버 연결 전이라 현황을 볼 수 없어요.' });
        return;
      }
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        setLoad({ state: 'no-login' });
        return;
      }
      try {
        const res = await fetch(apiUrl('/api/admin-stats'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        });
        const body = (await res.json()) as { reason?: string; yourUserId?: string; error?: string } & AdminStats;
        if (res.status === 403 && body.reason === 'not-admin') {
          setLoad({ state: 'not-admin', yourUserId: body.yourUserId ?? '' });
          return;
        }
        if (!res.ok) {
          setLoad({ state: 'error', message: body.error ?? '현황을 불러오지 못했어요.' });
          return;
        }
        setLoad({ state: 'ready', data: body });
      } catch {
        setLoad({ state: 'error', message: '네트워크 문제로 불러오지 못했어요. 새로고침해 주세요.' });
      }
    })();
  }, []);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 pb-16 pt-8">
      <header className="mb-5 flex items-baseline justify-between">
        <div>
          <p className="text-xs font-bold tracking-wide text-pink opacity-80">관리자</p>
          <h1 className="text-2xl font-bold">우리의 도화지 현황</h1>
        </div>
        <a href="/" className="text-sm opacity-50 underline underline-offset-2">
          앱으로
        </a>
      </header>

      {load.state === 'loading' && <p className="py-16 text-center text-sm opacity-50">현황을 세는 중…</p>}

      {load.state === 'no-login' && (
        <Notice title="로그인이 필요해요">
          먼저 <a href="/" className="text-pink underline">앱 홈</a>에서 관리자 계정으로 로그인한 뒤,
          이 주소(/admin)를 다시 열어 주세요.
        </Notice>
      )}

      {load.state === 'not-admin' && (
        <Notice title="관리자로 등록되지 않은 계정이에요">
          <p className="break-keep">
            이 계정을 관리자로 쓰려면 Vercel → Settings → Environment Variables에
            아래 값을 넣고 재배포해 주세요.
          </p>
          <div className="mt-3 rounded-xl rounded-tl-sm border border-ink/15 bg-white/80 p-3 text-left text-xs">
            <p className="font-bold">ADMIN_USER_IDS</p>
            <p className="mt-1 select-all break-all font-mono">{load.yourUserId}</p>
          </div>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(load.yourUserId).catch(() => undefined)}
            className="mt-2 rounded-xl rounded-tl-sm border-2 border-ink/15 bg-white/70 px-4 py-2 text-xs font-bold"
          >
            내 ID 복사하기
          </button>
        </Notice>
      )}

      {load.state === 'error' && <Notice title="불러오지 못했어요">{load.message}</Notice>}

      {load.state === 'ready' && <Dashboard data={load.data} />}
    </main>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 p-5 text-center">
      <p className="text-base font-bold">{title}</p>
      <div className="mt-2 text-sm leading-relaxed opacity-70">{children}</div>
    </div>
  );
}

function Dashboard({ data }: { data: AdminStats }) {
  const t = data.totals;
  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: '가입자', value: String(t.users) },
    {
      label: '커플',
      value: String(t.couples),
      sub: `연결 ${t.couplesActive} · 대기 ${t.couplesPending}`,
    },
    {
      label: '데이트 기록',
      value: String(t.records),
      sub: `다녀옴 ${t.recordsVisited} · 가고싶다 ${t.recordsPlanned}`,
    },
    { label: '오늘 참여', value: String(t.dailyEntries), sub: `사진 ${t.dailyPhotos}장` },
    { label: '스팟 / 기록 사진', value: `${t.spots} / ${t.recordPhotos}` },
    { label: '푸시 구독 기기', value: String(t.pushSubs) },
  ];

  return (
    <div className="space-y-6">
      <GrowthPanel g={data.growth} />

      <section>
        <h2 className="mb-2 text-sm font-bold opacity-70">누적</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-2xl rounded-tl-md border-2 border-ink/10 bg-white/70 p-3">
              <p className="text-xs opacity-50">{tile.label}</p>
              <p className="mt-0.5 text-2xl font-bold text-pink">{tile.value}</p>
              {tile.sub && <p className="mt-0.5 text-[11px] opacity-45">{tile.sub}</p>}
            </div>
          ))}
        </div>
      </section>

      <DailyChart daily={data.daily} />
      <UserList
        users={data.users}
        activity={data.activity}
        records={data.records}
        dailyEntries={data.dailyEntries}
      />
      <RecordFeed records={data.records} />
      <TodayFeed entries={data.dailyEntries} />
      <ActivityFeed activity={data.activity} total={t.activityEvents} />

      <p className="break-keep text-center text-xs opacity-40">
        {kst(data.generatedAt)} 기준 · 글 내용이 그대로 보여요 — 운영·분석 목적으로만 보고,
        개인정보 처리방침에 열람 범위를 밝혀 두세요. 사진 원본은 담지 않아요.
      </p>
    </div>
  );
}

/** 기록 한 건 — 코스·한마디·메모·지출 합계까지 읽히는 카드 */
function RecordRow({ r }: { r: AdminRecord }) {
  return (
    <li className="rounded-xl rounded-tl-sm border border-ink/10 bg-white/80 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <p className="min-w-0 truncate font-bold">
          {r.date}
          <span className="ml-1.5 font-normal opacity-55">
            {r.createdByNickname ?? '?'} · {r.status === 'visited' ? '다녀옴' : '가고싶다'}
            {r.expenseTotal > 0 && ` · ${r.expenseTotal.toLocaleString()}원`}
          </span>
        </p>
        <span className="shrink-0 opacity-40">{kst(r.createdAt)}</span>
      </div>
      <p className="mt-1 break-keep text-xs opacity-75">
        {r.spots.map((s, i) => (
          <span key={i}>
            {i > 0 && ' → '}
            {s.name}
            {s.note && <span className="opacity-60"> ({s.note})</span>}
          </span>
        ))}
      </p>
      {r.memo && <p className="mt-0.5 break-keep text-xs opacity-60">“{r.memo}”</p>}
    </li>
  );
}

/** 오늘 한 건 — 기분·일기·질문 답까지 */
function TodayRow({ d, showName = true }: { d: AdminDailyEntry; showName?: boolean }) {
  return (
    <li className="rounded-xl rounded-tl-sm border border-ink/10 bg-white/80 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <p className="min-w-0 truncate font-bold">
          {d.entryDate}
          {d.mood && <span className="ml-1">{d.mood}</span>}
          {showName && <span className="ml-1.5 font-normal opacity-55">{d.nickname}</span>}
        </p>
        <span className="shrink-0 opacity-40">{kst(d.createdAt)}</span>
      </div>
      {d.note && <p className="mt-1 break-keep text-xs opacity-75">{d.note}</p>}
      {d.answer && (
        <p className="mt-0.5 break-keep text-xs opacity-60">
          {d.questionText && <span className="opacity-80">Q. {d.questionText} — </span>}
          {d.answer}
        </p>
      )}
    </li>
  );
}

/** 전체 최근 기록 — 접었다 펴는 목록 */
function RecordFeed({ records }: { records: AdminRecord[] }) {
  const [showAll, setShowAll] = useState(false);
  if (records.length === 0) return null;
  const list = showAll ? records : records.slice(0, 8);
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold opacity-70">
        최근 데이트 기록 <span className="font-normal opacity-50">— 내용 포함 {records.length}건</span>
      </h2>
      <ul className="space-y-1.5">
        {list.map((r) => (
          <RecordRow key={r.id} r={r} />
        ))}
      </ul>
      {records.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 w-full rounded-xl rounded-tl-sm border-2 border-ink/15 bg-white/70 py-2 text-xs font-bold"
        >
          {showAll ? '접기' : `${records.length}건 모두 보기`}
        </button>
      )}
    </section>
  );
}

/** 전체 최근 오늘 — 접었다 펴는 목록 */
function TodayFeed({ entries }: { entries: AdminDailyEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  if (entries.length === 0) return null;
  const list = showAll ? entries : entries.slice(0, 8);
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold opacity-70">
        최근 오늘 기록 <span className="font-normal opacity-50">— 일기·답변 포함 {entries.length}건</span>
      </h2>
      <ul className="space-y-1.5">
        {list.map((d, i) => (
          <TodayRow key={`${d.userId}-${d.entryDate}-${i}`} d={d} />
        ))}
      </ul>
      {entries.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 w-full rounded-xl rounded-tl-sm border-2 border-ink/15 bg-white/70 py-2 text-xs font-bold"
        >
          {showAll ? '접기' : `${entries.length}건 모두 보기`}
        </button>
      )}
    </section>
  );
}

/**
 * 성장·이용 요약 — "얼마나 늘었고 얼마나 쓰는지"를 맨 위에서 한 번에.
 * 지난주 대비 증감을 같이 보여줘야 숫자 하나가 좋은 건지 나쁜 건지 판단이 된다.
 */
function GrowthPanel({ g }: { g: AdminGrowth }) {
  const diff = g.signups.week - g.signups.prevWeek;
  const trend =
    g.signups.prevWeek === 0
      ? g.signups.week > 0
        ? '첫 주'
        : '아직 없음'
      : `지난주 ${g.signups.prevWeek}명 대비 ${diff >= 0 ? '+' : ''}${diff}명`;

  const cards: { label: string; value: string; sub: string; strong?: boolean }[] = [
    {
      label: '이번 주 신규 가입',
      value: `${g.signups.week}명`,
      sub: trend,
      strong: true,
    },
    {
      label: '오늘 가입',
      value: `${g.signups.today}명`,
      sub: `전체 ${g.signups.total}명`,
    },
    {
      label: '이번 주 활동한 사람',
      value: `${g.active.week}명`,
      sub: g.signups.total
        ? `가입자의 ${Math.round((g.active.week / g.signups.total) * 100)}%`
        : '—',
      strong: true,
    },
    {
      label: '오늘 활동한 사람',
      value: `${g.active.today}명`,
      sub: '기록·오늘을 남긴 사람',
    },
    {
      label: '1인당 데이트 기록',
      value: g.perUser.records.toFixed(1),
      sub: '가입자 전체 평균',
    },
    {
      label: '1인당 오늘 참여',
      value: g.perUser.daily.toFixed(1),
      sub: `실제로 써 본 사람 ${Math.round(g.engagedRate * 100)}%`,
    },
  ];

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold opacity-70">성장 · 이용</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-2xl rounded-tl-md border-2 p-3 ${
              c.strong ? 'border-pink/40 bg-pink/5' : 'border-ink/10 bg-white/70'
            }`}
          >
            <p className="text-xs opacity-50">{c.label}</p>
            <p className="mt-0.5 text-2xl font-bold text-pink">{c.value}</p>
            <p className="mt-0.5 break-keep text-[11px] opacity-45">{c.sub}</p>
          </div>
        ))}
      </div>
      <BarChart
        title="최근 14일 신규 가입"
        data={g.signupDaily}
        unit="명"
        className="mt-2"
        color="bg-green/70"
      />
    </section>
  );
}

/** 최근 14일 일별 활동 (기록 생성 + 오늘 참여) */
function DailyChart({ daily }: { daily: { date: string; events: number }[] }) {
  return <BarChart title="최근 14일 활동 (기록·오늘)" data={daily} unit="건" />;
}

/** 날짜별 막대 — CSS만으로 (차트 라이브러리 추가 없이) */
function BarChart({
  title,
  data,
  unit,
  color = 'bg-pink/70',
  className = '',
}: {
  title: string;
  data: { date: string; events: number }[];
  unit: string;
  color?: string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.events));
  const total = data.reduce((s, d) => s + d.events, 0);
  return (
    <section className={className}>
      <p className="mb-1.5 text-xs font-bold opacity-60">
        {title} <span className="font-normal opacity-60">— 합계 {total}{unit}</span>
      </p>
      <div className="flex h-24 items-end gap-1 rounded-2xl rounded-tl-md border-2 border-ink/10 bg-white/70 p-3">
        {data.map((d) => (
          <div
            key={d.date}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${d.date} · ${d.events}${unit}`}
          >
            <span className="text-[10px] tabular-nums opacity-50">{d.events > 0 ? d.events : ''}</span>
            <div
              className={`w-full rounded-t ${color}`}
              style={{ height: `${Math.max(d.events > 0 ? 8 : 2, (d.events / max) * 56)}px` }}
            />
            <span className="text-[9px] opacity-40">{d.date.slice(8)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function UserList({
  users,
  activity,
  records,
  dailyEntries,
}: {
  users: AdminUser[];
  activity: AdminActivity[];
  records: AdminRecord[];
  dailyEntries: AdminDailyEntry[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const sorted = users.slice().sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''));
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold opacity-70">사용자 {users.length}명 — 최근 활동순</h2>
      <ul className="space-y-2">
        {sorted.map((u) => {
          const open = openId === u.userId;
          const logs = activity.filter((a) => a.actorId === u.userId).slice(0, 30);
          const myRecords = records.filter((r) => r.createdBy === u.userId).slice(0, 10);
          const myToday = dailyEntries.filter((d) => d.userId === u.userId).slice(0, 10);
          return (
            <li key={u.userId} className="rounded-2xl rounded-tl-md border-2 border-ink/10 bg-white/70">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : u.userId)}
                className="w-full px-4 py-3 text-left"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-base font-bold">
                    {u.nickname}
                    {u.email && <span className="ml-1.5 text-xs font-normal opacity-45">{u.email}</span>}
                  </p>
                  <p className="shrink-0 text-xs opacity-50">
                    {u.lastSeen ? relativeTime(u.lastSeen) : '활동 없음'}
                  </p>
                </div>
                <p className="mt-1 text-xs opacity-60">
                  {u.coupleStatus === 'active'
                    ? `💛 ${u.partnerNickname ?? '짝꿍'}와 연결`
                    : u.coupleStatus === 'pending'
                      ? '⏳ 짝꿍 대기 중'
                      : '연결 전'}
                  {' · '}기록 {u.recordCount} · 오늘 {u.dailyCount}
                  {' · '}가입 {kst(u.createdAt)}
                </p>
              </button>
              {open && (
                <div className="space-y-3 border-t border-ink/10 px-4 py-3">
                  {myRecords.length > 0 && (
                    <div>
                      <p className="mb-1 text-[11px] font-bold opacity-50">이 사람이 남긴 기록</p>
                      <ul className="space-y-1.5">
                        {myRecords.map((r) => (
                          <RecordRow key={r.id} r={r} />
                        ))}
                      </ul>
                    </div>
                  )}
                  {myToday.length > 0 && (
                    <div>
                      <p className="mb-1 text-[11px] font-bold opacity-50">이 사람의 오늘</p>
                      <ul className="space-y-1.5">
                        {myToday.map((d, i) => (
                          <TodayRow key={`${d.entryDate}-${i}`} d={d} showName={false} />
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="mb-1 text-[11px] font-bold opacity-50">활동 로그</p>
                    {logs.length === 0 ? (
                      <p className="py-1 text-xs opacity-45">보관함에 남은 활동이 아직 없어요</p>
                    ) : (
                      <ul className="space-y-1">
                        {logs.map((a) => (
                          <li key={a.id} className="flex items-baseline gap-2 text-xs">
                            <span aria-hidden>{ACTIVITY_ICONS[a.kind as ActivityKind] ?? '🖍️'}</span>
                            <span className="min-w-0 flex-1 break-keep opacity-75">{a.title}</span>
                            <span className="shrink-0 opacity-40">{kst(a.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p className="text-[10px] opacity-35">id {u.userId}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ActivityFeed({ activity, total }: { activity: AdminActivity[]; total: number }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? activity : activity.slice(0, 20);
  if (activity.length === 0) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-bold opacity-70">전체 로그</h2>
        <p className="rounded-2xl rounded-tl-md border-2 border-ink/10 bg-white/70 p-4 text-center text-xs opacity-50">
          아직 로그가 없어요 — 0017 마이그레이션 적용 후부터 쌓여요
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold opacity-70">
        전체 로그 <span className="font-normal opacity-50">— 누적 {total}건, 최근 {activity.length}건</span>
      </h2>
      <ul className="space-y-1 rounded-2xl rounded-tl-md border-2 border-ink/10 bg-white/70 p-3">
        {list.map((a) => (
          <li key={a.id} className="flex items-baseline gap-2 text-xs">
            <span aria-hidden>{ACTIVITY_ICONS[a.kind as ActivityKind] ?? '🖍️'}</span>
            <span className="shrink-0 font-bold">{a.actorNickname}</span>
            <span className="min-w-0 flex-1 break-keep opacity-70">{a.title}</span>
            <span className="shrink-0 opacity-40">{kst(a.createdAt)}</span>
          </li>
        ))}
      </ul>
      {activity.length > 20 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 w-full rounded-xl rounded-tl-sm border-2 border-ink/15 bg-white/70 py-2 text-xs font-bold"
        >
          {showAll ? '접기' : `${activity.length}건 모두 보기`}
        </button>
      )}
    </section>
  );
}
