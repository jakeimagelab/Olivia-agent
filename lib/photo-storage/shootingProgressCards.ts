import type { SupabaseClient } from "@supabase/supabase-js";
import { isPhotoProjectActionable } from "./notificationPolicy";
import {
  buildFolderDateCandidates,
  photoFolderSubject,
  resolveShootingProgressStage,
  type ShootingProgressCard,
  type ShootingProgressStage,
  type ShootingProgressTone,
} from "./shootingProgress";
import type { PhotoStorageProject } from "./types";

type WorkflowRow = {
  id: string;
  client_id?: string | null;
  client_name?: string | null;
  project_name?: string | null;
  shoot_date?: string | null;
  current_step_key?: string | null;
  status?: string | null;
  updated_at?: string | null;
};

type StepRunRow = {
  workflow_run_id: string;
  step_key: string;
  status: string;
  updated_at?: string | null;
};

type GalleryRow = {
  id: string;
  client_id?: string | null;
  photo_storage_project_id?: string | null;
  workflow_run_id?: string | null;
  hospital_name?: string | null;
  shooting_date?: string | null;
  status?: string | null;
  selected_count?: number | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  nas_link?: string | null;
  share_token?: string | null;
};

type ProgressEventRow = {
  project_id: string;
  event_type: string;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
};

type RemoteJobRow = {
  id: string;
  status?: string | null;
  payload?: Record<string, unknown> | null;
  progress?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const STEP_PROGRESS: Record<Exclude<ShootingProgressStage, "completed">, number> = {
  backup_sorting: 22,
  original_delivery: 40,
  client_selection: 55,
  raw_matching: 68,
  retouching: 80,
  final_delivery: 90,
  revision: 96,
};

const ACTION_STAGE_ORDER = [
  "original_delivery",
  "client_selection",
  "raw_matching",
  "retouching",
  "final_delivery",
] as const;

type ActionStage = (typeof ACTION_STAGE_ORDER)[number];
type ManualState = "completed" | "skipped" | "restored";

function isActionStage(value: unknown): value is ActionStage {
  return typeof value === "string" && (ACTION_STAGE_ORDER as readonly string[]).includes(value);
}

function manualStatesForProject(events: ProgressEventRow[], projectId: string) {
  const states: Partial<Record<ActionStage, ManualState>> = {};
  const matching = events
    .filter((event) => event.project_id === projectId && event.event_type === "PHOTO_WORKFLOW_STEP_CHANGED")
    .sort((left, right) => timestamp(left.created_at) - timestamp(right.created_at));
  for (const event of matching) {
    const stage = event.payload?.stage;
    const state = event.payload?.state;
    if (!isActionStage(stage) || !["completed", "skipped", "restored"].includes(String(state))) continue;
    states[stage] = state as ManualState;
  }
  return states;
}

export function applyManualProgressStates(
  stage: ShootingProgressStage,
  states: Partial<Record<ActionStage, ManualState>>,
): ShootingProgressStage {
  if (stage === "completed" || stage === "backup_sorting") return stage;
  if (stage === "revision") {
    return states.final_delivery === "completed" ? "completed" : stage;
  }
  let index = ACTION_STAGE_ORDER.indexOf(stage);
  while (index >= 0) {
    const current = ACTION_STAGE_ORDER[index];
    const state = states[current];
    if (state !== "completed" && state !== "skipped") return current;
    if (current === "final_delivery") return state === "completed" ? "completed" : "revision";
    index += 1;
  }
  return stage;
}

function timestamp(value: string | null | undefined): number {
  const parsed = new Date(value ?? "").getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestBy<T>(rows: T[], key: (row: T) => string | null | undefined, updatedAt: (row: T) => string | null | undefined) {
  const result = new Map<string, T>();
  for (const row of rows) {
    const rowKey = key(row);
    if (!rowKey) continue;
    const current = result.get(rowKey);
    if (!current || timestamp(updatedAt(row)) > timestamp(updatedAt(current))) result.set(rowKey, row);
  }
  return result;
}

function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function projectProgress(project: PhotoStorageProject): number {
  const progress = project.status === "MERGING"
    ? project.merge_progress
    : project.status.startsWith("CLASSIFY")
      ? project.classification_progress
      : project.copy_progress;
  const current = typeof progress?.current === "number" ? progress.current : 0;
  const total = typeof progress?.total === "number" ? progress.total : project.jpg_count;
  return total > 0 ? clampPercent((current / total) * 100) : 0;
}

function projectStatusSummary(project: PhotoStorageProject): { summary: string; tone: ShootingProgressTone; actionRequired: boolean } {
  if (["MERGE_FAILED", "COPY_FAILED", "CLASSIFY_FAILED", "REVIEW_REQUIRED", "ERROR"].includes(project.status)) {
    return { summary: "사진 작업 결과를 확인해야 합니다.", tone: "attention", actionRequired: true };
  }
  if (project.status === "READY") {
    return { summary: "원본 분리 승인이 필요합니다.", tone: "attention", actionRequired: true };
  }
  if (project.status === "DEFERRED") {
    return { summary: "원본 분리가 보류되어 있습니다.", tone: "waiting", actionRequired: false };
  }
  if (project.status === "MERGE_COMPLETED") {
    return { summary: "원본 분리가 끝났습니다. 씬 분류 여부를 확인해주세요.", tone: "attention", actionRequired: true };
  }
  if (project.status === "MERGE_APPROVED") return { summary: "원본 분리 작업을 기다리고 있습니다.", tone: "progress", actionRequired: false };
  if (project.status === "MERGING") return { summary: `JPG 원본을 분리하고 있습니다. ${projectProgress(project)}%`, tone: "progress", actionRequired: false };
  if (["CLASSIFY_APPROVED", "COPY_QUEUED"].includes(project.status)) return { summary: "작업 SSD 복사를 준비하고 있습니다.", tone: "progress", actionRequired: false };
  if (["COPYING", "COPY_VERIFYING", "COPY_COMPLETED"].includes(project.status)) return { summary: `작업 SSD로 복사하고 있습니다. ${projectProgress(project)}%`, tone: "progress", actionRequired: false };
  return { summary: `씬 분류를 진행하고 있습니다. ${projectProgress(project)}%`, tone: "progress", actionRequired: false };
}

function daysSince(value: string | null | undefined, nowMs: number): number {
  const startedAt = timestamp(value);
  if (!startedAt) return 1;
  return Math.max(1, Math.floor((nowMs - startedAt) / 86_400_000) + 1);
}

function stagePresentation(input: {
  stage: Exclude<ShootingProgressStage, "completed">;
  project: PhotoStorageProject;
  gallery?: GalleryRow;
  rawJob?: RemoteJobRow;
  nowMs: number;
}): { stageLabel: string; summary: string; tone: ShootingProgressTone; actionRequired: boolean } {
  const { stage, project, gallery, rawJob, nowMs } = input;
  if (stage === "backup_sorting") return { stageLabel: "백업·분류", ...projectStatusSummary(project) };
  if (stage === "original_delivery") {
    const warning = typeof project.classification_progress?.warning === "string"
      ? project.classification_progress.warning
      : null;
    return {
      stageLabel: "1차 전달",
      summary: warning ?? "씬 분류가 끝났습니다. 유그린 링크를 등록하면 1차 전달로 넘어갑니다.",
      tone: "attention",
      actionRequired: true,
    };
  }
  if (stage === "client_selection") {
    const selected = Math.max(0, Number(gallery?.selected_count ?? 0));
    return {
      stageLabel: "고객 셀렉",
      summary: `고객이 셀렉하는 중입니다. ${daysSince(gallery?.updated_at, nowMs)}일째${selected > 0 ? ` · 현재 ${selected.toLocaleString("ko-KR")}장` : ""}`,
      tone: "waiting",
      actionRequired: false,
    };
  }
  if (stage === "raw_matching") {
    const rawStatus = String(rawJob?.status ?? "").toUpperCase();
    if (rawStatus === "RUNNING" || rawStatus === "QUEUED") return {
      stageLabel: "RAW 매칭",
      summary: "선택 사진의 RAW 원본을 자동으로 매칭하고 있습니다.",
      tone: "progress",
      actionRequired: false,
    };
    if (rawStatus === "FAILED") return {
      stageLabel: "RAW 매칭",
      summary: "RAW 매칭 결과를 확인한 뒤 다시 시도해주세요.",
      tone: "attention",
      actionRequired: true,
    };
    return {
      stageLabel: "RAW 매칭",
      summary: "고객 셀렉이 제출되었습니다. RAW 자동 매칭을 시작할 차례입니다.",
      tone: "attention",
      actionRequired: true,
    };
  }
  if (stage === "retouching") return {
    stageLabel: "보정",
    summary: "RAW 매칭이 끝났습니다. 보정 작업을 진행할 차례입니다.",
    tone: "attention",
    actionRequired: true,
  };
  if (stage === "final_delivery") return {
    stageLabel: "2차 전달",
    summary: "보정본 전달을 완료한 뒤 2차 전달 완료를 기록해주세요.",
    tone: "attention",
    actionRequired: true,
  };
  return {
    stageLabel: "수정 확인",
    summary: "전달한 보정본의 수정 요청을 확인하고 있습니다.",
    tone: "waiting",
    actionRequired: false,
  };
}

function inferredShootDate(project: PhotoStorageProject): string | null {
  return buildFolderDateCandidates(project.project_name, new Date(project.discovered_at))[0] ?? null;
}

function isMissingLinkColumn(error: unknown, columns = ["photo_storage_project_id"]): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const message = `${String(record.message ?? "")} ${String(record.details ?? "")}`;
  return (record.code === "42703" || record.code === "PGRST204") && columns.some((column) => message.includes(column));
}

export function buildShootingProgressCards(input: {
  projects: PhotoStorageProject[];
  workflows?: WorkflowRow[];
  stepRuns?: StepRunRow[];
  galleries?: GalleryRow[];
  rawJobs?: RemoteJobRow[];
  events?: ProgressEventRow[];
  nowMs?: number;
}): ShootingProgressCard[] {
  const {
    projects,
    workflows = [],
    stepRuns = [],
    galleries = [],
    rawJobs = [],
    events = [],
    nowMs = Date.now(),
  } = input;
  const workflowById = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const stepByWorkflowAndKey = new Map(stepRuns.map((step) => [`${step.workflow_run_id}:${step.step_key}`, step]));
  const galleryByProject = latestBy(galleries, (gallery) => gallery.photo_storage_project_id, (gallery) => gallery.updated_at);
  const galleryByWorkflow = latestBy(galleries, (gallery) => gallery.workflow_run_id, (gallery) => gallery.updated_at);
  const rawJobByProject = latestBy(rawJobs, (job) => typeof job.payload?.project_id === "string" ? job.payload.project_id : null, (job) => job.updated_at ?? job.created_at);

  return projects.flatMap((project): ShootingProgressCard[] => {
    const workflow = project.workflow_run_id ? workflowById.get(project.workflow_run_id) : undefined;
    const gallery = galleryByProject.get(project.id) ?? (project.workflow_run_id ? galleryByWorkflow.get(project.workflow_run_id) : undefined);
    const rawJob = rawJobByProject.get(project.id);
    const canonicalStage = resolveShootingProgressStage({
      projectStatus: project.status,
      galleryStatus: gallery?.status,
      galleryNasLink: gallery?.nas_link,
      rawJobStatus: rawJob?.status,
      workflowCurrentStep: workflow?.current_step_key,
      workflowStatus: workflow?.status,
      originalDeliveryStepStatus: project.workflow_run_id ? stepByWorkflowAndKey.get(`${project.workflow_run_id}:original_delivery`)?.status : null,
      rawMatchingStepStatus: project.workflow_run_id ? stepByWorkflowAndKey.get(`${project.workflow_run_id}:raw_matching`)?.status : null,
    });
    const manualStates = manualStatesForProject(events, project.id);
    const stage = applyManualProgressStates(canonicalStage, manualStates);
    if (stage === "completed") return [];
    const presentation = stagePresentation({ stage, project, gallery, rawJob, nowMs });
    const shootDate = workflow?.shoot_date ?? gallery?.shooting_date ?? inferredShootDate(project);
    const clientName = workflow?.client_name?.trim() || gallery?.hospital_name?.trim() || photoFolderSubject(project.project_name) || project.project_name;
    const pipelinePercent = stage === "backup_sorting" ? projectProgress(project) : 0;
    const progressPercent = stage === "backup_sorting"
      ? clampPercent(8 + pipelinePercent * .22)
      : STEP_PROGRESS[stage];
    const detail = [
      shootDate ? `${Number(shootDate.slice(5, 7))}월 ${Number(shootDate.slice(8, 10))}일 촬영` : "촬영일 미연결",
      `JPG ${project.jpg_count.toLocaleString("ko-KR")}장`,
      project.workflow_run_id ? "고객 연결됨" : "고객 미연결",
    ].join(" · ");
    return [{
      projectId: project.id,
      projectName: project.project_name,
      sourceRelativePath: project.source_relative_path,
      clientName,
      clientId: workflow?.client_id ?? gallery?.client_id ?? null,
      workflowRunId: project.workflow_run_id ?? null,
      calendarTaskId: project.calendar_task_id ?? null,
      shootDate,
      jpgCount: project.jpg_count,
      stage,
      stageLabel: presentation.stageLabel,
      tone: presentation.tone,
      actionRequired: presentation.actionRequired || (stage === "backup_sorting" && isPhotoProjectActionable(project)),
      summary: presentation.summary,
      detail,
      progressPercent,
      updatedAt: workflow?.updated_at ?? gallery?.updated_at ?? project.updated_at,
      galleryId: gallery?.id ?? null,
      nasLink: gallery?.nas_link ?? null,
      selectionUrl: gallery?.share_token ? `/select/${gallery.share_token}` : null,
      manualStates,
    }];
  }).sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || timestamp(right.updatedAt) - timestamp(left.updatedAt));
}

export async function loadShootingProgressCards(
  db: SupabaseClient,
  projects: PhotoStorageProject[],
  events: ProgressEventRow[] = [],
): Promise<ShootingProgressCard[]> {
  if (!projects.length) return [];
  const projectIds = projects.map((project) => project.id);
  const workflowIds = [...new Set(projects.map((project) => project.workflow_run_id).filter((id): id is string => Boolean(id)))];

  const workflowsPromise = workflowIds.length
    ? db.from("workflow_runs").select("id,client_id,client_name,project_name,shoot_date,current_step_key,status,updated_at").in("id", workflowIds)
    : Promise.resolve({ data: [], error: null });
  const stepRunsPromise = workflowIds.length
    ? db.from("workflow_step_runs").select("workflow_run_id,step_key,status,updated_at").in("workflow_run_id", workflowIds).in("step_key", ["original_delivery", "raw_matching"])
    : Promise.resolve({ data: [], error: null });
  const galleriesPromise = db.from("select_galleries")
    .select("id,client_id,photo_storage_project_id,workflow_run_id,hospital_name,shooting_date,status,selected_count,submitted_at,updated_at,nas_link,share_token")
    .in("photo_storage_project_id", projectIds)
    .order("updated_at", { ascending: false });
  const rawJobsPromise = db.from("remote_jobs")
    .select("id,status,payload,progress,created_at,updated_at")
    .eq("action", "PHOTO_RAW_MATCH")
    .in("payload->>project_id", projectIds)
    .order("created_at", { ascending: false })
    .limit(Math.max(100, projectIds.length * 3));

  const [workflowResult, stepRunResult, initialGalleryResult, rawJobResult] = await Promise.all([
    workflowsPromise,
    stepRunsPromise,
    galleriesPromise,
    rawJobsPromise,
  ]);
  let galleryResult = initialGalleryResult;
  if (galleryResult.error && isMissingLinkColumn(galleryResult.error, ["nas_link"])) {
    const fallbackGalleryResult = await db.from("select_galleries")
      .select("id,client_id,photo_storage_project_id,workflow_run_id,hospital_name,shooting_date,status,selected_count,submitted_at,updated_at,share_token")
      .in("photo_storage_project_id", projectIds)
      .order("updated_at", { ascending: false });
    galleryResult = {
      ...fallbackGalleryResult,
      data: fallbackGalleryResult.data?.map((gallery) => ({ ...gallery, nas_link: null })) ?? null,
    } as typeof galleryResult;
  }
  if (workflowResult.error) throw workflowResult.error;
  if (stepRunResult.error) throw stepRunResult.error;
  if (galleryResult.error && !isMissingLinkColumn(galleryResult.error)) throw galleryResult.error;
  if (rawJobResult.error) throw rawJobResult.error;

  const workflows = (workflowResult.data ?? []) as WorkflowRow[];
  const stepRuns = (stepRunResult.data ?? []) as StepRunRow[];
  const galleries = galleryResult.error ? [] : (galleryResult.data ?? []) as GalleryRow[];
  const rawJobs = (rawJobResult.data ?? []) as RemoteJobRow[];
  return buildShootingProgressCards({ projects, workflows, stepRuns, galleries, rawJobs, events });
}
