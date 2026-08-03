// 관리자 현황 조회 (Vercel Fn) — /admin 페이지 전용
//
// 원칙:
// - RLS는 열지 않는다 (절대 규칙 5). 전체 조회는 여기서만, service role로 한다.
// - 관리자 판별은 ADMIN_USER_IDS 환경변수(쉼표 구분 auth user id 목록) — 코드에 계정을 박지 않는다.
//   목록에 없으면 403과 함께 "당신의 id"를 돌려줘서, 처음 설정할 때 그 값을 복사해 넣으면 된다.
// - 기록·오늘의 **글 내용까지** 돌려준다 (운영자 결정 2026-08-03 — 분석 목적).
//   운영자는 어차피 Supabase 대시보드로 전부 볼 수 있으므로 새 권한이 생기는 건 아니지만,
//   개인정보 처리방침에 운영자 열람 범위를 밝혀 두는 것을 전제로 한다. 사진 원본은 내리지 않는다.
//
// 필요한 Vercel 환경변수: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_USER_IDS
import { createClient } from '@supabase/supabase-js';

interface VercelRequest {
  method?: string;
  body?: { accessToken?: string; probe?: boolean };
}
interface VercelResponse {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 미설정`);
  return v;
}

/** 여러 번 나눠 읽어야 하는 목록 조회 — 기본 1000행 제한을 넘겨도 다 가져온다 */
async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await query(from, from + page - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 받아요' });
    return;
  }
  try {
    const { accessToken } = req.body ?? {};
    if (!accessToken) {
      res.status(400).json({ error: 'accessToken이 필요해요' });
      return;
    }

    const admin = createClient(
      requiredEnv('VITE_SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } },
    );

    const { data: caller, error: callerError } = await admin.auth.getUser(accessToken);
    if (callerError || !caller.user) {
      res.status(401).json({ error: '로그인이 만료됐어요' });
      return;
    }
    const callerId = caller.user.id;

    const adminIds = (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!adminIds.includes(callerId)) {
      // 첫 설정용: 자기 id를 보여줘서 환경변수에 그대로 넣을 수 있게 한다
      res.status(403).json({ reason: 'not-admin', yourUserId: callerId });
      return;
    }

    // 우리 탭의 관리자 버튼 노출 판정용 — 무거운 조회 없이 "관리자 맞음"만 답한다
    if (req.body?.probe) {
      res.status(200).json({ admin: true });
      return;
    }

    // ── 원천 데이터 (글 내용 포함 — 사진 원본은 내리지 않는다) ──
    const [profiles, couples, records, dailyEntries, spots, questions] = await Promise.all([
      fetchAll<{ user_id: string; nickname: string; couple_id: string | null; created_at: string }>(
        (a, b) => admin.from('profiles').select('user_id, nickname, couple_id, created_at').range(a, b),
      ),
      fetchAll<{ id: string; status: string; started_at: string | null; created_at: string }>(
        (a, b) => admin.from('couples').select('id, status, started_at, created_at').range(a, b),
      ),
      fetchAll<{
        id: string;
        couple_id: string;
        date: string;
        status: string;
        memo: string | null;
        created_by: string | null;
        created_at: string;
      }>((a, b) =>
        admin
          .from('records')
          .select('id, couple_id, date, status, memo, created_by, created_at')
          .range(a, b),
      ),
      fetchAll<{
        user_id: string;
        entry_date: string;
        mood: string | null;
        note: string | null;
        answer: string | null;
        question_id: number | null;
        created_at: string;
      }>((a, b) =>
        admin
          .from('daily_entries')
          .select('user_id, entry_date, mood, note, answer, question_id, created_at')
          .range(a, b),
      ),
      fetchAll<{ record_id: string; seq: number; name: string; note: string | null }>((a, b) =>
        admin.from('spots').select('record_id, seq, name, note').order('seq').range(a, b),
      ),
      fetchAll<{ id: number; text: string }>((a, b) =>
        admin.from('questions').select('id, text').range(a, b),
      ),
    ]);

    const countOf = async (table: string): Promise<number> => {
      const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    };
    const [recordPhotoCount, dailyPhotoCount, pushSubCount, expenses] = await Promise.all([
      countOf('record_photos'),
      countOf('daily_photos'),
      countOf('push_subscriptions'),
      fetchAll<{ record_id: string; amount: number }>((a, b) =>
        admin.from('expenses').select('record_id, amount').range(a, b),
      ),
    ]);

    // 보관함 로그 (0017) — 아직 안 만든 환경이면 조용히 비운다
    let activity: {
      id: string;
      couple_id: string;
      actor_id: string;
      kind: string;
      title: string;
      created_at: string;
    }[] = [];
    let activityTotal = 0;
    try {
      const { data, error, count } = await admin
        .from('activity_log')
        .select('id, couple_id, actor_id, kind, title, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(300);
      if (!error) {
        activity = (data ?? []) as typeof activity;
        activityTotal = count ?? activity.length;
      }
    } catch {
      // activity_log 미적용 — 나머지 현황은 그대로 보여준다
    }

    // 이메일 — 계정이 누구인지 식별용 (카카오 계정은 카카오가 준 이메일)
    const emailById = new Map<string, string>();
    try {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of list?.users ?? []) {
        if (u.email) emailById.set(u.id, u.email);
      }
    } catch {
      // 이메일 없이도 닉네임·활동으로 식별 가능
    }

    // ── 사용자별 요약 ──
    const coupleById = new Map(couples.map((c) => [c.id, c]));
    const nicknameById = new Map(profiles.map((p) => [p.user_id, p.nickname]));
    const users = profiles.map((p) => {
      const myRecords = records.filter((r) => r.created_by === p.user_id);
      const myDaily = dailyEntries.filter((d) => d.user_id === p.user_id);
      const myActivity = activity.filter((a) => a.actor_id === p.user_id);
      const partner = p.couple_id
        ? profiles.find((q) => q.couple_id === p.couple_id && q.user_id !== p.user_id)
        : undefined;
      const lastSeen = [
        ...myRecords.map((r) => r.created_at),
        ...myDaily.map((d) => d.created_at),
        ...myActivity.map((a) => a.created_at),
      ]
        .sort()
        .pop();
      return {
        userId: p.user_id,
        nickname: p.nickname,
        email: emailById.get(p.user_id) ?? null,
        createdAt: p.created_at,
        coupleId: p.couple_id,
        coupleStatus: p.couple_id ? (coupleById.get(p.couple_id)?.status ?? null) : null,
        partnerNickname: partner?.nickname ?? null,
        recordCount: myRecords.length,
        dailyCount: myDaily.length,
        lastSeen: lastSeen ?? null,
      };
    });

    // ── 최근 14일 일별 활동 (기록 생성 + 오늘 참여 + 보관함 이벤트) ──
    const dayKey = (iso: string) =>
      new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10); // KST
    const byDay = new Map<string, number>();
    const bump = (iso: string) => byDay.set(dayKey(iso), (byDay.get(dayKey(iso)) ?? 0) + 1);
    for (const r of records) bump(r.created_at);
    for (const d of dailyEntries) bump(d.created_at);
    const today = new Date(Date.now() + 9 * 3600_000);
    const daily: { date: string; events: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400_000).toISOString().slice(0, 10);
      daily.push({ date: d, events: byDay.get(d) ?? 0 });
    }

    // ── 내용 목록 — 기록(스팟·한마디·메모·지출 합계)과 오늘(기분·일기·답변) ──
    const spotsByRecord = new Map<string, { name: string; note: string | null }[]>();
    for (const s of spots) {
      const list = spotsByRecord.get(s.record_id) ?? [];
      list.push({ name: s.name, note: s.note });
      spotsByRecord.set(s.record_id, list);
    }
    const expenseByRecord = new Map<string, number>();
    for (const e of expenses) {
      expenseByRecord.set(e.record_id, (expenseByRecord.get(e.record_id) ?? 0) + e.amount);
    }
    const questionById = new Map(questions.map((q) => [q.id, q.text]));

    const recordItems = records
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 300)
      .map((r) => ({
        id: r.id,
        coupleId: r.couple_id,
        createdBy: r.created_by,
        createdByNickname: r.created_by ? (nicknameById.get(r.created_by) ?? null) : null,
        date: r.date,
        status: r.status,
        memo: r.memo,
        spots: spotsByRecord.get(r.id) ?? [],
        expenseTotal: expenseByRecord.get(r.id) ?? 0,
        createdAt: r.created_at,
      }));

    const dailyItems = dailyEntries
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 300)
      .map((d) => ({
        userId: d.user_id,
        nickname: nicknameById.get(d.user_id) ?? '(알 수 없음)',
        entryDate: d.entry_date,
        mood: d.mood,
        note: d.note,
        answer: d.answer,
        questionText: d.question_id !== null ? (questionById.get(d.question_id) ?? null) : null,
        createdAt: d.created_at,
      }));

    res.status(200).json({
      generatedAt: new Date().toISOString(),
      totals: {
        users: profiles.length,
        couples: couples.length,
        couplesActive: couples.filter((c) => c.status === 'active').length,
        couplesPending: couples.filter((c) => c.status === 'pending').length,
        records: records.length,
        recordsVisited: records.filter((r) => r.status === 'visited').length,
        recordsPlanned: records.filter((r) => r.status === 'planned').length,
        spots: spots.length,
        recordPhotos: recordPhotoCount,
        dailyEntries: dailyEntries.length,
        dailyPhotos: dailyPhotoCount,
        pushSubs: pushSubCount,
        activityEvents: activityTotal,
      },
      users,
      // 사용자별 로그 — actor 닉네임을 붙여 내려준다 (최근 300건)
      activity: activity.map((a) => ({
        id: a.id,
        actorId: a.actor_id,
        actorNickname: nicknameById.get(a.actor_id) ?? '(알 수 없음)',
        kind: a.kind,
        title: a.title,
        createdAt: a.created_at,
      })),
      daily,
      records: recordItems,
      dailyEntries: dailyItems,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '현황을 불러오지 못했어요' });
  }
}
