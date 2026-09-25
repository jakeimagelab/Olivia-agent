import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ACTIVE_WORKFLOW_STEP_KEYS,
  STEP_NAME,
  getWorkflowDisplayStepKey,
  getWorkflowPhaseProgress,
} from "@/lib/workflow";
import { getNextWorkflowStep } from "@/lib/workflowAutomation";
import { buildWorkflowNextAction } from "@/lib/workflowNextAction";
import type { CoreCommandResult } from "@/lib/core/commands/result";
import { loadCoreResourceRegistry } from "./resourceRegistry";
import type { CoreProjectSnapshot, CoreResourceRef, CoreWorkflowStepStatus } from "./types";

const STEP_STATUSES = new Set<CoreWorkflowStepStatus>([
  "pending", "in_progress", "waiting_approval", "completed", "skipped", "failed",
]);

function normalizeStepStatus(value: unknown): CoreWorkflowStepStatus {
  const status = String(value || "pending") as CoreWorkflowStepStatus;
  return STEP_STATUSES.has(status) ? status : "pending";
}

function resourceRefs(snapshot: CoreProjectSnapshot) {
  return Object.values(snapshot.resources).filter((resource): resource is CoreResourceRef => Boolean(resource));
}

export function summarizeCoreProjectSnapshot(snapshot: CoreProjectSnapshot) {
  const facts: string[] = [`${snapshot.client.name} · ${snapshot.workflow.currentStepName} 단계`];
  if (snapshot.resources.quote) facts.push(snapshot.resources.quote.approved ? "견적 완료" : "견적 초안 있음");
  else facts.push("견적 없음");
  if (snapshot.resources.contract) {
    facts.push(snapshot.resources.contract.status === "final" ? "계약 완료" : "계약서 초안 있음");
  } else {
    facts.push("계약서 없음");
  }
  facts.push(snapshot.resources.conti ? "콘티 있음" : "콘티 없음");
  if (snapshot.nextAction.label) facts.push(`다음: ${snapshot.nextAction.label}`);
  return facts.join(" · ");
}

export async function getCoreProjectSnapshot(
  workflowRunId: string,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<CoreProjectSnapshot>> {
  try {
    const { data: run, error: runError } = await db.from("workflow_runs")
      .select("id,client_id,project_id,client_name,project_name,current_step_key,status,created_at,updated_at")
      .eq("id", workflowRunId)
      .maybeSingle();
    if (runError) return { ok: false, reason: `프로젝트 조회 실패: ${runError.message}`, code: "SNAPSHOT_FAILED" };
    if (!run) return { ok: false, reason: "프로젝트를 찾을 수 없습니다.", code: "PROJECT_NOT_FOUND" };

    const [clientRes, stepRunsRes, tasksRes, approvalsRes, mailingRes, resources] = await Promise.all([
      run.client_id
        ? db.from("clients").select("id,hospital_name").eq("id", run.client_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.from("workflow_step_runs")
        .select("step_key,status,updated_at")
        .eq("workflow_run_id", workflowRunId)
        .order("updated_at", { ascending: false }),
      db.from("agent_tasks").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false }),
      db.from("agent_approvals").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false }),
      db.from("mailing_queue").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false }),
      loadCoreResourceRegistry(db, workflowRunId),
    ]);

    const failedQuery = [
      [clientRes, "고객"],
      [stepRunsRes, "단계 실행"],
      [tasksRes, "업무"],
      [approvalsRes, "승인"],
      [mailingRes, "메일"],
    ].find(([result]) => (result as { error: unknown }).error);
    if (failedQuery) {
      const [result, label] = failedQuery as [{ error: { message?: string } }, string];
      return { ok: false, reason: `${label} 조회 실패: ${result.error.message || "데이터베이스 오류"}`, code: "SNAPSHOT_FAILED" };
    }

    const byDisplayStep = new Map<string, CoreWorkflowStepStatus>();
    for (const row of stepRunsRes.data ?? []) {
      const displayKey = getWorkflowDisplayStepKey(row.step_key);
      if (displayKey && !byDisplayStep.has(displayKey)) byDisplayStep.set(displayKey, normalizeStepStatus(row.status));
    }
    const stepStates = ACTIVE_WORKFLOW_STEP_KEYS.map((key) => ({
      key,
      status: byDisplayStep.get(key) ?? "pending" as CoreWorkflowStepStatus,
    }));
    const completedSteps = stepStates.filter((step) => step.status === "completed").map((step) => step.key);
    const currentStep = String(run.current_step_key || "consult_meeting");
    const displayCurrentStep = getWorkflowDisplayStepKey(currentStep) || currentStep;
    const { progressPercent } = getWorkflowPhaseProgress(currentStep, run.status);
    const action = buildWorkflowNextAction({
      run,
      tasks: tasksRes.data ?? [],
      approvals: approvalsRes.data ?? [],
      mailing: mailingRes.data ?? [],
    });

    const snapshot: CoreProjectSnapshot = {
      client: {
        id: run.client_id ?? null,
        name: clientRes.data?.hospital_name || run.client_name || "이름 없는 고객",
      },
      project: {
        workflowRunId: run.id,
        projectId: run.project_id ?? null,
        name: run.project_name || run.client_name || "이름 없는 프로젝트",
        status: run.status,
      },
      workflow: {
        currentStep,
        currentStepName: STEP_NAME[displayCurrentStep] ?? displayCurrentStep,
        completedSteps,
        stepStates,
        nextStep: getNextWorkflowStep(currentStep),
        progressPercent,
      },
      resources,
      nextAction: {
        label: action.label,
        primaryAction: action.primaryAction,
        primaryActionLabel: action.primaryActionLabel,
      },
      consistency: { ok: true, issues: [] },
      generatedAt: new Date().toISOString(),
    };

    if (resourceRefs(snapshot).some((resource) => resource.workflowRunId !== workflowRunId)) {
      snapshot.consistency.issues.push("RESOURCE_WORKFLOW_RUN_MISMATCH");
    }
    const sourceQuoteId = snapshot.resources.contract?.sourceQuoteId;
    if (sourceQuoteId && snapshot.resources.quote && sourceQuoteId !== snapshot.resources.quote.id) {
      snapshot.consistency.issues.push("CONTRACT_SOURCE_QUOTE_MISMATCH");
    }
    snapshot.consistency.ok = snapshot.consistency.issues.length === 0;
    return { ok: true, value: snapshot };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "프로젝트 상태를 불러오지 못했습니다.",
      code: "SNAPSHOT_FAILED",
    };
  }
}
