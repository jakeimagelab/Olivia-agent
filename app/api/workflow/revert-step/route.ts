import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { revertWorkflowToStep } from "@/lib/workflowAutomation";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.workflow_run_id || !body?.to_step_key) {
    return NextResponse.json({ ok: false, error: "workflow_run_id, to_step_key 필수" }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();
    const result = await revertWorkflowToStep(db, {
      workflow_run_id: body.workflow_run_id,
      to_step_key: body.to_step_key,
      reason: body.reason ?? "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
