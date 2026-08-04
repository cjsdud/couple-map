import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import App from './app/App';
import { listenKakaoRedirect } from './shared/lib/auth';
import { captureInviteFromUrl, captureRefFromUrl } from './shared/lib/invite';
import './styles/index.css';

// 초대 링크(/?invite=CODE)로 들어온 경우 — 코드를 잡아 두고 URL은 정리
captureInviteFromUrl();
// 친구 커플 소개 링크(?ref=커플id) — 나중에 커플이 되면 귀속한다 (0018)
captureRefFromUrl();
// 네이티브 셸: 카카오가 커스텀 스킴으로 앱을 깨울 때 로그인을 마무리한다 (웹에서는 무동작)
void listenKakaoRedirect();
// 방문 지표 (Vercel Web Analytics) — 대시보드에서 Enable 시 수집 시작, 개인 식별 정보 없음
if (import.meta.env.PROD) inject();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
