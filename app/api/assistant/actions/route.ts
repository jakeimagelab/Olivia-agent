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
    const limit = Math.min(
      Math.max(Number(req.nextUrl.searchParams.get("limit")) || 50, 1),
      100,
    );
    const status = req.nextUrl.searchParams.get("status");
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    let query = db
      .from("assistant_action_requests")
      .select(
        "id,conversation_id,source_channel,action_name,parameters,confirmation_required,status,result,error_code,error_message,created_at,updated_at,executed_at",
      )
      .eq("owner_id", owner.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, actions: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Action 기록 조회에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
