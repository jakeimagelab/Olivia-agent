import { NextRequest, NextResponse } from "next/server";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { getOrCreateAssistantConversation, listAssistantMessages } from "@/lib/assistant/conversations/service";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
}
export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) return unauthorized();
  try {
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const conversation = await getOrCreateAssistantConversation(db, owner.id);
    const messages = await listAssistantMessages(db, owner.id, conversation.id, 100);
    return NextResponse.json({ ok: true, conversationId: conversation.id, messages });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "대화를 불러오지 못했어요." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) return unauthorized();
  try {
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    await db.from("assistant_conversations").update({ status: "archived", updated_at: new Date().toISOString() }).eq("owner_id", owner.id).eq("status", "active");
    const { data, error } = await db.from("assistant_conversations")
      .insert({ owner_id: owner.id, status: "active", title: "새 Olivia 대화" })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "새 대화를 생성하지 못했어요.");
    return NextResponse.json({ ok: true, conversationId: data.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "새 대화를 만들지 못했어요." }, { status: 500 });
  }
}
