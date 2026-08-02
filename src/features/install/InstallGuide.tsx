import { useState } from 'react';
import { copyCurrentLink, platformStep, type InstallStep } from '../../shared/lib/install';

/**
 * 소개 + 홈 화면 설치 안내 (/install).
 *
 * 스토어에 올리지 않는 우리 배포 경로에서 **이 페이지가 사실상 유일한 앱 소개면**이다.
 * 링크를 받은 사람은 여기서 "이게 뭐 하는 앱이지"를 판단하고, 설치까지 갈지가 갈린다.
 * 그래서 설치 순서만 있던 화면 앞에 정체성·화면 셋·공유 카드 소개를 얹었다.
 *
 * 이미 설치한 사람에게도 **똑같은 화면**을 보여준다 (사용자 결정 2026-08-02):
 * 이 주소는 남에게 보내는 소개 링크라, 보낸 사람과 받은 사람이 다른 걸 보면
 * "내가 본 그 화면"을 두고 이야기할 수가 없다.
 *
 * 로그인 전에도 열리므로 Supabase를 부르지 않는다 — 전부 정적이다.
 * 다크패턴 금지(명세 §5): 설치를 재촉하거나 닫기 어려운 요소를 두지 않는다.
 */
const SITE = 'https://couple-map-azure.vercel.app';

export default function InstallGuide() {
  // 설치 여부를 보지 않고 플랫폼만 판별한다 — 누가 열어도 같은 페이지
  const [step] = useState<InstallStep>(platformStep);
  const [copied, setCopied] = useState(false);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-6 pb-16 pt-10">
      <Hero />
      <TabsIntro />
      <ShareIntro />

      <section id="install" className="mt-14 scroll-mt-6">
        <SectionTitle
          eyebrow="설치"
          title="홈 화면에 추가하면 앱이 돼요"
          desc="앱스토어에는 없어요. 아래 순서대로 하면 홈 화면에 도화지 아이콘이 생기고, 앱처럼 열려요."
        />
        <div className="mt-5 space-y-3">
          <Steps step={step} copied={copied} onCopy={() => void copyLink(setCopied)} />
        </div>
      </section>

      <a
        href="/"
        className="mt-10 block rounded-2xl rounded-tl-md bg-pink px-6 py-4 text-center text-base font-bold text-white active:translate-y-px"
      >
        도화지 열어 보기
      </a>
      <p className="mt-3 text-center text-xs opacity-40">설치하지 않아도 둘러볼 수 있어요</p>

      <footer className="mt-12 border-t border-ink/10 pt-5 text-center text-xs opacity-40">
        <a href="/privacy.html" className="underline">개인정보 처리방침</a>
        <p className="mt-2">우리의 도화지 · 둘이서 쓰는 기록장</p>
      </footer>
    </main>
  );
}

function Hero() {
  return (
    <header className="text-center">
      <p aria-hidden className="text-5xl">🎨</p>
      <h1 className="mt-3 text-3xl font-bold">우리의 도화지</h1>
      <p className="mt-3 break-keep text-base leading-relaxed">
        같이 다녀온 곳을 콕 찍으면
        <br />
        <b className="text-pink">그 동네가 칠해지는</b> 커플 기록장
      </p>
      <p className="mx-auto mt-4 max-w-xs break-keep text-sm leading-relaxed opacity-55">
        데이트를 남기면 지도가 칠해지고, 오늘 하루를 남기면 짝꿍의 하루가 열려요.
        둘만 보는 도화지에 함께 그려 나가요.
      </p>
      <a
        href="#install"
        className="mt-6 inline-block rounded-full border-2 border-ink/20 px-5 py-2 text-sm font-bold active:translate-y-px"
      >
        홈 화면에 추가하는 법 ↓
      </a>
    </header>
  );
}

function SectionTitle({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div>
      <p className="text-xs font-bold tracking-wide text-pink opacity-80">{eyebrow}</p>
      <h2 className="mt-1 break-keep text-xl font-bold leading-snug">{title}</h2>
      {desc && <p className="mt-2 break-keep text-sm leading-relaxed opacity-60">{desc}</p>}
    </div>
  );
}

/** 화면이 셋뿐이라는 것 자체가 이 앱의 성격이다 (절대 규칙 1) */
const TABS = [
  {
    emoji: '🗺️',
    name: '지도',
    line: '다녀온 곳이 색으로 남아요',
    desc: '데이트를 기록하면 그 동네가 칠해져요. 대한민국 230곳 중 우리가 얼마나 칠했는지 한눈에 보이고, 같은 곳을 또 가면 색이 더 진해져요.',
    shot: '/intro/map.png',
    alt: '지도 화면 — 다녀온 지역이 칠해진 대한민국 지도와 데이트 핀',
  },
  {
    emoji: '📸',
    name: '오늘',
    line: '내가 먼저 남겨야 열려요',
    desc: '오늘의 기분과 한 줄, 사진을 남기면 그제야 짝꿍이 남긴 게 열려요. 서로 잠금이라 눈치 보지 않고 각자 솔직하게 쓰게 돼요. 남긴 날은 잔디로 쌓여요.',
    shot: '/intro/today.png',
    alt: '오늘 화면 — 기분과 한 줄 일기를 남기는 카드',
  },
  {
    emoji: '💛',
    name: '우리',
    line: '함께한 날이 쌓여요',
    desc: '사귄 날부터 며칠인지, 다가오는 기념일이 언제인지. 데이트에 쓴 돈도 조용히 모아 보여줘요 — 정산하자는 말은 하지 않아요.',
    shot: '/intro/us.png',
    alt: '우리 화면 — 디데이와 다가오는 기념일, 월간 가계부 카드',
  },
];

function TabsIntro() {
  return (
    <section className="mt-14">
      <SectionTitle
        eyebrow="이런 앱이에요"
        title="화면은 딱 셋"
        desc="기능을 늘리는 대신 셋만 남겼어요. 열자마자 뭘 해야 할지 헷갈리지 않게요."
      />
      <div className="mt-6 space-y-9">
        {TABS.map((t) => (
          <div key={t.name}>
            <p className="flex flex-wrap items-baseline gap-x-2 text-lg font-bold">
              <span aria-hidden>{t.emoji}</span>
              {t.name}
              <span className="text-sm font-semibold opacity-50">— {t.line}</span>
            </p>
            <p className="mt-1.5 break-keep text-sm leading-relaxed opacity-65">{t.desc}</p>
            <img
              src={t.shot}
              alt={t.alt}
              loading="lazy"
              width={636}
              height={1048}
              className="mt-3 w-full rounded-2xl rounded-tl-md border-2 border-ink/10 bg-white/60 shadow-sm"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function ShareIntro() {
  return (
    <section className="mt-14">
      <SectionTitle
        eyebrow="자랑하기"
        title="인스타에 올릴 한 장이 바로 나와요"
        desc="기록을 고르면 카드가 만들어져요. 우리가 칠한 지도를 그대로 담은 카드도 있고요. 지출은 카드에 담기지 않아요."
      />
      <img
        src="/intro/card-map.png"
        alt="공유 카드 예시 — 칠한 지역이 표시된 전국 지도 카드"
        loading="lazy"
        width={1080}
        height={1350}
        className="mt-5 w-full rounded-2xl rounded-tl-md border-2 border-ink/10 shadow-sm"
      />
    </section>
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
