import { NextRequest, NextResponse } from "next/server";
import { getTeamChatSupabaseServer } from "@/lib/teamChat/supabaseServer";
import { grantRoomDriveAccessForRoom } from "@/lib/googleDrive/roomDrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const body = await req.json().catch(() => null);
  const memberId = String(body?.memberId || "");
  if (!memberId) return NextResponse.json({ ok: false, error: "추가할 멤버를 선택해주세요." }, { status: 400 });

  const supabase = await getTeamChatSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const { error } = await supabase.from("chat_room_members").insert({ room_id: roomId, member_id: memberId });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Drive 폴더가 이미 있으면 새 멤버 이메일에도 접근권한 부여 — 베스트에포트, 실패해도 채팅은 안 막힘.
  grantRoomDriveAccessForRoom(roomId, memberId).catch((err) => {
    console.error("[team-chat] Drive 접근권한 부여 실패:", err);
  });

  return NextResponse.json({ ok: true });
}
