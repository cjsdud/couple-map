import { useEffect, useState } from 'react';
import { apiUrl } from '../../shared/lib/apiBase';
import { supabase } from '../../shared/lib/supabase';

/**
 * 이 기기의 로그인 계정이 관리자인가 — 우리 탭의 '관리자 현황' 버튼 노출 판정.
 *
 * 판별 자체는 언제나 서버(api/admin-stats, ADMIN_USER_IDS)가 한다 — 이 훅은 버튼을
 * 보여줄지만 정한다 (버튼이 보여도 서버가 403이면 아무것도 못 본다).
 * 결과는 localStorage에 캐시해 다음부터 바로 뜨고, 세션마다 한 번씩 다시 물어
 * 관리자 등록·해제가 다음 접속에 반영된다.
 */
const CACHE_KEY = 'dohwaji:isAdmin';
const PROBED_KEY = 'dohwaji:adminProbed';

export function useIsAdmin(): boolean {
  const [admin, setAdmin] = useState(() => {
    try {
      return localStorage.getItem(CACHE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!supabase) return;
    try {
      if (sessionStorage.getItem(PROBED_KEY) === '1') return;
    } catch {
      // sessionStorage 불가 — 매번 물어봐도 가벼운 요청이라 괜찮다
    }
    void (async () => {
      const { data } = await supabase!.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      try {
        const res = await fetch(apiUrl('/api/admin-stats'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accessToken, probe: true }),
        });
        const ok = res.ok;
        setAdmin(ok);
        try {
          localStorage.setItem(CACHE_KEY, ok ? '1' : '0');
          sessionStorage.setItem(PROBED_KEY, '1');
        } catch {
          // 캐시 실패 — 다음에 다시 물어본다
        }
      } catch {
        // 네트워크 실패 — 캐시된 값 유지
      }
    })();
  }, []);

  return admin;
}
