import type { SupabaseClient } from "@supabase/supabase-js";
import {
  advanceWorkflow,
  buildNextAction,
  completeOpenStepTasksForManualSave,
  ensureStepRun,
  getWorkflowRun,
  revertWorkflowToStep,
} from "@/lib/workflowAutomation";
import { completeShoot } from "@/lib/core/commands/workflow";
import { createEventDeduplicationKey, emitOliviaEvent } from "@/lib/olivia/events";
import { validatePhotoProjectRelativePath } from "./server";

export type ShootingProgressStage =
  | "backup_sorting"
  | "original_delivery"
  | "client_selection"
  | "raw_matching"
  | "retouching"
  | "final_delivery"
  | "revision"
  | "completed";

export type ShootingProgressTone = "attention" | "progress" | "waiting";

export type ShootingProgressActionStage =
  | "original_delivery"
  | "client_selection"
  | "raw_matching"
  | "retouching"
  | "final_delivery";

export type ShootingProgressManualState = "completed" | "skipped" | "restored";

export type ShootingProgressCard = {
  projectId: string;
  projectName: string;
  sourceRelativePath: string;
  clientName: string;
  clientId: string | null;
  workflowRunId: string | null;
  calendarTaskId: string | null;
  shootDate: string | null;
  jpgCount: number;
  stage: Exclude<ShootingProgressStage, "completed">;
  stageLabel: string;
  tone: ShootingProgressTone;
  actionRequired: boolean;
  summary: string;
  detail: string;
  progressPercent: number;
  updatedAt: string;
  galleryId: string | null;
  nasLink: string | null;
  selectionUrl: string | null;
  manualStates: Partial<Record<ShootingProgressActionStage, ShootingProgressManualState>>;
};

export type PhotoWorkflowLink = {
  shootDate: string | null;
  calendarTaskId: string | null;
  workflowRunId: string | null;
  matched: boolean;
  reason: "matched" | "calendar_not_found" | "calendar_ambiguous" | "workflow_not_found" | "workflow_ambiguous";
};

type CalendarCandidate = {
  id: string;
  date: string;
  title?: string | null;
  location?: string | null;
};

type WorkflowCandidate = {
  id: string;
  shoot_date?: string | null;
  client_name?: string | null;
  project_name?: string | null;
  current_step_key?: string | null;
  status?: string | null;
};

type ProgressFacts = {
  projectStatus?: string | null;
  galleryStatus?: string | null;
  galleryNasLink?: string | null;
  rawJobStatus?: string | null;
  workflowCurrentStep?: string | null;
  workflowStatus?: string | null;
  originalDeliveryStepStatus?: string | null;
  rawMatchingStepStatus?: string | null;
};

function compact(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR")
    .replace(/촬영|사진|병원|의원|프로젝트/g, "")
    .replace(/[^0-9a-z가-힣]+/g, "");
}

export function photoFolderSubject(folderName: string): string {
  return folderName
    .normalize("NFC")
    .replace(/^\s*\d{4}(?:[_\s-]+|$)/, "")
    .replace(/\([^)]*\)\s*$/, "")
    .trim();
}

export function buildFolderDateCandidates(folderName: string, reference: Date): string[] {
  const match = folderName.normalize("NFC").match(/^\s*(\d{2})(\d{2})(?:[_\s-]|$)/);
  if (!match) return [];
  const month = Number(match[1]);
  const day = Number(match[2]);
  const referenceMs = reference.getTime();
  if (!Number.isFinite(referenceMs)) return [];

  const values = [reference.getUTCFullYear() - 1, reference.getUTCFullYear(), reference.getUTCFullYear() + 1]
    .map((year) => {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
      return { value: date.toISOString().slice(0, 10), distance: Math.abs(date.getTime() - referenceMs) };
    })
    .filter((value): value is { value: string; distance: number } => Boolean(value))
    .sort((a, b) => a.distance - b.distance);

  return values.map((value) => value.value);
}

function matchScore(subject: string, values: Array<string | null | undefined>): number {
  const needle = compact(subject);
  if (!needle) return 0;
  let best = 0;
  for (const value of values) {
    const candidate = compact(value);
    if (!candidate) continue;
    if (candidate === needle) best = Math.max(best, 100);
    else if (candidate.includes(needle) || needle.includes(candidate)) best = Math.max(best, 70);
  }
  return best;
}

export function chooseUniqueCandidate<T>(
  candidates: T[],
  score: (candidate: T) => number,
): { candidate: T | null; ambiguous: boolean } {
  if (candidates.length === 0) return { candidate: null, ambiguous: false };
  if (candidates.length === 1) return { candidate: candidates[0], ambiguous: false };
  const scored = candidates.map((candidate) => ({ candidate, score: score(candidate) })).sort((a, b) => b.score - a.score);
  if (scored[0].score <= 0 || scored[0].score === scored[1].score) return { candidate: null, ambiguous: true };
  return { candidate: scored[0].candidate, ambiguous: false };
}

export function resolveShootingProgressStage(facts: ProgressFacts): ShootingProgressStage {
  const rawStatus = String(facts.rawJobStatus ?? "").toUpperCase();
  const galleryStatus = String(facts.galleryStatus ?? "").toLowerCase();
  const workflowStep = String(facts.workflowCurrentStep ?? "").toLowerCase();

  if (String(facts.workflowStatus ?? "").toLowerCase() === "completed") return "completed";
  if (workflowStep === "reward") return "completed";
  if (workflowStep === "revision") return "revision";
  if (workflowStep === "final_delivery") return "final_delivery";

  if (
    rawStatus === "COMPLETED"
    || facts.rawMatchingStepStatus === "completed"
    || ["raw_matched", "retouching", "completed"].includes(galleryStatus)
    || workflowStep === "retouching"
  ) return "retouching";

  if (
    ["QUEUED", "RUNNING", "FAILED"].includes(rawStatus)
    || facts.rawMatchingStepStatus === "in_progress"
    || ["selection_submitted", "raw_matching"].includes(galleryStatus)
    || workflowStep === "raw_matching"
  ) return "raw_matching";

  if (
    Boolean(facts.galleryNasLink?.trim())
    || ["ready", "mail_draft_created", "mail_sent", "waiting_selection"].includes(galleryStatus)
  ) return "client_selection";

  if (
    String(facts.projectStatus ?? "").toUpperCase() === "CLASSIFY_COMPLETED"
    || facts.originalDeliveryStepStatus === "in_progress"
    || workflowStep === "original_delivery"
  ) return "original_delivery";

  return "backup_sorting";
}

export async function resolvePhotoWorkflowLink(
  db: SupabaseClient,
  input: { folderName: string; detectedAt?: string | null },
): Promise<PhotoWorkflowLink> {
  const reference = input.detectedAt ? new Date(input.detectedAt) : new Date();
  const dates = buildFolderDateCandidates(input.folderName, reference);
  if (!dates.length) {
    return { shootDate: null, calendarTaskId: null, workflowRunId: null, matched: false, reason: "calendar_not_found" };
  }

  const { data: calendarRows, error: calendarError } = await db
    .from("calendar_tasks")
    .select("id,date,title,location")
    .eq("category", "shooting")
    // MMDD 폴더는 감지 시각과 가장 가까운 연도의 촬영으로만 본다. 인접 연도를
    // 함께 조회하면 올해 일정이 없다는 이유로 작년 동명 촬영에 잘못 연결될 수 있다.
    .eq("date", dates[0]);
  if (calendarError) throw calendarError;
  const calendars = (calendarRows ?? []) as CalendarCandidate[];
  const subject = photoFolderSubject(input.folderName);
  const calendarChoice = chooseUniqueCandidate(calendars, (candidate) => matchScore(subject, [candidate.title, candidate.location]));
  if (!calendarChoice.candidate) {
    return {
      shootDate: null,
      calendarTaskId: null,
      workflowRunId: null,
      matched: false,
      reason: calendarChoice.ambiguous ? "calendar_ambiguous" : "calendar_not_found",
    };
  }

  const calendar = calendarChoice.candidate;
  const { data: workflowRows, error: workflowError } = await db
    .from("workflow_runs")
    .select("id,shoot_date,client_name,project_name,current_step_key,status")
    .eq("status", "active")
    .eq("shoot_date", calendar.date);
  if (workflowError) throw workflowError;
  const workflows = (workflowRows ?? []) as WorkflowCandidate[];
  const workflowChoice = chooseUniqueCandidate(workflows, (candidate) => matchScore(subject, [
    candidate.client_name,
    candidate.project_name,
  ]));

  return {
    shootDate: calendar.date,
    calendarTaskId: calendar.id,
    workflowRunId: workflowChoice.candidate?.id ?? null,
    matched: Boolean(workflowChoice.candidate),
    reason: workflowChoice.candidate
      ? "matched"
      : workflowChoice.ambiguous
        ? "workflow_ambiguous"
        : "workflow_not_found",
  };
}

// completeShoot()는 to_step_key를 고정하지 않는다 — getNextWorkflowStep(ACTIVE_WORKFLOW_STEP_KEYS
// 순서)이 shooting 다음을 payment_confirm으로 정한다. 예전엔 여기서 backup_sorting을 직접
// 지정해서 잔금·계산서(payment_confirm) 단계를 통째로 건너뛰었다 — NAS 자동 감지가 홈 채팅
// 확인보다 거의 항상 먼저 일어나서 실질적으로 이 단계가 한 번도 열리지 않는 사고였다
// (PHASE 3 작업 1-B/3, 2026-09-25).
async function advanceShootingIfCurrent(db: SupabaseClient, workflowRunId: string): Promise<void> {
  await completeShoot(workflowRunId, db);
}

export async function registerDetectedPhotoProject(
  db: SupabaseClient,
  input: {
    folderName: string;
    detectedAt?: string | null;
    fileCount?: number;
    totalBytes?: number;
  },
): Promise<{ projectId: string; link: PhotoWorkflowLink; created: boolean }> {
  const sourceRelativePath = validatePhotoProjectRelativePath(input.folderName);
  const link = await resolvePhotoWorkflowLink(db, input);
  const { data: existing, error: readError } = await db
    .from("photo_storage_projects")
    .select("id,workflow_run_id,calendar_task_id")
    .eq("source_relative_path", sourceRelativePath)
    .maybeSingle();
  if (readError) throw readError;

  const now = new Date().toISOString();
  let projectId: string;
  let created = false;
  if (existing) {
    projectId = String(existing.id);
    const patch: Record<string, unknown> = {};
    if (!existing.workflow_run_id && link.workflowRunId) patch.workflow_run_id = link.workflowRunId;
    if (!existing.calendar_task_id && link.calendarTaskId) patch.calendar_task_id = link.calendarTaskId;
    if (Object.keys(patch).length > 0) {
      patch.updated_at = now;
      const { error } = await db.from("photo_storage_projects").update(patch).eq("id", existing.id);
      if (error) throw error;
    }
  } else {
    const { data, error } = await db.from("photo_storage_projects").insert({
      project_name: input.folderName,
      source_relative_path: sourceRelativePath,
      status: "READY",
      raw_count: 0,
      jpg_count: 0,
      jpg_bytes: 0,
      fingerprint: null,
      discovered_at: input.detectedAt || now,
      workflow_run_id: link.workflowRunId,
      calendar_task_id: link.calendarTaskId,
      updated_at: now,
    }).select("id").single();
    if (error || !data) throw error ?? new Error("촬영 폴더 프로젝트를 등록하지 못했습니다.");
    projectId = String(data.id);
    created = true;
  }

  if (link.workflowRunId) await advanceShootingIfCurrent(db, link.workflowRunId);
  return { projectId, link, created };
}

async function completeStepRun(db: SupabaseClient, workflowRunId: string, stepKey: string): Promise<void> {
  const stepRun = await ensureStepRun(db, workflowRunId, stepKey, "in_progress");
  if (stepRun.status === "completed") return;
  const now = new Date().toISOString();
  const { error } = await db.from("workflow_step_runs")
    .update({ status: "completed", completed_at: now, updated_at: now })
    .eq("id", stepRun.id)
    .neq("status", "completed");
  if (error) throw error;
}

export async function syncOriginalDeliveryRegisteredWorkflow(
  db: SupabaseClient,
  workflowRunId: string | null | undefined,
): Promise<void> {
  if (!workflowRunId) return;
  await completeStepRun(db, workflowRunId, "original_delivery");
  const run = await getWorkflowRun(db, workflowRunId);
  if (run.current_step_key !== "client_selection") return;
  await ensureStepRun(db, workflowRunId, "client_selection", "in_progress");
  const { error } = await db.from("workflow_runs").update({
    next_action: buildNextAction("client_selection"),
    updated_at: new Date().toISOString(),
  }).eq("id", workflowRunId);
  if (error) throw error;
}

// 아래의 to_step_key 고정값들은 전부 안전하다 — 매 분기가 advanceWorkflow를 부르기 전에
// run.current_step_key(또는 input.stage)가 바로 그 단계인지 먼저 확인하므로, 지정한
// to_step_key는 ACTIVE_WORKFLOW_STEP_KEYS 순서상 실제 다음 단계와 항상 일치한다(건너뜀 없음).
export async function syncManualShootingProgressAction(
  db: SupabaseClient,
  input: {
    workflowRunId: string | null | undefined;
    stage: ShootingProgressActionStage;
    state: ShootingProgressManualState;
  },
): Promise<void> {
  const workflowRunId = input.workflowRunId;
  if (!workflowRunId) return;
  const run = await getWorkflowRun(db, workflowRunId);

  if (input.state === "restored") {
    if (input.stage === "original_delivery" || input.stage === "raw_matching") {
      const now = new Date().toISOString();
      const { error: reopenError } = await db.from("workflow_step_runs")
        .update({ status: "in_progress", completed_at: null, updated_at: now })
        .eq("workflow_run_id", workflowRunId)
        .eq("step_key", input.stage);
      if (reopenError) throw reopenError;
      await ensureStepRun(db, workflowRunId, input.stage, "in_progress");
      const { error: nextActionError } = await db.from("workflow_runs").update({
        next_action: buildNextAction(input.stage),
        updated_at: now,
      }).eq("id", workflowRunId);
      if (nextActionError) throw nextActionError;
    }
    const target = input.stage === "retouching" || input.stage === "final_delivery"
      ? input.stage
      : "client_selection";
    if (run.current_step_key !== target) {
      try {
        await revertWorkflowToStep(db, {
          workflow_run_id: workflowRunId,
          to_step_key: target,
          reason: `촬영 진행 ${input.stage} 단계 건너뛰기 취소`,
        });
      } catch (error) {
        // 같은 단계이거나 이미 더 앞선 단계라면 이벤트 이력만 복원해도 카드가 다시 열린다.
        console.warn("[shooting progress restore workflow]", error instanceof Error ? error.message : error);
      }
    }
    return;
  }

  if (input.stage === "original_delivery") {
    await syncOriginalDeliveryRegisteredWorkflow(db, workflowRunId);
    return;
  }
  if (input.stage === "raw_matching") {
    await completeStepRun(db, workflowRunId, "raw_matching");
    if (run.current_step_key === "client_selection") {
      await completeOpenStepTasksForManualSave(db, workflowRunId, "client_selection");
      await advanceWorkflow(db, {
        workflow_run_id: workflowRunId,
        from_step_key: "client_selection",
        to_step_key: "retouching",
        reason: `RAW 매칭 ${input.state === "skipped" ? "건너뜀" : "완료"}`,
      });
    }
    return;
  }
  if (input.stage === "client_selection" && run.current_step_key === "client_selection") {
    await completeStepRun(db, workflowRunId, "client_selection");
    await completeOpenStepTasksForManualSave(db, workflowRunId, "client_selection");
    await advanceWorkflow(db, {
      workflow_run_id: workflowRunId,
      from_step_key: "client_selection",
      to_step_key: "retouching",
      reason: `고객 셀렉 ${input.state === "skipped" ? "건너뜀" : "완료"}`,
    });
    return;
  }
  if (input.stage === "retouching" && run.current_step_key === "retouching") {
    await advanceWorkflow(db, {
      workflow_run_id: workflowRunId,
      from_step_key: "retouching",
      to_step_key: "final_delivery",
      reason: `보정 ${input.state === "skipped" ? "건너뜀" : "완료"}`,
    });
    return;
  }
  if (input.stage === "final_delivery" && run.current_step_key === "final_delivery") {
    await completeOpenStepTasksForManualSave(db, workflowRunId, "final_delivery");
    await advanceWorkflow(db, {
      workflow_run_id: workflowRunId,
      from_step_key: "final_delivery",
      to_step_key: "revision",
      reason: `2차 전달 ${input.state === "skipped" ? "건너뜀" : "완료"}`,
    });
  }
}

export async function syncClassificationCompletedWorkflow(
  db: SupabaseClient,
  projectId: string,
): Promise<void> {
  const { data: project, error } = await db.from("photo_storage_projects")
    .select("id,workflow_run_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  if (!project?.workflow_run_id) return;

  let run = await getWorkflowRun(db, project.workflow_run_id);
  if (run.current_step_key === "shooting") {
    await advanceShootingIfCurrent(db, project.workflow_run_id);
    run = await getWorkflowRun(db, project.workflow_run_id);
  }

  // 사진 분류 자체(이 함수를 부르는 시점엔 이미 끝난 상태)는 잔금·계산서 확인과 무관하게 계속
  // 돌아간다 — 사진 상태 머신과 워크플로 12단계는 별개다(lib/core/commands/photo.ts 상단 표 참고).
  // 여기서는 "워크플로 단계 표시"만 잔금 확인 전까지 backup_sorting으로 넘기지 않고 대기시킨다.
  if (run.current_step_key === "payment_confirm") {
    await emitOliviaEvent(db, {
      eventType: "workflow.blocked",
      eventSource: "photo_storage_watcher",
      clientId: run.client_id ?? null,
      projectId: run.project_id ?? null,
      workflowRunId: run.id,
      payload: { stepKey: "payment_confirm", waitingFor: "payment_confirm" },
      deduplicationKey: createEventDeduplicationKey("workflow.blocked", run.id, "payment_confirm"),
    });
    await db.from("workflow_runs").update({
      next_action: "잔금·계산서 확인 후 분류 단계로 진행",
      updated_at: new Date().toISOString(),
    }).eq("id", run.id);
    return;
  }

  if (run.current_step_key === "backup_sorting") {
    await completeOpenStepTasksForManualSave(db, project.workflow_run_id, "backup_sorting");
    await advanceWorkflow(db, {
      workflow_run_id: project.workflow_run_id,
      from_step_key: "backup_sorting",
      to_step_key: "client_selection",
      reason: "PHOTO_CLASSIFY_WORK 완료",
    });
  }
  const latest = await getWorkflowRun(db, project.workflow_run_id);
  if (latest.current_step_key === "client_selection") {
    await ensureStepRun(db, project.workflow_run_id, "original_delivery", "in_progress");
    await db.from("workflow_runs").update({
      next_action: buildNextAction("original_delivery"),
      updated_at: new Date().toISOString(),
    }).eq("id", project.workflow_run_id);
  }
}

// to_step_key: "raw_matching"은 레거시/내부 세부 단계 키다(ACTIVE_WORKFLOW_STEP_KEYS엔 없고
// client_selection의 하위 진행 표시로만 쓰인다 — lib/workflow.ts의 INTERNAL_STEP_GROUPS 참고).
// from_step_key가 이미 "client_selection"으로 고정 확인되어 있어 건너뜀 위험이 없다.
export async function syncSelectionSubmittedWorkflow(
  db: SupabaseClient,
  workflowRunId: string | null | undefined,
): Promise<void> {
  if (!workflowRunId) return;
  const run = await getWorkflowRun(db, workflowRunId);
  if (!["client_selection", "raw_matching"].includes(run.current_step_key)) return;
  if (run.current_step_key === "raw_matching") return;

  const advanced = await advanceWorkflow(db, {
    workflow_run_id: workflowRunId,
    from_step_key: "client_selection",
    to_step_key: "raw_matching",
    reason: "고객 셀렉 제출",
  });
  if (advanced.skipped) throw new Error(advanced.reason || "프로젝트 단계가 변경되었습니다.");
  await completeStepRun(db, workflowRunId, "original_delivery");
}

export async function syncRawMatchWorkflow(
  db: SupabaseClient,
  input: { projectId: string; jobStatus: "RUNNING" | "COMPLETED" | "FAILED" },
): Promise<void> {
  const { data: project, error } = await db.from("photo_storage_projects")
    .select("id,workflow_run_id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (error) throw error;
  if (!project) return;

  if (input.jobStatus === "RUNNING" || input.jobStatus === "COMPLETED") {
    const { error: galleryError } = await db.from("select_galleries")
      .update({
        status: input.jobStatus === "COMPLETED" ? "raw_matched" : "raw_matching",
        updated_at: new Date().toISOString(),
      })
      .eq("photo_storage_project_id", input.projectId)
      .in("status", ["selection_submitted", "raw_matching"]);
    if (galleryError) throw galleryError;
  }

  if (input.jobStatus !== "COMPLETED" || !project.workflow_run_id) return;
  await completeStepRun(db, project.workflow_run_id, "raw_matching");
  const run = await getWorkflowRun(db, project.workflow_run_id);
  // client_selection/raw_matching(레거시 하위 단계) 둘 다 ACTIVE_WORKFLOW_STEP_KEYS 상 다음이
  // retouching이라 to_step_key를 고정해도 건너뜀이 아니다 — LEGACY_NEXT_STEP과 동일한 값.
  if (run.current_step_key === "client_selection" || run.current_step_key === "raw_matching") {
    await advanceWorkflow(db, {
      workflow_run_id: project.workflow_run_id,
      from_step_key: run.current_step_key,
      to_step_key: "retouching",
      reason: "PHOTO_RAW_MATCH 완료",
    });
  }
}
