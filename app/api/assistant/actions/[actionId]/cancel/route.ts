import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/assistant/validation";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ actionId: string }> },
) {
  if (!isAdminSession(req)) {
    return NextResponse.json(
      { ok: false, error: "관리자 로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const { actionId } = await params;
  if (!isUuid(actionId)) {
    return NextResponse.json(
      { ok: false, error: "Action ID가 올바르지 않습니다." },
      { status: 400 },
    );
  }
  try {
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const { data, error } = await db
      .from("assistant_action_requests")
      .update({ status: "cancelled" })
      .eq("id", actionId)
      .eq("owner_id", owner.id)
      .eq("status", "waiting_confirmation")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "이미 처리되었거나 취소할 수 없는 요청입니다." },
        { status: 409 },
      );
    }
    await db
      .from("assistant_confirmations")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        consumed_at: new Date().toISOString(),
      })
      .eq("action_request_id", actionId)
      .eq("status", "waiting");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Action 취소에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
