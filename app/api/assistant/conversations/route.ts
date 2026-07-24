import { NextRequest, NextResponse } from "next/server";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json(
      { ok: false, error: "관리자 로그인이 필요합니다." },
      { status: 401 },
    );
  }
  try {
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const { data, error } = await db
      .from("assistant_conversations")
      .select("id,title,status,summary,last_message_at,created_at,updated_at")
      .eq("owner_id", owner.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, conversations: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "대화 기록 조회에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
