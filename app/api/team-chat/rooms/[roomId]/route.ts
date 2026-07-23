import { NextRequest, NextResponse } from "next/server";
import { getTeamChatSupabaseServer } from "@/lib/teamChat/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const supabase = await getTeamChatSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const { data: room, error } = await supabase.from("chat_rooms").select("*").eq("id", roomId).maybeSingle();
  if (error || !room) return NextResponse.json({ ok: false, error: "방을 찾을 수 없습니다." }, { status: 404 });

  const { data: memberRows } = await supabase.from("chat_room_members").select("member_id").eq("room_id", roomId);
  const memberIds = (memberRows ?? []).map((m) => m.member_id);
  const { data: members } = memberIds.length
    ? await supabase.from("chat_members").select("id,email,display_name,avatar_url").in("id", memberIds)
    : { data: [] };

  const { data: project } = room.project_id
    ? await supabase.from("team_projects").select("id,name,progress,status").eq("id", room.project_id).maybeSingle()
    : { data: null };
  return NextResponse.json({ ok: true, room: { ...room, team_project: project }, members: members ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body?.color === "string") patch.color = body.color;
  if (typeof body?.oliviaEnabled === "boolean") patch.olivia_enabled = body.oliviaEnabled;
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });
  patch.updated_at = new Date().toISOString();

  const supabase = await getTeamChatSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const { error } = await supabase.from("chat_rooms").update(patch).eq("id", roomId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
