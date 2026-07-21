import { NextResponse } from "next/server";
import { getTeamChatSupabaseServer } from "@/lib/teamChat/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await getTeamChatSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
