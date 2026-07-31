import { useState } from 'react';
import { copyCurrentLink, installStep, type InstallStep } from '../../shared/lib/install';

/**
 * 홈 화면 설치 안내 (/install).
 *
 * 스토어 없이 배포하는 우리 경로의 관문. 링크를 카톡으로 받아 여는 사람이 대부분인데
 * 인앱 브라우저에서는 홈 화면 추가가 안 되므로, 환경을 판별해 맞는 순서만 보여준다.
 */
const SITE = 'https://couple-map-azure.vercel.app';

export default function InstallGuide() {
  const [step] = useState<InstallStep>(installStep);
  const [copied, setCopied] = useState(false);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-6 py-10">
      <header className="text-center">
        <p aria-hidden className="text-5xl">🎨</p>
        <h1 className="mt-3 text-2xl font-bold">
          {step === 'installed' ? '이미 설치돼 있어요!' : '홈 화면에 추가하기'}
        </h1>
        <p className="mt-2 break-keep text-sm leading-relaxed opacity-60">
          {step === 'installed'
            ? '지금 홈 화면 앱으로 보고 계세요. 바로 쓰시면 돼요.'
            : '앱스토어에 없어도 괜찮아요. 홈 화면에 추가하면 앱처럼 쓸 수 있어요.'}
        </p>
      </header>

      {step !== 'installed' && (
        <div className="mt-8 space-y-3">
          <Steps step={step} copied={copied} onCopy={() => void copyLink(setCopied)} />
        </div>
      )}

      <a
        href="/"
        className="mt-8 block rounded-2xl rounded-tl-md bg-pink px-6 py-3.5 text-center text-base font-bold text-white active:translate-y-px"
      >
        {step === 'installed' ? '도화지 열기' : '먼저 둘러보기'}
      </a>
    </main>
  );
}

async function copyLink(setCopied: (v: boolean) => void) {
  const ok = await copyCurrentLink(SITE);
  setCopied(ok);
}

function Card({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl rounded-tl-md border-2 border-ink/15 bg-white/70 px-5 py-4">
      <p className="flex items-center gap-2 font-bold">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs text-paper">
          {n}
        </span>
        {title}
      </p>
      <div className="mt-1.5 break-keep text-sm leading-relaxed opacity-65">{children}</div>
    </div>
  );
}

function Steps({
  step,
  copied,
  onCopy,
}: {
  step: InstallStep;
  copied: boolean;
  onCopy: () => void;
}) {
  const copyButton = (
    <button
      type="button"
      onClick={onCopy}
      className="mt-3 block w-full rounded-2xl rounded-tl-md border-2 border-ink/20 py-2 text-xs font-bold opacity-100 active:bg-ink/10"
    >
      {copied ? '주소 복사됨 ✓ — Safari에 붙여넣어 주세요' : '주소 복사하기'}
    </button>
  );

  if (step === 'ios-inapp') {
    return (
      <>
        <Card n={1} title="Safari로 열기">
          지금은 카톡 같은 앱 안의 브라우저예요. 여기서는 홈 화면에 추가할 수 없어요.
          <br />
          아래 <b>주소 복사하기</b>를 누르고, <b>Safari</b>를 열어 붙여넣어 주세요.
          {copyButton}
        </Card>
        <Card n={2} title="공유 버튼 누르기">
          Safari 아래쪽 가운데의 <b>↑ 공유</b> 버튼을 눌러요.
        </Card>
        <Card n={3} title="홈 화면에 추가">
          목록을 내려서 <b>홈 화면에 추가</b> → 오른쪽 위 <b>추가</b>를 누르면 끝!
        </Card>
      </>
    );
  }

  if (step === 'ios-safari') {
    return (
      <>
        <Card n={1} title="공유 버튼 누르기">
          화면 아래쪽 가운데의 <b>↑ 공유</b> 버튼을 눌러요.
        </Card>
        <Card n={2} title="홈 화면에 추가">
          목록을 내려서 <b>홈 화면에 추가</b>를 골라요.
        </Card>
        <Card n={3} title="추가 누르기">
          오른쪽 위 <b>추가</b>를 누르면 홈 화면에 도화지 아이콘이 생겨요.
        </Card>
      </>
    );
  }

  if (step === 'android-inapp') {
    return (
      <>
        <Card n={1} title="Chrome으로 열기">
          지금은 앱 안의 브라우저예요. 오른쪽 위 <b>⋮</b> → <b>다른 브라우저로 열기</b>를 고르거나,
          아래에서 주소를 복사해 Chrome에 붙여넣어 주세요.
          {copyButton}
        </Card>
        <Card n={2} title="설치 누르기">
          Chrome 오른쪽 위 <b>⋮</b> → <b>앱 설치</b>(또는 홈 화면에 추가)를 누르면 끝!
        </Card>
      </>
    );
  }

  if (step === 'android') {
    return (
      <>
        <Card n={1} title="메뉴 열기">
          Chrome 오른쪽 위 <b>⋮</b> 버튼을 눌러요.
        </Card>
        <Card n={2} title="앱 설치">
          <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 고르면 끝! 설치 안내가 아래에 바로 뜨기도 해요.
        </Card>
      </>
    );
  }

  return (
    <Card n={1} title="폰으로 열어 주세요">
      홈 화면 추가는 휴대폰에서 할 수 있어요. 폰 브라우저로 <b>{SITE.replace('https://', '')}</b>에
      접속한 뒤 이 페이지를 다시 열어 주세요.
      {copyButton}
    </Card>
  );
}
