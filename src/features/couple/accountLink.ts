import { useMutation } from '@tanstack/react-query';
import { apiUrl } from '../../shared/lib/apiBase';
import { supabase } from '../../shared/lib/supabase';

/**
 * 채널 간 계정 연동 (0014_account_link.sql).
 *
 * 앱인토스는 토스 로그인만, 웹·스토어 앱은 카카오 로그인만 쓸 수 있어 채널마다 계정이
 * 따로 만들어진다. 쓰던 계정에서 코드를 발급해 새 계정 쪽에서 입력하면 하나로 합쳐진다.
 */

export interface LinkCode {
  code: string;
  expiresAt: string;
}

/** 쓰던 계정에서 연결 코드 발급 (10분 유효) */
export function useIssueLinkCode() {
  return useMutation({
    mutationFn: async (): Promise<LinkCode> => {
      if (!supabase) throw new Error('Supabase 연결 후 쓸 수 있어요');
      const { data, error } = await supabase.rpc('issue_link_code');
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as
        | { code: string; expires_at: string }
        | undefined;
      if (!row) throw new Error('코드를 만들지 못했어요');
      return { code: row.code, expiresAt: row.expires_at };
    },
  });
}

/**
 * 새로 만들어진 계정에서 코드를 입력해 기존 계정으로 이어붙인다.
 * 성공하면 기존 계정의 세션으로 갈아끼운다 (지금 계정은 서버에서 정리됨).
 */
export function useLinkAccount() {
  return useMutation({
    mutationFn: async (code: string) => {
      if (!supabase) throw new Error('Supabase 연결 후 쓸 수 있어요');
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('로그인이 만료됐어요. 다시 로그인해 주세요');

      const res = await fetch(apiUrl('/api/link-account'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), accessToken }),
      });
      const body = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        error?: string;
      };
      if (!res.ok || !body.access_token || !body.refresh_token) {
        throw new Error(body.error ?? '연결하지 못했어요');
      }
      const { error } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      if (error) throw error;
    },
  });
}
