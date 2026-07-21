import { NextResponse } from "next/server";
import { getTeamChatSupabaseServer } from "@/lib/teamChat/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getTeamChatSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const { data, error } = await supabase
    .from("chat_members")
    .select("id,email,display_name,avatar_url")
    .order("display_name");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, members: data ?? [] });
}
