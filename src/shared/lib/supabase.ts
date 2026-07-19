import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * 환경변수 미설정(로컬 개발·프리뷰) 상태에서도 앱 셸이 뜨도록 null 허용.
 * 사용처는 반드시 null 가드를 거친다.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;
