import { useState, type ReactNode } from 'react';
import { signOut, suggestedNickname } from '../../shared/lib/auth';
import {
  useCreateCouple,
  useCreateProfile,
  useJoinCouple,
  useSetStartedAt,
  type CoupleState,
} from './useCoupleState';

interface Props {
  userId: string;
  state: CoupleState;
  refetching: boolean;
  onRefetch: () => void;
  /** 사귄 날 입력을 건너뛸 때 (couples.started_at은 비워두고 진입) */
  onSkipStartedAt: (coupleId: string) => void;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('invalid or used invite code'))
    return '코드를 다시 확인해 주세요. 이미 연결된 코드일 수도 있어요.';
  if (message.includes('already in a couple'))
    return '이미 짝꿍과 연결돼 있어요. 화면을 새로고침해 주세요.';
  if (message.includes('duplicate key'))
    return '이미 만들어졌어요. 화면을 새로고침해 주세요.';
  return '잠깐 문제가 있었어요. 다시 한 번 시도해 주세요.';
}

/** 온보딩: 닉네임 → 초대 코드 만들기/입력 → (연결되면) 사귄 날. 투어 없이 각 자리에서 설명한다. */
export default function OnboardingFlow({
  userId,
  state,
  refetching,
  onRefetch,
  onSkipStartedAt,
}: Props) {
  const { profile, couple } = state;

  let step: ReactNode;
  if (!profile) {
    step = <NicknameStep userId={userId} />;
  } else if (!couple) {
    step = <ConnectStep userId={userId} nickname={profile.nickname} />;
  } else if (couple.status === 'pending') {
    step = (
      <WaitingStep
        inviteCode={couple.invite_code}
        refetching={refetching}
        onRefetch={onRefetch}
      />
    );
  } else {
    step = (
      <StartedAtStep
        userId={userId}
        coupleId={couple.id}
        onSkip={() => onSkipStartedAt(couple.id)}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div className="flex flex-1 flex-col justify-center">{step}</div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mx-auto pb-2 text-xs opacity-40 underline underline-offset-2"
      >
        다른 계정으로 시작할래요
      </button>
    </main>
  );
}

// ── ① 닉네임 ─────────────────────────────────────────────────────
function NicknameStep({ userId }: { userId: string }) {
  // 카카오 프로필 닉네임이 있으면 미리 채워준다 (수정 가능)
  const [nickname, setNickname] = useState(suggestedNickname);
  const createProfile = useCreateProfile(userId);
  const valid = nickname.trim().length >= 1 && nickname.trim().length <= 12;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !createProfile.isPending) createProfile.mutate(nickname);
      }}
      className="space-y-4"
    >
      <h1 className="text-2xl font-bold">뭐라고 불러드릴까요?</h1>
      <p className="text-sm opacity-60">짝꿍에게 보이는 이름이에요.</p>
      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={12}
        placeholder="닉네임 (12자까지)"
        autoFocus
        className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-3 text-base outline-none focus:border-pink"
      />
      {createProfile.isError && (
        <p className="text-sm text-pink">{friendlyError(createProfile.error)}</p>
      )}
      <button
        type="submit"
        disabled={!valid || createProfile.isPending}
        className="w-full rounded-2xl rounded-tl-md bg-pink px-6 py-3.5 text-base font-bold text-white shadow-sm active:translate-y-px disabled:opacity-40"
      >
        {createProfile.isPending ? '적는 중…' : '다음'}
      </button>
    </form>
  );
}

// ── ② 초대 코드 만들기 / 입력 분기 ────────────────────────────────
function ConnectStep({ userId, nickname }: { userId: string; nickname: string }) {
  const [mode, setMode] = useState<'choose' | 'join'>('choose');
  const createCouple = useCreateCouple(userId);
  const joinCouple = useJoinCouple(userId);
  const [code, setCode] = useState('');

  if (mode === 'join') {
    const codeValid = /^[A-Z0-9]{6}$/.test(code);
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (codeValid && !joinCouple.isPending) joinCouple.mutate(code);
        }}
        className="space-y-4"
      >
        <h1 className="text-2xl font-bold">초대 코드 입력</h1>
        <p className="text-sm opacity-60">짝꿍이 받은 6자리 코드를 그대로 적어 주세요.</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
          maxLength={6}
          placeholder="ABC123"
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] outline-none focus:border-pink"
        />
        {joinCouple.isError && (
          <p className="text-sm text-pink">{friendlyError(joinCouple.error)}</p>
        )}
        <button
          type="submit"
          disabled={!codeValid || joinCouple.isPending}
          className="w-full rounded-2xl rounded-tl-md bg-pink px-6 py-3.5 text-base font-bold text-white shadow-sm active:translate-y-px disabled:opacity-40"
        >
          {joinCouple.isPending ? '연결하는 중…' : '짝꿍이랑 연결하기'}
        </button>
        <button
          type="button"
          onClick={() => setMode('choose')}
          className="w-full py-2 text-sm opacity-50"
        >
          ← 돌아가기
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {nickname} 님, <br />
        짝꿍이랑 연결해 볼까요?
      </h1>
      <button
        type="button"
        onClick={() => {
          if (!createCouple.isPending) createCouple.mutate();
        }}
        disabled={createCouple.isPending}
        className="w-full rounded-2xl rounded-tl-md border-2 border-pink/40 bg-white/70 p-5 text-left shadow-sm active:translate-y-px disabled:opacity-60"
      >
        <p className="text-base font-bold text-pink">
          {createCouple.isPending ? '코드 만드는 중…' : '초대 코드 만들기'}
        </p>
        <p className="mt-1 text-sm opacity-60">
          6자리 코드를 만들어 짝꿍에게 보내요.
        </p>
      </button>
      <button
        type="button"
        onClick={() => setMode('join')}
        className="w-full rounded-2xl rounded-br-md border-2 border-ink/15 bg-white/70 p-5 text-left shadow-sm active:translate-y-px"
      >
        <p className="text-base font-bold">초대 코드 입력하기</p>
        <p className="mt-1 text-sm opacity-60">
          짝꿍에게 받은 코드가 있다면 여기로!
        </p>
      </button>
      {createCouple.isError && (
        <p className="text-sm text-pink">{friendlyError(createCouple.error)}</p>
      )}
    </div>
  );
}

// ── ②-대기: 코드 만들고 짝꿍 기다리는 중 (재진입 시에도 복원) ────
function WaitingStep({
  inviteCode,
  refetching,
  onRefetch,
}: {
  inviteCode: string;
  refetching: boolean;
  onRefetch: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 미지원 WebView — 코드가 크게 보이므로 손으로 옮겨 적을 수 있다
    }
  };

  return (
    <div className="space-y-4 text-center">
      <h1 className="text-2xl font-bold">우리의 초대 코드</h1>
      <div className="rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 py-8 shadow-sm">
        <p className="select-all text-4xl font-bold tracking-[0.35em] text-pink">
          {inviteCode}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        className="w-full rounded-2xl rounded-tl-md bg-sky px-6 py-3 text-base font-bold text-ink shadow-sm active:translate-y-px"
      >
        {copied ? '복사했어요!' : '코드 복사하기'}
      </button>
      <p className="text-sm opacity-60">
        짝꿍이 이 코드를 입력하면 바로 연결돼요.
      </p>
      <button
        type="button"
        onClick={onRefetch}
        disabled={refetching}
        className="text-sm text-pink underline underline-offset-2 disabled:opacity-50"
      >
        {refetching ? '확인하는 중…' : '연결됐는지 확인하기'}
      </button>
    </div>
  );
}

// ── ③ 사귄 날 (선택) ─────────────────────────────────────────────
function StartedAtStep({
  userId,
  coupleId,
  onSkip,
}: {
  userId: string;
  coupleId: string;
  onSkip: () => void;
}) {
  const [date, setDate] = useState('');
  const setStartedAt = useSetStartedAt(userId);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (date && !setStartedAt.isPending)
          setStartedAt.mutate({ coupleId, startedAt: date });
      }}
      className="space-y-4"
    >
      <p aria-hidden className="text-center text-4xl">🎉</p>
      <h1 className="text-center text-2xl font-bold">짝꿍이랑 연결됐어요!</h1>
      <p className="text-center text-sm opacity-60">
        우리가 사귄 날을 알려주시면 디데이를 세어 드려요.
      </p>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        max={new Date().toISOString().slice(0, 10)}
        className="w-full rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-4 py-3 text-base outline-none focus:border-pink"
      />
      {setStartedAt.isError && (
        <p className="text-sm text-pink">{friendlyError(setStartedAt.error)}</p>
      )}
      <button
        type="submit"
        disabled={!date || setStartedAt.isPending}
        className="w-full rounded-2xl rounded-tl-md bg-pink px-6 py-3.5 text-base font-bold text-white shadow-sm active:translate-y-px disabled:opacity-40"
      >
        {setStartedAt.isPending ? '적는 중…' : '이 날부터 시작!'}
      </button>
      <button type="button" onClick={onSkip} className="w-full py-2 text-sm opacity-50">
        나중에 할게요 — 우리 탭에서 언제든 적을 수 있어요
      </button>
    </form>
  );
}
