/**
 * M2 DoD 검증 스크립트 — 상호 잠금이 "DB에서" 강제되는지 API 직접 호출로 확인.
 *
 * 시나리오 (CLAUDE.md M2 DoD):
 *   A만 오늘 사진을 올린 상태에서, B가 API를 직접 호출해도 A의 사진이 보이지 않아야 하고,
 *   B가 한 장 올리는 순간 A의 사진이 열려야 한다. 질문 답(answer)도 동일 패턴.
 *
 * 실행 (Supabase 프로젝트 + 마이그레이션 적용 + 테스트 계정 2개 필요):
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   TEST_A_EMAIL=... TEST_A_PASSWORD=... TEST_B_EMAIL=... TEST_B_PASSWORD=... \
 *   node scripts/test-rls.mjs
 *
 * 사전 조건: 두 계정이 같은 커플로 연결(active), 오늘 엔트리 없음(스크립트가 생성).
 * 주의: 실데이터에 오늘 날짜 엔트리를 만들므로 테스트 전용 커플로 실행할 것.
 */
import { createClient } from '@supabase/supabase-js';

const env = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`환경변수 ${k}가 필요해요`);
    process.exit(1);
  }
  return v;
};

const URL = env('SUPABASE_URL');
const ANON = env('SUPABASE_ANON_KEY');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function login(email, password) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`로그인 실패(${email}): ${error.message}`);
  return { client, userId: data.user.id };
}

const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  .toISOString()
  .slice(0, 10);

const A = await login(env('TEST_A_EMAIL'), env('TEST_A_PASSWORD'));
const B = await login(env('TEST_B_EMAIL'), env('TEST_B_PASSWORD'));

const { data: profileA } = await A.client.from('profiles').select('couple_id').eq('user_id', A.userId).single();
const coupleId = profileA?.couple_id;
if (!coupleId) {
  console.error('A 계정에 커플이 없어요 — 두 계정을 먼저 연결하세요');
  process.exit(1);
}

// ① A만 사진 업로드
const { data: entryA, error: entryAError } = await A.client
  .from('daily_entries')
  .upsert(
    { couple_id: coupleId, user_id: A.userId, entry_date: today },
    { onConflict: 'user_id,entry_date' },
  )
  .select('id')
  .single();
check('A 오늘 엔트리 생성', !entryAError, entryAError?.message);

const pathA = `couples/${coupleId}/daily/${today}/${A.userId}/${crypto.randomUUID()}.webp`;
const { error: uploadAError } = await A.client.storage
  .from('photos')
  .upload(pathA, new Blob([new Uint8Array([82, 73, 70, 70])]), { contentType: 'image/webp' });
check('A 스토리지 업로드', !uploadAError, uploadAError?.message);
const { error: photoAError } = await A.client
  .from('daily_photos')
  .insert({ entry_id: entryA.id, storage_path: pathA });
check('A daily_photos insert', !photoAError, photoAError?.message);

// ② 잠금 상태: B가 직접 조회해도 A 사진이 안 보여야 한다
const { data: bSeesLocked } = await B.client.from('daily_photos').select('id, entry_id');
const bSeesAPhoto = (bSeesLocked ?? []).some((p) => p.entry_id === entryA.id);
check('잠금: B에게 A 사진 행이 안 보임 (DB 강제)', !bSeesAPhoto, `보인 행 ${bSeesLocked?.length ?? 0}개`);

const { data: bDownloadLocked } = await B.client.storage.from('photos').createSignedUrl(pathA, 60);
check('잠금: B가 A 사진 signed URL 발급 불가 (Storage 강제)', !bDownloadLocked?.signedUrl);

// ③ 질문 답 잠금: A가 답 저장 → B에게는 has_answer만 보이고 answer는 null
await A.client.from('daily_entries').update({ answer: 'RLS 테스트 답' }).eq('id', entryA.id);
const { data: bViewRows } = await B.client
  .from('daily_entries_unlocked')
  .select('user_id, answer, has_answer')
  .eq('entry_date', today);
const aRowForB = (bViewRows ?? []).find((r) => r.user_id === A.userId);
check('잠금: B에게 A의 answer가 null', aRowForB ? aRowForB.answer === null : false);
check('잠금: has_answer로 "먼저 답함"은 보임', aRowForB?.has_answer === true);

// ④ answer 컬럼 직접 조회는 컬럼 권한에서 차단되어야 한다
const { error: directAnswerError } = await B.client.from('daily_entries').select('answer').limit(1);
check('잠금: daily_entries.answer 직접 select 거부', Boolean(directAnswerError), directAnswerError?.message);

// ⑤ B가 업로드하는 순간 열린다
const { data: entryB } = await B.client
  .from('daily_entries')
  .upsert(
    { couple_id: coupleId, user_id: B.userId, entry_date: today },
    { onConflict: 'user_id,entry_date' },
  )
  .select('id')
  .single();
const pathB = `couples/${coupleId}/daily/${today}/${B.userId}/${crypto.randomUUID()}.webp`;
await B.client.storage.from('photos').upload(pathB, new Blob([new Uint8Array([82, 73, 70, 70])]), { contentType: 'image/webp' });
await B.client.from('daily_photos').insert({ entry_id: entryB.id, storage_path: pathB });

const { data: bSeesUnlocked } = await B.client.from('daily_photos').select('id, entry_id');
check(
  '해제: B가 올린 순간 A 사진이 보임',
  (bSeesUnlocked ?? []).some((p) => p.entry_id === entryA.id),
);
const { data: bDownloadUnlocked } = await B.client.storage.from('photos').createSignedUrl(pathA, 60);
check('해제: B가 A 사진 signed URL 발급 가능', Boolean(bDownloadUnlocked?.signedUrl));

// ⑥ 커플 격리 스모크: 존재하지 않는 커플 경로 접근 불가
const { data: foreign } = await B.client.storage
  .from('photos')
  .createSignedUrl(`couples/${crypto.randomUUID()}/daily/${today}/x/x.webp`, 60);
check('격리: 타 커플 경로 signed URL 불가', !foreign?.signedUrl);

console.log(failures === 0 ? '\n모든 상호 잠금 검증 통과 🎉' : `\n실패 ${failures}건 — RLS 정책 점검 필요`);
process.exit(failures === 0 ? 0 : 1);
