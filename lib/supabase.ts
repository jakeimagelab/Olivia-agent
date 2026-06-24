import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 빌드 타임에 클라이언트 생성 금지 — 런타임에만 생성
let _admin: SupabaseClient | null = null;
let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수 미설정");
  _admin = createClient(url, key);
  return _admin;
}

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수 미설정");
  _client = createClient(url, key);
  return _client;
}

// 하위 호환 (기존 코드에서 supabaseAdmin으로 쓰는 곳)
export const supabaseAdmin = {
  from: (table: string) => getSupabaseAdmin().from(table),
};
