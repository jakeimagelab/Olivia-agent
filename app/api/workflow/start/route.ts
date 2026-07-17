import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildNextAction, createStepTasks, ensureStepRun, logAgent } from "@/lib/workflowAutomation";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getSupabaseAdmin();
  const firstStep = body.current_step_key || "consult_meeting";

  if (!body.client_id && !body.client_name) {
    return NextResponse.json({ ok: false, error: "client_id 또는 client_name이 필요합니다." }, { status: 400 });
  }

  try {
    const { data: run, error } = await db
      .from("workflow_runs")
      .insert({
        client_id: body.client_id ?? null,
        project_id: body.project_id ?? null,
        template_id: body.template_id ?? "11111111-1111-1111-1111-111111111111",
        client_name: body.client_name ?? "",
        project_name: body.project_name ?? "포토클리닉 촬영 프로젝트",
        manager_name: body.manager_name ?? "",
        contact_name: body.contact_name ?? body.manager_name ?? "",
        contact_email: body.contact_email ?? body.email ?? "",
        shoot_date: body.shoot_date || null,
        current_step_key: firstStep,
        next_action: buildNextAction(firstStep),
        status: "active",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await ensureStepRun(db, run.id, firstStep, "in_progress");
    const taskResult = await createStepTasks(db, run.id, firstStep);
    await logAgent(db, {
      workflow_run_id: run.id,
      log_type: "workflow_started",
      message: `${run.client_name || "고객"} 워크플로우가 시작되었습니다.`,
      output_summary: `created_tasks: ${taskResult.created.length}`,
    });
    await emitOliviaEventSafely(db, {
      eventType: "workflow.started",
      eventSource: "workflow_start_api",
      clientId: run.client_id ?? null,
      projectId: run.project_id ?? null,
      workflowRunId: run.id,
      actorType: "admin",
      payload: { firstStepKey: firstStep, clientName: run.client_name, projectName: run.project_name },
      deduplicationKey: createEventDeduplicationKey("workflow.started", run.id),
    });

    return NextResponse.json({ ok: true, run, tasks: taskResult.created });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
