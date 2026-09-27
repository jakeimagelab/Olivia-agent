import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_PHOTO_PROJECT_STATUSES } from "@/lib/photo-storage/notificationPolicy";
import { getWorkflowDisplayStepKey, STEP_NAME } from "@/lib/workflow";
import { findWorkflowConsistencyIssues } from "@/lib/workflowAutomation";
import { isWorkflowWaitingCustomer } from "@/lib/workflowWaiting";
import type { StatusPanelData, StatusPanelEntry, StatusPanelRecentEntry } from "./panelTypes";
import type { SystemStatusReport } from "./types";

const RECENT_LIMIT = 5;
const ACTIVE_PHOTO_STATUSES = Array.from(ACTIVE_PHOTO_PROJECT_STATUSES) as string[];
const PHOTO_FAILURE_STATUSES = new Set(["REVIEW_REQUIRED", "ERROR", "MERGE_FAILED", "COPY_FAILED", "CLASSIFY_FAILED"]);

type WorkflowRunRow = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  project_name: string | null;
  current_step_key: string | null;
  status: string | null;
  updated_at: string | null;
};
type PhotoProjectRow = {
  id: string;
  project_name: string | null;
  source_relative_path: string | null;
  status: string;
  workflow_run_id: string | null;
  updated_at: string | null;
};
type ApprovalRow = {
  id: string;
  title: string | null;
  description: string | null;
  client_id: string | null;
  workflow_run_id: string | null;
  created_at: string | null;
};
type TaskRow = {
  id: string;
  title: string | null;
  error_message: string | null;
  client_id: string | null;
  workflow_run_id: string | null;
  updated_at: string | null;
};
type EventRow = {
  id: string;
  client_id: string | null;
  workflow_run_id: string | null;
  payload: Record<string, unknown> | null;
  occurred_at: string | null;
};
type BackupRow = { id: string; folder_name: string | null; status: string | null; created_at: string | null };
type RemoteJobRow = {
  id: string;
  action: string | null;
  status: string | null;
  payload: Record<string, unknown> | null;
  progress: Record<string, unknown> | null;
  message: string | null;
  error: string | null;
  created_at: string | null;
  completed_at: string | null;
};
type QueryResult<T> = { data: T[] | null; error: { message?: string } | null };

const JOB_ACTION_LABEL: Record<string, string> = {
  PHOTO_SORT: "사진 분류",
  LIST_FOLDER: "폴더 조회",
  PHOTO_PREPARE_SOURCE: "JPG 통합",
  PHOTO_STAGE_JPG: "JPG 복사",
  PHOTO_CLASSIFY_WORK: "씬별 분류",
  COPY_TEST: "복사 테스트",
  PHOTO_RAW_MATCH: "RAW 매칭",
  PHOTO_RESIZE: "사진 리사이즈",
  PHOTO_AI_SELECT: "AI 컷 정리",
  PHOTO_RETOUCH: "사진 보정 분석",
};
const JOB_STATUS_LABEL: Record<string, string> = {
  QUEUED: "대기",
  RUNNING: "진행 중",
  COMPLETED: "완료",
  FAILED: "실패",
};
const PHOTO_STATUS_LABEL: Record<string, string> = {
  MERGE_APPROVED: "JPG 통합 대기",
  MERGING: "JPG 통합 중",
  CLASSIFY_APPROVED: "분류 준비 중",
  COPY_QUEUED: "JPG 복사 대기",
  COPYING: "JPG 복사 중",
  COPY_VERIFYING: "JPG 복사 검증 중",
  CLASSIFY_QUEUED: "씬별 분류 대기",
  CLASSIFYING: "씬별 분류 중",
  CLASSIFY_VERIFYING: "씬별 분류 검증 중",
};

function projectHref(run: WorkflowRunRow | undefined, fallbackClientId?: string | null) {
  const clientId = run?.client_id ?? fallbackClientId ?? null;
  if (clientId) return `/clients?clientId=${encodeURIComponent(clientId)}`;
  if (run?.id) return `/clients?workflowRunId=${encodeURIComponent(run.id)}`;
  return "/clients";
}

function projectTitle(run: WorkflowRunRow | undefined) {
  return run?.project_name?.trim() || run?.client_name?.trim() || "이름 없는 프로젝트";
}

function percentFromProgress(progress: Record<string, unknown> | null | undefined) {
  if (!progress) return null;
  const current = typeof progress.current === "number" ? progress.current : null;
  const total = typeof progress.total === "number" ? progress.total : null;
  if (current === null || total === null || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

function fulfilledRows<T>(result: PromiseSettledResult<QueryResult<T>>): T[] {
  if (result.status !== "fulfilled" || result.value.error) return [];
  return result.value.data ?? [];
}

function queryFailure(
  result: PromiseSettledResult<{ error?: { message?: string } | null }>,
  id: string,
  label: string,
): StatusPanelEntry | null {
  if (result.status === "fulfilled" && !result.value.error) return null;
  const detail = result.status === "rejected"
    ? result.reason instanceof Error ? result.reason.message : String(result.reason)
    : result.value.error?.message || "조회 실패";
  console.warn(`[status-panel] ${label} 조회 실패`, detail);
  return { id: `query:${id}`, kind: "query_error", level: "unknown", title: `${label} · 확인 불가`, detail };
}

export function buildStatusPanelCollections(input: {
  diagnostics: SystemStatusReport;
  photoProjects?: PhotoProjectRow[];
  workflowRuns?: WorkflowRunRow[];
  approvals?: ApprovalRow[];
  failedTasks?: TaskRow[];
  blockedEvents?: EventRow[];
  backups?: BackupRow[];
  remoteJobs?: RemoteJobRow[];
  fallbackCount24h?: number | null;
  coreBypassIssues?: Array<{
    workflowRunId: string;
    clientId: string | null;
    clientName: string;
    currentStepName: string;
    updatedAt: string;
  }>;
  queryIssues?: StatusPanelEntry[];
}): StatusPanelData {
  const photoProjects = input.photoProjects ?? [];
  const workflowRuns = input.workflowRuns ?? [];
  const approvals = input.approvals ?? [];
  const failedTasks = input.failedTasks ?? [];
  const blockedEvents = input.blockedEvents ?? [];
  const backups = input.backups ?? [];
  const remoteJobs = input.remoteJobs ?? [];
  const runById = new Map(workflowRuns.map((run) => [run.id, run]));
  const pendingApprovalCount = new Map<string, number>();
  for (const approval of approvals) {
    if (!approval.workflow_run_id) continue;
    pendingApprovalCount.set(approval.workflow_run_id, (pendingApprovalCount.get(approval.workflow_run_id) ?? 0) + 1);
  }

  const panelIssues: StatusPanelEntry[] = [...(input.queryIssues ?? [])];
  if ((input.fallbackCount24h ?? 0) > 0) {
    panelIssues.push({
      id: "hermes-fallbacks",
      kind: "hermes_fallback",
      level: "warning",
      title: `최근 24시간 헤르메스 폴백 ${input.fallbackCount24h}회`,
      detail: "대체 처리 경로가 사용된 대화가 있습니다. 채팅의 폴백 배지에서 사유를 확인하세요.",
    });
  }
  for (const issue of input.coreBypassIssues ?? []) {
    panelIssues.push({
      id: `core-bypass:${issue.workflowRunId}`,
      kind: "core_bypass",
      level: "warning",
      title: `Core 우회 의심 · ${issue.clientName || "이름 없는 고객"}`,
      detail: `${issue.currentStepName} · 워크플로 상태를 확인하세요.`,
      href: projectHref(runById.get(issue.workflowRunId), issue.clientId),
      clientId: issue.clientId,
      workflowRunId: issue.workflowRunId,
      createdAt: issue.updatedAt,
    });
  }
  for (const project of photoProjects) {
    if (!PHOTO_FAILURE_STATUSES.has(project.status)) continue;
    const run = project.workflow_run_id ? runById.get(project.workflow_run_id) : undefined;
    panelIssues.push({
      id: `photo-failure:${project.id}`,
      kind: "photo_failure",
      level: project.status === "REVIEW_REQUIRED" ? "warning" : "error",
      title: `사진 작업 확인 필요 · ${project.project_name || "이름 없는 폴더"}`,
      detail: project.status,
      href: "/photo-sorting",
      clientId: run?.client_id ?? null,
      workflowRunId: project.workflow_run_id,
      projectId: project.id,
      createdAt: project.updated_at,
    });
  }

  const myTurn: StatusPanelEntry[] = [];
  const representedRuns = new Set<string>();
  for (const project of photoProjects) {
    if (!["READY", "DEFERRED", "MERGE_COMPLETED"].includes(project.status)) continue;
    if (project.workflow_run_id) representedRuns.add(project.workflow_run_id);
    const firstApproval = project.status === "READY" || project.status === "DEFERRED";
    myTurn.push({
      id: `photo-action:${project.id}`,
      kind: firstApproval ? "photo_first_approval" : "photo_second_approval",
      level: "info",
      title: `${firstApproval ? "1차 승인 대기" : "2차 승인 대기"} · ${project.project_name || "이름 없는 폴더"}`,
      detail: firstApproval ? "원본 분리 작업을 확인해주세요." : "씬별 분류 진행 여부를 확인해주세요.",
      href: "/photo-sorting",
      workflowRunId: project.workflow_run_id,
      projectId: project.id,
      createdAt: project.updated_at,
    });
  }

  const blockedByRun = new Set<string>();
  for (const event of blockedEvents) {
    if (!event.workflow_run_id || blockedByRun.has(event.workflow_run_id)) continue;
    const run = runById.get(event.workflow_run_id);
    if (!run || run.status !== "active" || run.current_step_key !== "payment_confirm") continue;
    blockedByRun.add(event.workflow_run_id);
    representedRuns.add(event.workflow_run_id);
    myTurn.push({
      id: `workflow-blocked:${event.workflow_run_id}`,
      kind: "workflow_blocked",
      level: "info",
      title: `잔금·계산서 확인 대기 · ${projectTitle(run)}`,
      detail: "잔금과 계산서 확인 후 사진 분류 단계로 진행할 수 있습니다.",
      href: projectHref(run, event.client_id),
      clientId: run.client_id ?? event.client_id,
      workflowRunId: run.id,
      createdAt: event.occurred_at,
    });
  }

  for (const approval of approvals) {
    const run = approval.workflow_run_id ? runById.get(approval.workflow_run_id) : undefined;
    if (approval.workflow_run_id) representedRuns.add(approval.workflow_run_id);
    myTurn.push({
      id: `approval:${approval.id}`,
      kind: "approval",
      level: "info",
      title: `승인 대기 · ${approval.title || projectTitle(run)}`,
      detail: approval.description || (run ? projectTitle(run) : "승인 내용을 확인해주세요."),
      href: approval.workflow_run_id ? projectHref(run, approval.client_id) : "/workflow/approvals",
      clientId: run?.client_id ?? approval.client_id,
      workflowRunId: approval.workflow_run_id,
      createdAt: approval.created_at,
    });
  }

  for (const task of failedTasks) {
    const run = task.workflow_run_id ? runById.get(task.workflow_run_id) : undefined;
    myTurn.push({
      id: `failed-task:${task.id}`,
      kind: "failed_task",
      level: "warning",
      title: `실패한 작업 · ${task.title || projectTitle(run)}`,
      detail: task.error_message || "실패 원인을 확인해주세요.",
      href: task.workflow_run_id ? projectHref(run, task.client_id) : "/workflow/tasks",
      clientId: run?.client_id ?? task.client_id,
      workflowRunId: task.workflow_run_id,
      createdAt: task.updated_at,
    });
  }

  for (const run of workflowRuns) {
    const displayStepKey = getWorkflowDisplayStepKey(run.current_step_key ?? "") ?? run.current_step_key;
    const waitingCustomer = isWorkflowWaitingCustomer({
      status: run.status,
      displayStepKey,
      waitingApprovalCount: pendingApprovalCount.get(run.id) ?? 0,
    });
    if (!waitingCustomer || representedRuns.has(run.id)) continue;
    myTurn.push({
      id: `waiting-customer:${run.id}`,
      kind: "waiting_customer",
      level: "info",
      title: `고객 대기 중 · ${projectTitle(run)}`,
      detail: `${STEP_NAME[displayStepKey ?? ""] || displayStepKey || "현재 단계"} 확인이 필요합니다.`,
      href: projectHref(run),
      clientId: run.client_id,
      workflowRunId: run.id,
      createdAt: run.updated_at,
    });
  }

  const progress: StatusPanelEntry[] = [];
  for (const project of photoProjects) {
    if (!ACTIVE_PHOTO_STATUSES.includes(project.status)) continue;
    progress.push({
      id: `photo-progress:${project.id}`,
      kind: "photo_progress",
      level: "info",
      title: `${PHOTO_STATUS_LABEL[project.status] || project.status} · ${project.project_name || "이름 없는 폴더"}`,
      detail: project.source_relative_path || "사진작업실에서 진행 상황을 확인하세요.",
      href: "/photo-sorting",
      workflowRunId: project.workflow_run_id,
      projectId: project.id,
      createdAt: project.updated_at,
    });
  }
  const activeProjectIds = new Set(progress.map((entry) => entry.projectId).filter(Boolean));
  for (const job of remoteJobs) {
    if (!["QUEUED", "RUNNING"].includes(job.status ?? "")) continue;
    const projectId = typeof job.payload?.project_id === "string" ? job.payload.project_id : null;
    if (projectId && activeProjectIds.has(projectId)) continue;
    const progressPercent = percentFromProgress(job.progress);
    progress.push({
      id: `remote-job:${job.id}`,
      kind: "remote_job_progress",
      level: "info",
      title: `${JOB_ACTION_LABEL[job.action ?? ""] || job.action || "원격 작업"} · ${JOB_STATUS_LABEL[job.status ?? ""] || job.status || "진행 중"}`,
      detail: job.message || (typeof job.progress?.message === "string" ? job.progress.message : "Mac Studio에서 처리 중입니다."),
      href: "/photo-sorting",
      projectId,
      createdAt: job.created_at,
      progressPercent,
    });
  }

  const recentActivity: StatusPanelRecentEntry[] = [];
  for (const backup of backups.slice(0, RECENT_LIMIT)) {
    recentActivity.push({
      id: `backup:${backup.id}`,
      kind: "backup",
      title: backup.folder_name || "이름 없는 백업 폴더",
      detail: `백업 감지 · ${backup.status || "상태 확인 중"}`,
      level: "info",
      href: "/photo-sorting",
      createdAt: backup.created_at || input.diagnostics.checkedAt,
    });
  }
  for (const job of remoteJobs.filter((row) => ["COMPLETED", "FAILED"].includes(row.status ?? "")).slice(0, RECENT_LIMIT)) {
    recentActivity.push({
      id: `recent-job:${job.id}`,
      kind: "remote_job",
      title: JOB_ACTION_LABEL[job.action ?? ""] || job.action || "원격 작업",
      detail: `${JOB_STATUS_LABEL[job.status ?? ""] || job.status}${job.status === "FAILED" && job.error ? ` · ${job.error}` : ""}`,
      level: job.status === "FAILED" ? "error" : "info",
      href: "/photo-sorting",
      createdAt: job.completed_at || job.created_at || input.diagnostics.checkedAt,
    });
  }
  recentActivity.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  return {
    ok: true,
    checkedAt: input.diagnostics.checkedAt,
    diagnostics: input.diagnostics,
    panelIssues,
    myTurn,
    progress,
    recentActivity: recentActivity.slice(0, RECENT_LIMIT * 2),
  };
}

export async function collectStatusPanelData(options: {
  db: SupabaseClient;
  diagnostics: SystemStatusReport;
  now?: Date;
}): Promise<StatusPanelData> {
  const { db, diagnostics } = options;
  const since24h = new Date((options.now ?? new Date()).getTime() - 24 * 60 * 60 * 1_000).toISOString();
  const results = await Promise.allSettled([
    // 오래된 운영 DB에는 workflow_run_id가 아직 없을 수 있다. 명시 select로 optional 컬럼을
    // 요구하면 사진 상태 전체가 사라지므로 기존 photo-storage/projects API처럼 행 전체를 읽고,
    // 연결 컬럼이 실제로 있을 때만 아래 조립 단계에서 사용한다.
    db.from("photo_storage_projects").select("*")
      .in("status", ["READY", "DEFERRED", "MERGE_COMPLETED", "REVIEW_REQUIRED", "ERROR", "MERGE_FAILED", "COPY_FAILED", "CLASSIFY_FAILED", ...ACTIVE_PHOTO_STATUSES])
      .order("updated_at", { ascending: false }).limit(30),
    db.from("workflow_runs").select("id,client_id,client_name,project_name,current_step_key,status,updated_at")
      .eq("status", "active").order("updated_at", { ascending: false }).limit(100),
    db.from("agent_approvals").select("id,title,description,client_id,workflow_run_id,created_at")
      .eq("status", "pending").order("created_at", { ascending: true }).limit(30),
    db.from("agent_tasks").select("id,title,error_message,client_id,workflow_run_id,updated_at")
      .eq("status", "failed").order("updated_at", { ascending: false }).limit(20),
    db.from("olivia_events").select("id,client_id,workflow_run_id,payload,occurred_at")
      .eq("event_type", "workflow.blocked").order("occurred_at", { ascending: false }).limit(30),
    db.from("worker_events").select("id,folder_name,status,created_at")
      .order("created_at", { ascending: false }).limit(RECENT_LIMIT),
    db.from("remote_jobs").select("id,action,status,payload,progress,message,error,created_at,completed_at")
      .neq("action", "PING").order("created_at", { ascending: false }).limit(20),
    db.from("olivia_chat_messages").select("id", { count: "exact", head: true })
      .eq("role", "assistant").not("metadata->>fallbackReason", "is", null).gte("created_at", since24h),
    findWorkflowConsistencyIssues(db),
  ]);

  const [photoResult, runsResult, approvalsResult, tasksResult, eventsResult, backupsResult, jobsResult, fallbackResult, consistencyResult] = results;
  const queryIssues = [
    queryFailure(photoResult, "photo-projects", "사진 프로젝트"),
    queryFailure(runsResult, "workflow-runs", "워크플로"),
    queryFailure(approvalsResult, "approvals", "승인 대기"),
    queryFailure(tasksResult, "failed-tasks", "실패 작업"),
    queryFailure(eventsResult, "blocked-events", "잔금 대기"),
    queryFailure(backupsResult, "backups", "최근 백업"),
    queryFailure(jobsResult, "remote-jobs", "원격 작업"),
    queryFailure(fallbackResult, "fallbacks", "헤르메스 폴백"),
    consistencyResult.status === "rejected" ? {
      id: "query:workflow-consistency", kind: "query_error", level: "unknown" as const,
      title: "워크플로 정합성 · 확인 불가",
      detail: consistencyResult.reason instanceof Error ? consistencyResult.reason.message : String(consistencyResult.reason),
    } : null,
  ].filter((entry): entry is StatusPanelEntry => Boolean(entry));

  const fallbackCount24h = fallbackResult.status === "fulfilled" && !fallbackResult.value.error
    ? fallbackResult.value.count ?? 0
    : null;
  const coreBypassIssues = consistencyResult.status === "fulfilled"
    ? consistencyResult.value.filter((issue) => issue.kind === "core_bypass_suspected").slice(0, RECENT_LIMIT)
    : [];

  return buildStatusPanelCollections({
    diagnostics,
    photoProjects: fulfilledRows(photoResult) as PhotoProjectRow[],
    workflowRuns: fulfilledRows(runsResult) as WorkflowRunRow[],
    approvals: fulfilledRows(approvalsResult) as ApprovalRow[],
    failedTasks: fulfilledRows(tasksResult) as TaskRow[],
    blockedEvents: fulfilledRows(eventsResult) as EventRow[],
    backups: fulfilledRows(backupsResult) as BackupRow[],
    remoteJobs: fulfilledRows(jobsResult) as RemoteJobRow[],
    fallbackCount24h,
    coreBypassIssues,
    queryIssues,
  });
}
