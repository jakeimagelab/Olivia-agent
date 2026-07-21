import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// 팀 채팅 전용 세션-스코프 Supabase 클라이언트 (RLS가 auth.uid() 기준으로 동작).
// 기존 lib/supabase.ts의 getSupabaseAdmin()/getSupabase()는 관리자 단일 세션 체계용이라
// 건드리지 않고, 팀원별 로그인이 필요한 팀 채팅만 별도 파일로 분리했다.
export async function getTeamChatSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component 렌더 중에는 쓰기가 무시된다 — Route Handler/미들웨어에서만 실제로 반영된다.
          }
        },
      },
    }
  );
}
