import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getTeamChatSupabaseServer } from "@/lib/teamChat/supabaseServer";
import { verifyAndRecordAttachment } from "@/lib/googleDrive/roomDrive";
import { generateOliviaReply } from "@/lib/teamChat/oliviaReply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const before = new URL(req.url).searchParams.get("before");

  const supabase = await getTeamChatSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  let query = supabase
    .from("chat_messages")
    .select("*, chat_attachments(*)")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const messageIds = (data ?? []).map((message) => message.id);
  const { data: linkedTasks } = messageIds.length
    ? await supabase
        .from("team_tasks")
        .select("id,title,status,source_message_id")
        .in("source_message_id", messageIds)
        .neq("status", "canceled")
    : { data: [] };
  const tasksByMessage = new Map<string, Array<{ id: string; title: string; status: string }>>();
  for (const task of linkedTasks ?? []) {
    const list = tasksByMessage.get(task.source_message_id) ?? [];
    list.push({ id: task.id, title: task.title, status: task.status });
    tasksByMessage.set(task.source_message_id, list);
  }
  return NextResponse.json({
    ok: true,
    messages: (data ?? []).reverse().map((message) => ({
      ...message,
      linked_tasks: tasksByMessage.get(message.id) ?? [],
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const body = await req.json().catch(() => null);
  const text = String(body?.body || "").trim();
  const attachment = body?.attachment as
    | { driveFileId: string; fileName: string; mimeType?: string; sizeBytes?: number }
    | undefined;
  if (!text && !attachment) return NextResponse.json({ ok: false, error: "내용을 입력해주세요." }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ ok: false, error: "메시지가 너무 깁니다." }, { status: 400 });

  const supabase = await getTeamChatSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const { data: message, error } = await supabase
    .from("chat_messages")
    .insert({ room_id: roomId, sender_type: "member", sender_member_id: user.id, body: text })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (attachment?.driveFileId) {
    try {
      await verifyAndRecordAttachment({ roomId, messageId: message.id, ...attachment });
    } catch (err) {
      console.error("[team-chat] 첨부파일 검증 실패:", err instanceof Error ? err.message : err);
    }
  }

  const { data: room } = await supabase.from("chat_rooms").select("olivia_enabled").eq("id", roomId).maybeSingle();
  const mentionsOlivia = /@\s*올리비아|@\s*olivia/i.test(text);
  if (room?.olivia_enabled || mentionsOlivia) {
    after(() => generateOliviaReply(roomId).catch((err: unknown) => console.error("[team-chat] 올리비아 응답 실패:", err)));
  }

  return NextResponse.json({ ok: true, message });
}
