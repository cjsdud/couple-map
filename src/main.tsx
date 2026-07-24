import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import App from './app/App';
import { captureInviteFromUrl } from './shared/lib/invite';
import './styles/index.css';

// 초대 링크(/?invite=CODE)로 들어온 경우 — 코드를 잡아 두고 URL은 정리
captureInviteFromUrl();
// 방문 지표 (Vercel Web Analytics) — 대시보드에서 Enable 시 수집 시작, 개인 식별 정보 없음
if (import.meta.env.PROD) inject();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
