import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createStepTasks, getWorkflowRun } from "@/lib/workflowAutomation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { workflow_run_id, step_key } = await req.json();
  if (!workflow_run_id) return NextResponse.json({ ok: false, error: "workflow_run_id 필수" }, { status: 400 });

  try {
    const db = getSupabaseAdmin();
    const run = await getWorkflowRun(db, workflow_run_id);
    const result = await createStepTasks(db, workflow_run_id, step_key || run.current_step_key);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
