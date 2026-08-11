import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { STEP_NAME } from "@/lib/workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STALL_THRESHOLD_DAYS = 3;
const STALL_THRESHOLD_MS = STALL_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

// 진행 중인 워크플로우가 같은 단계에 3일 이상 머물러 있으면(견적/계약/콘티가 임시저장만 되고
// "공개"를 안 눌렀거나, 다른 어떤 단계에서든 다음 담당자로 안 넘어간 경우 전부 포함) 대시보드에
// 노출한다 — 단계 진입 시각은 workflow_step_runs.started_at을 우선 쓰고, 그 레코드가 없으면
// workflow_runs.updated_at/started_at으로 대체한다.
export async function GET() {
  const db = getSupabaseAdmin();

  const { data: runs, error: runsError } = await db
    .from("workflow_runs")
    .select("id, client_id, client_name, project_name, current_step_key, started_at, updated_at")
    .eq("status", "active");
  if (runsError) return NextResponse.json({ ok: false, error: runsError.message }, { status: 500 });

  const runIds = (runs ?? []).map((run) => run.id);
  const { data: stepRuns, error: stepRunsError } = runIds.length
    ? await db
        .from("workflow_step_runs")
        .select("workflow_run_id, step_key, started_at")
        .in("workflow_run_id", runIds)
        .eq("status", "in_progress")
    : { data: [] as { workflow_run_id: string; step_key: string; started_at: string | null }[], error: null };
  if (stepRunsError) return NextResponse.json({ ok: false, error: stepRunsError.message }, { status: 500 });

  const stepRunMap = new Map((stepRuns ?? []).map((stepRun) => [`${stepRun.workflow_run_id}:${stepRun.step_key}`, stepRun]));
  const now = Date.now();

  const items = (runs ?? [])
    .map((run) => {
      const stepRun = stepRunMap.get(`${run.id}:${run.current_step_key}`);
      const sinceIso = stepRun?.started_at || run.updated_at || run.started_at;
      return { run, sinceIso };
    })
    .filter(({ sinceIso }) => sinceIso && now - new Date(sinceIso).getTime() >= STALL_THRESHOLD_MS)
    .map(({ run, sinceIso }) => ({
      workflowRunId: run.id,
      clientId: run.client_id,
      clientName: run.client_name || "이름 없는 고객",
      projectName: run.project_name || "",
      stepKey: run.current_step_key,
      stepName: STEP_NAME[run.current_step_key] || run.current_step_key,
      stalledSince: sinceIso,
      daysStalled: Math.floor((now - new Date(sinceIso as string).getTime()) / (24 * 60 * 60 * 1000)),
    }))
    .sort((a, b) => b.daysStalled - a.daysStalled);

  return NextResponse.json({ ok: true, items, thresholdDays: STALL_THRESHOLD_DAYS });
}
