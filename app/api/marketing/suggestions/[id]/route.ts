import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH — 제안 채택(accepted, marketing_actions에 정식 등록) 또는 기각(dismissed).
// 승인 게이트: 사용자가 명시적으로 채택해야만 실제 액션으로 반영된다.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const body = await req.json();
    const status = body.status as "accepted" | "dismissed" | undefined;

    if (status !== "accepted" && status !== "dismissed") {
      return NextResponse.json({ ok: false, error: "status는 accepted 또는 dismissed여야 합니다." }, { status: 400 });
    }

    const { data: suggestion, error: findError } = await supabase
      .from("marketing_action_suggestions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!suggestion) return NextResponse.json({ ok: false, error: "제안을 찾을 수 없습니다." }, { status: 404 });

    let createdAction = null;
    if (status === "accepted") {
      const { data: action, error: actionError } = await supabase
        .from("marketing_actions")
        .insert({
          strategy_id: suggestion.strategy_id,
          title: suggestion.suggested_title,
          description: suggestion.suggested_description,
          scheduled_date: body.scheduledDate || null,
        })
        .select("*")
        .single();
      if (actionError) throw new Error(actionError.message);
      createdAction = action;
    }

    const { error: updateError } = await supabase
      .from("marketing_action_suggestions")
      .update({ status })
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ ok: true, action: createdAction });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "제안 처리 실패" }, { status: 500 });
  }
}
