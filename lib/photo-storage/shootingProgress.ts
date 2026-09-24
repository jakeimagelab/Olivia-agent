import type { SupabaseClient } from "@supabase/supabase-js";
import {
  advanceWorkflow,
  buildNextAction,
  completeOpenStepTasksForManualSave,
  ensureStepRun,
  getWorkflowRun,
} from "@/lib/workflowAutomation";
import { validatePhotoProjectRelativePath } from "./server";

export type ShootingProgressStage =
  | "backup_sorting"
  | "original_delivery"
  | "client_selection"
  | "raw_matching"
  | "retouching";

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

  if (
    rawStatus === "COMPLETED"
    || facts.rawMatchingStepStatus === "completed"
    || ["raw_matched", "retouching", "completed"].includes(galleryStatus)
    || ["retouching", "revision", "final_delivery", "reward"].includes(workflowStep)
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

async function advanceShootingIfCurrent(db: SupabaseClient, workflowRunId: string): Promise<void> {
  const run = await getWorkflowRun(db, workflowRunId);
  if (run.current_step_key !== "shooting") return;
  await advanceWorkflow(db, {
    workflow_run_id: workflowRunId,
    from_step_key: "shooting",
    to_step_key: "backup_sorting",
    reason: "NAS 촬영 폴더와 캘린더 촬영 일정 자동 연결",
  });
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

export async function syncSelectionSubmittedWorkflow(
  db: SupabaseClient,
  workflowRunId: string | null | undefined,
): Promise<void> {
  if (!workflowRunId) return;
  const run = await getWorkflowRun(db, workflowRunId);
  if (!["client_selection", "raw_matching"].includes(run.current_step_key)) return;

  await completeStepRun(db, workflowRunId, "original_delivery");
  await completeStepRun(db, workflowRunId, "client_selection");
  await ensureStepRun(db, workflowRunId, "raw_matching", "in_progress");
  await db.from("workflow_runs").update({
    current_step_key: "client_selection",
    next_action: buildNextAction("raw_matching"),
    updated_at: new Date().toISOString(),
  }).eq("id", workflowRunId);
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
  if (run.current_step_key === "client_selection" || run.current_step_key === "raw_matching") {
    await advanceWorkflow(db, {
      workflow_run_id: project.workflow_run_id,
      from_step_key: run.current_step_key,
      to_step_key: "retouching",
      reason: "PHOTO_RAW_MATCH 완료",
    });
  }
}
