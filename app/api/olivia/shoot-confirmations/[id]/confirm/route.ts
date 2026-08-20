import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { advanceWorkflow } from "@/lib/workflowAutomation";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 홈 채팅의 "네, 다음 단계로" 버튼 — insight를 열어 workflow_run_id를 찾고, 아직 정말
// "촬영" 단계일 때만(from_step_key 가드) 다음 단계로 넘긴 뒤 insight를 처리 완료로 닫는다.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  const { data: insight, error: insightError } = await db
    .from("olivia_insights")
    .select("id, workflow_run_id, status")
    .eq("id", id)
    .maybeSingle();
  if (insightError) return NextResponse.json({ ok: false, error: insightError.message }, { status: 500 });
  if (!insight || !insight.workflow_run_id) return NextResponse.json({ ok: false, error: "확인할 수 없는 인사이트입니다." }, { status: 404 });

  try {
    const result = await advanceWorkflow(db, {
      workflow_run_id: insight.workflow_run_id,
      from_step_key: "shooting",
      reason: "홈 채팅에서 촬영 완료 확인",
    });
    await db.from("olivia_insights").update({ status: "acknowledged" }).eq("id", id).in("status", ["open", "action_created"]);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
