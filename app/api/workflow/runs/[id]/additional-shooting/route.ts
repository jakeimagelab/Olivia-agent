import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildNextAction, createStepTasks, ensureStepRun, logAgent } from "@/lib/workflowAutomation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_START_STEPS = new Set(["quote", "conti", "shooting"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const startStep = ALLOWED_START_STEPS.has(body.start_step_key) ? body.start_step_key : "quote";
  const db = getSupabaseAdmin();

  try {
    const { data: parent, error: parentError } = await db.from("workflow_runs").select("*").eq("id", id).single();
    if (parentError || !parent) return NextResponse.json({ ok: false, error: "기준 프로젝트를 찾을 수 없습니다." }, { status: 404 });

    const basePayload = {
      client_id: parent.client_id ?? null,
      project_id: parent.project_id ?? null,
      template_id: parent.template_id ?? "11111111-1111-1111-1111-111111111111",
      client_name: parent.client_name ?? "",
      project_name: body.project_name?.trim() || `${parent.project_name || "촬영 프로젝트"} · 추가 촬영`,
      manager_name: parent.manager_name ?? "",
      contact_name: parent.contact_name ?? parent.manager_name ?? "",
      contact_email: parent.contact_email ?? "",
      shoot_date: body.shoot_date || null,
      current_step_key: startStep,
      next_action: buildNextAction(startStep),
      status: "active",
    };

    let result = await db.from("workflow_runs").insert({
      ...basePayload,
      parent_workflow_run_id: parent.id,
      run_kind: "additional_shooting",
    }).select().single();

    // 마이그레이션 전 개발 DB에서도 추가 촬영 자체는 생성되도록 호환한다.
    if (result.error && /parent_workflow_run_id|run_kind/i.test(result.error.message)) {
      result = await db.from("workflow_runs").insert(basePayload).select().single();
    }
    if (result.error || !result.data) throw result.error ?? new Error("추가 촬영 생성 실패");

    await ensureStepRun(db, result.data.id, startStep, "in_progress");
    const taskResult = await createStepTasks(db, result.data.id, startStep);
    await logAgent(db, {
      workflow_run_id: result.data.id,
      log_type: "additional_shooting_started",
      message: `${parent.client_name || "고객"} 추가 촬영 하위 워크플로우가 시작되었습니다.`,
      input_summary: `parent_workflow_run_id: ${parent.id}`,
      output_summary: `created_tasks: ${taskResult.created.length}`,
    });

    return NextResponse.json({ ok: true, run: result.data, tasks: taskResult.created });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "추가 촬영 생성 실패" }, { status: 500 });
  }
}
