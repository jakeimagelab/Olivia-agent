import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeClientContext } from "@/lib/clientContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workflowRunId = new URL(req.url).searchParams.get("workflowRunId");
  const db = getSupabaseAdmin();

  try {
    const clientRes = await db
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();
    if (clientRes.error || !clientRes.data) throw new Error("고객을 찾을 수 없습니다.");

    let runQuery = db.from("workflow_runs").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(1);
    if (workflowRunId) runQuery = db.from("workflow_runs").select("*").eq("id", workflowRunId).limit(1);
    const runRes = await runQuery.maybeSingle();

    const context = normalizeClientContext(clientRes.data, runRes.data);
    return NextResponse.json({
      ok: true,
      client: context,
      workflow: runRes.data ? {
        workflowRunId: runRes.data.id,
        currentStepKey: runRes.data.current_step_key,
        currentStepName: context.currentStepName,
      } : null,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
