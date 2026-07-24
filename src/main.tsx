import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { captureInviteFromUrl } from './shared/lib/invite';
import './styles/index.css';

// 초대 링크(/?invite=CODE)로 들어온 경우 — 코드를 잡아 두고 URL은 정리
captureInviteFromUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
