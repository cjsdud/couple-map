import { useState } from 'react';
import MapScreen from '../features/map/MapScreen';
import TodayScreen from '../features/today/TodayScreen';
import UsScreen from '../features/us/UsScreen';

/** IA 불변 규칙: 화면은 지도(홈)/오늘/우리 3개뿐. 확장은 레이어·카드·모달로만. */
const TABS = [
  { key: 'map', label: '지도', emoji: '🗺️', screen: MapScreen },
  { key: 'today', label: '오늘', emoji: '📸', screen: TodayScreen },
  { key: 'us', label: '우리', emoji: '💛', screen: UsScreen },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** 홈 화면 아이콘 길게 눌러 들어오는 바로가기(manifest shortcuts) — /?tab=today|us */
function initialTab(): TabKey {
  const wanted = new URLSearchParams(window.location.search).get('tab');
  return TABS.some((t) => t.key === wanted) ? (wanted as TabKey) : 'map';
}

export default function AppShell() {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const Screen = TABS.find((t) => t.key === tab)!.screen;
  // 탭을 바꾸면 맨 위부터 — 이전 탭의 스크롤 위치가 남아 중간부터 보이는 문제 방지
  const pickTab = (key: TabKey) => {
    setTab(key);
    window.scrollTo(0, 0);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="flex-1 pb-20">
        <Screen />
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => pickTab(t.key)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                tab === t.key ? 'font-bold text-pink' : 'text-ink/50'
              }`}
            >
              <span aria-hidden className="text-lg leading-none">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
