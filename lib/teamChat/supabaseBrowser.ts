"use client";

import { createBrowserClient } from "@supabase/ssr";

let cached: ReturnType<typeof createBrowserClient> | null = null;

// Realtime 구독 + 클라이언트 컴포넌트에서 RLS-스코프 조회에 쓰는 브라우저용 Supabase 클라이언트.
export function getTeamChatSupabaseBrowser() {
  if (cached) return cached;
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return cached;
}
