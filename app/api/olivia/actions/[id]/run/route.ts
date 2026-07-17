import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runOliviaAction } from "@/lib/olivia/actionPlanner";
import { buildWorkflowContext } from "@/lib/olivia/context";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: action, error } = await db.from("olivia_actions").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  if (action.permission_level !== "auto" && action.status !== "approved") {
    return NextResponse.json({ ok: false, error: "대표 승인 후 실행할 수 있습니다." }, { status: 409 });
  }
  try {
    const context = action.workflow_run_id ? await buildWorkflowContext(db, action.workflow_run_id) : undefined;
    const result = await runOliviaAction(db, action, context);
    return NextResponse.json({ ok: true, data: result });
  } catch (runError) {
    return NextResponse.json({ ok: false, error: runError instanceof Error ? runError.message : String(runError) }, { status: 500 });
  }
}
