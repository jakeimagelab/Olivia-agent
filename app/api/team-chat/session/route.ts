import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTeamChatSupabaseServer } from "@/lib/teamChat/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 관리자 세션 여부 + 팀 채팅 멤버 여부를 함께 알려준다. 대표님은 관리자 세션만 있고
// 아직 팀챗 멤버로 가입 전일 수 있다(초대 발급/Drive 연결 패널만 보이는 상태).
export async function GET(req: NextRequest) {
  const isAdmin = req.cookies.get("pc_admin_session")?.value === "active";

  const supabase = await getTeamChatSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  let member: { id: string; email: string; displayName: string; avatarUrl: string | null } | null = null;
  if (user) {
    const db = getSupabaseAdmin();
    const { data } = await db
      .from("chat_members")
      .select("id,email,display_name,avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      member = { id: data.id, email: data.email, displayName: data.display_name, avatarUrl: data.avatar_url };
    }
  }

  return NextResponse.json({ ok: true, isAdmin, member });
}
