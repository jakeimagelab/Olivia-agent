import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { advanceWorkflow } from "@/lib/workflowAutomation";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.workflow_run_id) {
    return NextResponse.json({ ok: false, error: "workflow_run_id 필수" }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();

    // 원본 데이터 전달 단계에서 NAS 링크가 함께 오면, 고객 레코드의 "원본사진공유링크"로 반영한다.
    if (body.nas_link) {
      const { data: run } = await db
        .from("workflow_runs")
        .select("client_id")
        .eq("id", body.workflow_run_id)
        .maybeSingle();
      if (run?.client_id) {
        await db.from("clients").update({ original_photos_link: body.nas_link }).eq("id", run.client_id);
      }
    }

    const result = await advanceWorkflow(db, {
      workflow_run_id: body.workflow_run_id,
      to_step_key: body.to_step_key ?? null,
      from_step_key: body.from_step_key ?? null,
      reason: body.reason ?? "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
