import { NextRequest, NextResponse } from "next/server";
import { getTeamChatSupabaseServer } from "@/lib/teamChat/supabaseServer";
import { createResumableUploadSession } from "@/lib/googleDrive/roomDrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB (Drive resumable upload 한도에 맞춤)

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const supabase = await getTeamChatSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const { data: room } = await supabase.from("chat_rooms").select("id,name").eq("id", roomId).maybeSingle();
  if (!room) return NextResponse.json({ ok: false, error: "방을 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const fileName = String(body?.fileName || "").trim();
  const mimeType = String(body?.mimeType || "application/octet-stream");
  const fileSize = Number(body?.fileSize || 0);
  if (!fileName || !fileSize) {
    return NextResponse.json({ ok: false, error: "파일 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json({ ok: false, error: "파일은 2GB 이하만 업로드할 수 있습니다." }, { status: 400 });
  }

  try {
    const uploadUrl = await createResumableUploadSession({ roomId, roomName: room.name, fileName, mimeType, fileSize });
    return NextResponse.json({ ok: true, uploadUrl });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "업로드 세션 생성 실패" }, { status: 500 });
  }
}
