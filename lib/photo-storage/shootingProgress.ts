import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildNextAction,
  ensureStepRun,
  getWorkflowRun,
} from "@/lib/workflowAutomation";
import { writeWorkflowCheck, writeWorkflowCheckSafely } from "@/lib/workflowCheckPersistence";
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

// 기존 촬영 진행 카드의 완료/복원 동작도 같은 체크 원본을 갱신한다.
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
  const done = input.state !== "restored";
  const mapping: Partial<Record<ShootingProgressActionStage, { key: string; by: "auto" | "user" }>> = {
    client_selection: { key: "client_selected", by: "auto" },
    raw_matching: { key: "raw_approved", by: "user" },
    retouching: { key: "retouched", by: "user" },
    final_delivery: { key: "final_delivered", by: "auto" },
  };
  const check = mapping[input.stage];
  if (check) await writeWorkflowCheck(db, { workflowRunId, key: check.key, done, by: check.by });
  if (done && input.stage === "raw_matching") await completeStepRun(db, workflowRunId, "raw_matching");
  if (done && input.stage === "client_selection") await completeStepRun(db, workflowRunId, "client_selection");
  if (done && input.stage === "original_delivery") await syncOriginalDeliveryRegisteredWorkflow(db, workflowRunId);
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

  await writeWorkflowCheckSafely(db, {
    workflowRunId: project.workflow_run_id,
    key: "backup_sorted",
    done: true,
    by: "auto",
  });
}

// to_step_key: "raw_matching"은 레거시/내부 세부 단계 키다(ACTIVE_WORKFLOW_STEP_KEYS엔 없고
// client_selection의 하위 진행 표시로만 쓰인다 — lib/workflow.ts의 INTERNAL_STEP_GROUPS 참고).
// from_step_key가 이미 "client_selection"으로 고정 확인되어 있어 건너뜀 위험이 없다.
export async function syncSelectionSubmittedWorkflow(
  db: SupabaseClient,
  workflowRunId: string | null | undefined,
): Promise<void> {
  if (!workflowRunId) return;
  await writeWorkflowCheck(db, { workflowRunId, key: "client_selected", done: true, by: "auto" });
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
  // 파일 복사 성공은 결과 사실이고, 다음 단계 진입은 사용자가 실패 목록을 확인한 뒤
  // 상세 체크리스트의 `raw_approved`를 눌러 결정한다.
}
