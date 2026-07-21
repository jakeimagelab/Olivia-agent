import { NextRequest, NextResponse } from "next/server";
import { getTeamChatSupabaseServer } from "@/lib/teamChat/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RLS(is_chat_room_member)가 알아서 본인이 속한 방만 걸러주므로 여기선 그냥 조회만 하면 된다.
export async function GET() {
  const supabase = await getTeamChatSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const { data: rooms, error } = await supabase
    .from("chat_rooms")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const roomIds = (rooms ?? []).map((r) => r.id);
  const memberCounts: Record<string, number> = {};
  if (roomIds.length) {
    const { data: memberRows } = await supabase.from("chat_room_members").select("room_id").in("room_id", roomIds);
    for (const row of memberRows ?? []) memberCounts[row.room_id] = (memberCounts[row.room_id] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    rooms: (rooms ?? []).map((r) => ({ ...r, memberCount: memberCounts[r.id] ?? 0 })),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await getTeamChatSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const memberIds: string[] = Array.isArray(body?.memberIds) ? body.memberIds.filter((id: unknown) => typeof id === "string") : [];
  if (!name) return NextResponse.json({ ok: false, error: "방 이름을 입력해주세요." }, { status: 400 });

  const { data: room, error } = await supabase
    .from("chat_rooms")
    .insert({ name, created_by: user.id })
    .select("*")
    .single();
  if (error) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    let jwtSub: string | null = null;
    let jwtRole: string | null = null;
    if (token) {
      try {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
        jwtSub = payload.sub ?? null;
        jwtRole = payload.role ?? null;
      } catch {}
    }
    return NextResponse.json({
      ok: false,
      error: error.message,
      debug: { userId: user.id, jwtSub, jwtRole, hasSession: Boolean(sessionData.session) },
    }, { status: 500 });
  }

  const uniqueMemberIds = Array.from(new Set([user.id, ...memberIds]));
  const { error: memberError } = await supabase
    .from("chat_room_members")
    .insert(uniqueMemberIds.map((memberId) => ({ room_id: room.id, member_id: memberId })));
  if (memberError) return NextResponse.json({ ok: false, error: memberError.message }, { status: 500 });

  return NextResponse.json({ ok: true, room });
}
