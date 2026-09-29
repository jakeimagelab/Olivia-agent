import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STEP_INFO } from "@/lib/clientStepInfo";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import { ACTIVE_PHOTO_PROJECT_STATUSES, isPhotoProjectPendingVisible } from "@/lib/photo-storage/notificationPolicy";
import { eventForStatus } from "@/lib/photo-storage/server";
import type { PhotoProjectStatus } from "@/lib/photo-storage/types";
import { parseRemoteJobProgress } from "@/lib/remote-jobs/progress";
import { getConfiguredWorkerId } from "@/lib/remoteWorkerAuth";
import { getWorkflowDisplayStepKey, STEP_NAME } from "@/lib/workflow";
import { findWorkflowConsistencyIssues, type WorkflowConsistencyIssue } from "@/lib/workflowAutomation";
import { isWorkflowWaitingCustomer } from "@/lib/workflowWaiting";
import { healthRuleById } from "@/lib/health/rules";
import type { StatusPanelAction, StatusPanelData, StatusPanelEntry, StatusPanelRecentEntry } from "./panelTypes";
import type { SystemStatusReport } from "./types";
import type { WorkerWatcherProgress } from "./types";

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
  jpg_count?: number | null;
  raw_count?: number | null;
  notification_deferred_until?: string | null;
  notification_dismissed_at?: string | null;
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
type BackupRow = {
  id: string;
  event_type: string | null;
  folder_name: string | null;
  file_count: number | null;
  total_bytes: number | null;
  status: string | null;
  created_at: string | null;
};
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
type FallbackRow = { id: string; metadata: Record<string, unknown> | null; created_at: string | null };
type WorkerProgressRow = { watcher_progress?: unknown };
type HealthFindingRow = {
  id: string;
  rule_id: string;
  state: "issue" | "unknown";
  detail: string | null;
  remedy: string | null;
  evidence: Record<string, unknown> | null;
  last_seen_at: string | null;
};
type QueryResult<T> = { data: T[] | null; error: { message?: string } | null };

const JOB_ACTION_LABEL: Record<string, string> = {
  PHOTO_SORT: "사진 분류",
  LIST_FOLDER: "폴더 조회",
  PHOTO_PREPARE_SOURCE: "JPG정리",
  PHOTO_STAGE_JPG: "JPG 복사",
  PHOTO_CLASSIFY_WORK: "사진 정리",
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
  MERGE_APPROVED: "JPG정리 대기",
  MERGING: "JPG정리 중",
  CLASSIFY_APPROVED: "분류 준비 중",
  COPY_QUEUED: "JPG 복사 대기",
  COPYING: "JPG 복사 중",
  COPY_VERIFYING: "JPG 복사 검증 중",
  CLASSIFY_QUEUED: "분류 대기",
  CLASSIFYING: "분류 중",
  CLASSIFY_VERIFYING: "분류 검증 중",
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

function normalizeWatcherProgress(value: unknown): WorkerWatcherProgress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (source.version !== 1 || typeof source.scannedAt !== "string" || !Array.isArray(source.stabilizing)) return null;
  const sourceStatus = source.sourceStatus === "ONLINE" || source.sourceStatus === "SOURCE_OFFLINE" ? source.sourceStatus : null;
  if (!sourceStatus) return null;
  const stabilizing = source.stabilizing.slice(0, 10).flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const projectName = typeof row.projectName === "string" ? row.projectName.trim() : "";
    const elapsedSeconds = typeof row.elapsedSeconds === "number" && Number.isFinite(row.elapsedSeconds) ? Math.max(0, Math.floor(row.elapsedSeconds)) : null;
    const targetSeconds = typeof row.targetSeconds === "number" && Number.isFinite(row.targetSeconds) ? Math.max(1, Math.floor(row.targetSeconds)) : null;
    return projectName && elapsedSeconds !== null && targetSeconds !== null
      ? [{ projectName, elapsedSeconds: Math.min(elapsedSeconds, targetSeconds), targetSeconds }]
      : [];
  });
  return { version: 1, scannedAt: source.scannedAt, sourceStatus, stabilizing };
}

export function photoSortingHref(folder: string | null | undefined) {
  return folder?.trim() ? `/photo-sorting?remoteFolder=${encodeURIComponent(folder.trim())}` : "/photo-sorting";
}

export function isTransientRemoteJobFailure(error: string | null | undefined) {
  if (!error) return false;
  return /(?:curl(?:\s+exit(?:\s+code)?)?\s*[=:]?\s*(?:6|7|28)\b|could not resolve|failed to connect|connection (?:refused|timed out)|operation timed out|network (?:is )?unreachable|\b(?:ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT)\b)/i.test(error);
}

function safeRemoteProgress(progress: Record<string, unknown> | null | undefined) {
  try {
    return parseRemoteJobProgress(progress);
  } catch {
    return null;
  }
}

function projectIdFromJob(job: RemoteJobRow) {
  return typeof job.payload?.project_id === "string" ? job.payload.project_id : null;
}

function jobFolder(job: RemoteJobRow, project?: PhotoProjectRow) {
  for (const key of ["source_relative_path", "source_folder", "project_relative_path"]) {
    const value = job.payload?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return project?.source_relative_path?.trim() || null;
}

function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)}${units[unit]}`;
}

function apiAction(id: string, label: string, endpoint: string, options: {
  body?: Record<string, unknown>;
  tone?: StatusPanelAction["tone"];
  auto?: boolean;
} = {}): StatusPanelAction {
  return { id, label, kind: "api", endpoint, method: "POST", ...options };
}

function openAction(id: string, label: string, href: string): StatusPanelAction {
  return { id, label, kind: "open", href };
}

function photoActions(project: PhotoProjectRow, options: { retry?: boolean } = {}): StatusPanelAction[] {
  const href = photoSortingHref(project.source_relative_path);
  if (options.retry) {
    return [
      apiAction(`retry:${project.id}`, "재시도", `/api/photo-storage/projects/${project.id}/retry`, { tone: "primary" }),
      openAction(`open:${project.id}`, "열어보기", href),
    ];
  }
  return [
    apiAction(`approve:${project.id}`, project.status === "MERGE_COMPLETED" ? "분류 시작" : "승인", `/api/photo-storage/projects/${project.id}/approve`, { tone: "primary" }),
    apiAction(`defer:${project.id}`, "미루기", `/api/photo-storage/projects/${project.id}/defer`),
    openAction(`open:${project.id}`, "열어보기", href),
  ];
}

function sanitizeFallbackReason(value: unknown) {
  if (typeof value !== "string") return "알 수 없는 사유";
  return value.trim()
    .replace(/https?:\/\/\S+/gi, "[주소]")
    .replace(/Bearer\s+\S+/gi, "Bearer [숨김]")
    .slice(0, 180) || "알 수 없는 사유";
}

function fallbackSummary(rows: FallbackRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const reason = sanitizeFallbackReason(row.metadata?.fallbackReason);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([reason, count]) => `${reason} ${count}회`)
    .join(" · ");
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

function supabaseSqlEditorUrl() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return "https://supabase.com/dashboard/projects";
  try {
    const projectRef = new URL(raw).hostname.split(".")[0];
    return projectRef ? `https://supabase.com/dashboard/project/${encodeURIComponent(projectRef)}/sql/new` : "https://supabase.com/dashboard/projects";
  } catch {
    return "https://supabase.com/dashboard/projects";
  }
}

export async function loadSchemaWarningEntries(diagnostics: SystemStatusReport): Promise<StatusPanelEntry[]> {
  const migrations = new Map<string, string>();
  for (const item of diagnostics.items ?? []) {
    if (item.level === "ok" || !item.migration) continue;
    if (!/^supabase\/migrations\/[0-9A-Za-z._-]+\.sql$/.test(item.migration)) continue;
    migrations.set(item.id, item.migration);
  }
  const migrationRoot = path.resolve(process.cwd(), "supabase/migrations");
  return Promise.all([...migrations.entries()].map(async ([diagnosticId, migration]) => {
    const absolutePath = path.resolve(process.cwd(), migration);
    const insideMigrationRoot = absolutePath.startsWith(`${migrationRoot}${path.sep}`);
    let sql = "";
    if (insideMigrationRoot) sql = await readFile(absolutePath, "utf8").catch(() => "");
    const fileName = path.basename(migration);
    return {
      id: `diagnostic:${diagnosticId}`,
      kind: "schema_warning",
      level: "warning" as const,
      title: `적용 안 된 SQL · ${fileName}`,
      detail: sql ? "SQL 원문을 복사해 Supabase에서 적용하세요." : "SQL 파일을 읽지 못했습니다. 저장소에서 직접 확인하세요.",
      createdAt: diagnostics.checkedAt,
      actions: [
        ...(sql ? [{ id: `copy-sql:${diagnosticId}`, label: "SQL 복사", kind: "copy" as const, value: sql, tone: "primary" as const }] : []),
        { id: `open-supabase:${diagnosticId}`, label: "Supabase 열기", kind: "external" as const, href: supabaseSqlEditorUrl() },
      ],
    };
  }));
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
  fallbackRows?: FallbackRow[];
  consistencyIssues?: WorkflowConsistencyIssue[];
  schemaIssues?: StatusPanelEntry[];
  queryIssues?: StatusPanelEntry[];
  watcherProgress?: WorkerWatcherProgress | null;
  healthFindings?: HealthFindingRow[];
  nowMs?: number;
}): StatusPanelData {
  const photoProjects = input.photoProjects ?? [];
  const workflowRuns = input.workflowRuns ?? [];
  const approvals = input.approvals ?? [];
  const failedTasks = input.failedTasks ?? [];
  const blockedEvents = input.blockedEvents ?? [];
  const backups = input.backups ?? [];
  const remoteJobs = input.remoteJobs ?? [];
  const fallbackRows = input.fallbackRows ?? [];
  const nowMs = input.nowMs ?? Date.now();
  const runById = new Map(workflowRuns.map((run) => [run.id, run]));
  const projectById = new Map(photoProjects.map((project) => [project.id, project]));
  const projectByPath = new Map(photoProjects.map((project) => [project.source_relative_path ?? project.project_name ?? "", project]));
  const failedJobCount = new Map<string, number>();
  for (const job of remoteJobs) {
    if (job.status !== "FAILED") continue;
    const projectId = projectIdFromJob(job);
    if (!projectId || !job.action) continue;
    const key = `${projectId}:${job.action}`;
    failedJobCount.set(key, (failedJobCount.get(key) ?? 0) + 1);
  }
  const pendingApprovalCount = new Map<string, number>();
  for (const approval of approvals) {
    if (!approval.workflow_run_id) continue;
    pendingApprovalCount.set(approval.workflow_run_id, (pendingApprovalCount.get(approval.workflow_run_id) ?? 0) + 1);
  }

  const panelIssues: StatusPanelEntry[] = [...(input.queryIssues ?? []), ...(input.schemaIssues ?? [])];
  if (fallbackRows.length > 0) {
    panelIssues.push({
      id: "hermes-fallbacks",
      kind: "hermes_fallback",
      level: "warning",
      title: `최근 24시간 헤르메스 폴백 ${fallbackRows.length}회`,
      detail: fallbackSummary(fallbackRows) || "폴백 사유를 확인할 수 없습니다.",
      createdAt: fallbackRows[0]?.created_at ?? input.diagnostics.checkedAt,
    });
  }
  for (const issue of input.consistencyIssues ?? []) {
    if (issue.kind === "resource_ahead") {
      const endpoint = issue.resourceType === "quote" && issue.resourceId
        ? `/api/quotes/${issue.resourceId}/complete`
        : `/api/workflow-runs/${issue.workflowRunId}/complete-step`;
      panelIssues.push({
        id: `consistency:${issue.workflowRunId}:${issue.foundStepKey}`,
        kind: "consistency_repair",
        level: "warning",
        title: `단계 정합성 · ${issue.clientName || "이름 없는 고객"}`,
        detail: `${issue.foundStepName} 자료가 있지만 ${issue.currentStepName} 단계에 머물러 있습니다.`,
        href: projectHref(runById.get(issue.workflowRunId), issue.clientId),
        clientId: issue.clientId,
        workflowRunId: issue.workflowRunId,
        createdAt: input.diagnostics.checkedAt,
        actions: [
          apiAction(`repair:${issue.workflowRunId}:${issue.foundStepKey}`, "지금 완료 처리", endpoint, {
            tone: "primary",
            // 견적서 전용 endpoint로 갈 때만 body를 생략한다. resourceId가 없어서
            // workflow-runs endpoint로 떨어지는 경우에도 stepKey는 반드시 실어야 한다(2026-09-29).
            ...(endpoint.startsWith("/api/quotes/") ? {} : { body: { stepKey: issue.foundStepKey } }),
          }),
          openAction(`open-client:${issue.workflowRunId}`, "열어보기", projectHref(runById.get(issue.workflowRunId), issue.clientId)),
        ],
      });
      continue;
    }
    panelIssues.push({
      id: `core-bypass:${issue.workflowRunId}`,
      kind: "core_bypass",
      level: "warning",
      title: `Core 우회 의심 · ${issue.clientName || "이름 없는 고객"}`,
      detail: `${issue.currentStepName} · 단계 변경 시각 ${issue.updatedAt}`,
      href: projectHref(runById.get(issue.workflowRunId), issue.clientId),
      clientId: issue.clientId,
      workflowRunId: issue.workflowRunId,
      createdAt: issue.updatedAt,
      actions: [openAction(`open-client:${issue.workflowRunId}`, "대상 열기", projectHref(runById.get(issue.workflowRunId), issue.clientId))],
    });
  }
  for (const finding of input.healthFindings ?? []) {
    const rule = healthRuleById(finding.rule_id);
    panelIssues.push({
      id: `health:${finding.rule_id}`,
      kind: "health_finding",
      level: finding.state === "unknown" ? "unknown" : rule?.severity === "error" ? "error" : "warning",
      title: `자가 점검 · ${rule?.label || finding.rule_id}`,
      detail: [finding.detail, finding.remedy].filter(Boolean).join(" · ") || "상세 상태를 확인하세요.",
      createdAt: finding.last_seen_at || input.diagnostics.checkedAt,
    });
  }
  for (const project of photoProjects) {
    if (!PHOTO_FAILURE_STATUSES.has(project.status)) continue;
    const run = project.workflow_run_id ? runById.get(project.workflow_run_id) : undefined;
    const latestFailedJob = remoteJobs.find((job) => job.status === "FAILED" && projectIdFromJob(job) === project.id);
    const failureKey = latestFailedJob?.action ? `${project.id}:${latestFailedJob.action}` : null;
    const autoRetry = Boolean(
      latestFailedJob
      && failureKey
      && failedJobCount.get(failureKey) === 1
      && isTransientRemoteJobFailure(latestFailedJob.error || latestFailedJob.message),
    );
    const href = photoSortingHref(project.source_relative_path);
    const statusEvent = eventForStatus(project.status as PhotoProjectStatus);
    panelIssues.push({
      id: `photo-failure:${project.id}`,
      kind: "photo_failure",
      level: project.status === "REVIEW_REQUIRED" ? "warning" : "error",
      title: `사진 작업 확인 필요 · ${project.project_name || "이름 없는 폴더"}`,
      detail: latestFailedJob?.error || statusEvent.message,
      href,
      clientId: run?.client_id ?? null,
      workflowRunId: project.workflow_run_id,
      projectId: project.id,
      createdAt: project.updated_at,
      actions: [
        ...(autoRetry ? [apiAction(`auto-retry:${project.id}:${latestFailedJob?.id}`, "자동 재시도", `/api/photo-storage/projects/${project.id}/retry`, { tone: "primary", auto: true })] : []),
        openAction(`open:${project.id}`, "열어보기", href),
      ],
    });
  }

  const myTurn: StatusPanelEntry[] = [];
  const representedRuns = new Set<string>();
  for (const project of photoProjects) {
    if (!["READY", "DEFERRED", "MERGE_COMPLETED"].includes(project.status)) continue;
    if (!isPhotoProjectPendingVisible({
      status: project.status as PhotoProjectStatus,
      notification_deferred_until: project.notification_deferred_until ?? null,
      notification_dismissed_at: project.notification_dismissed_at ?? null,
    }, nowMs)) continue;
    if (project.workflow_run_id) representedRuns.add(project.workflow_run_id);
    const firstApproval = project.status === "READY" || project.status === "DEFERRED";
    const href = photoSortingHref(project.source_relative_path);
    myTurn.push({
      id: `photo-action:${project.id}`,
      kind: firstApproval ? "photo_first_approval" : "photo_second_approval",
      level: "info",
      title: `${project.project_name || "이름 없는 폴더"} · ${firstApproval ? "JPG정리 승인 대기" : "JPG정리 완료"}`,
      detail: firstApproval
        ? `JPG ${(project.jpg_count ?? 0).toLocaleString("ko-KR")}장 · 진행하면 JPG정리를 시작합니다.`
        : `씬 분류를 시작할 차례입니다. ${STEP_INFO.backup_sorting?.desc ?? "사진 분류 단계를 진행합니다."}`,
      href,
      workflowRunId: project.workflow_run_id,
      projectId: project.id,
      createdAt: project.updated_at,
      actions: photoActions(project),
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
      detail: STEP_INFO.payment_confirm?.desc ?? "잔금과 계산서 확인 후 다음 단계로 진행할 수 있습니다.",
      href: projectHref(run, event.client_id),
      clientId: run.client_id ?? event.client_id,
      workflowRunId: run.id,
      createdAt: event.occurred_at,
      actions: [
        apiAction(`complete-payment:${run.id}`, "확인 완료", `/api/workflow-runs/${run.id}/complete-step`, { body: { stepKey: "payment_confirm" }, tone: "primary" }),
        openAction(`open-client:${run.id}`, "열어보기", projectHref(run, event.client_id)),
      ],
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
      detail: STEP_INFO[displayStepKey ?? ""]?.desc || `${STEP_NAME[displayStepKey ?? ""] || displayStepKey || "현재 단계"} 확인이 필요합니다.`,
      href: run.client_id && displayStepKey
        ? buildStepAppLink({ stepKey: displayStepKey, clientId: run.client_id, workflowRunId: run.id })
        : projectHref(run),
      clientId: run.client_id,
      workflowRunId: run.id,
      createdAt: run.updated_at,
      actions: [openAction(
        `open-step:${run.id}`,
        `${STEP_NAME[displayStepKey ?? ""] || "현재 단계"} 열기`,
        run.client_id && displayStepKey
          ? buildStepAppLink({ stepKey: displayStepKey, clientId: run.client_id, workflowRunId: run.id })
          : projectHref(run),
      )],
    });
  }

  const progress: StatusPanelEntry[] = [];
  for (const item of input.watcherProgress?.stabilizing ?? []) {
    progress.push({
      id: `watcher-stabilizing:${item.projectName}`,
      kind: "watcher_stabilizing",
      level: "info",
      title: `${item.projectName} · 복사 확인 중 ${item.elapsedSeconds}/${item.targetSeconds}초`,
      detail: "촬영 파일 복사가 계속되면 안정화 확인 시간이 다시 시작됩니다.",
      href: photoSortingHref(item.projectName),
      createdAt: input.watcherProgress?.scannedAt ?? input.diagnostics.checkedAt,
      progressPercent: Math.max(0, Math.min(100, Math.round((item.elapsedSeconds / item.targetSeconds) * 100))),
    });
  }
  const activeRemoteProjectIds = new Set(
    remoteJobs
      .filter((job) => ["QUEUED", "RUNNING"].includes(job.status ?? ""))
      .map(projectIdFromJob)
      .filter((projectId): projectId is string => Boolean(projectId)),
  );
  for (const project of photoProjects) {
    if (!ACTIVE_PHOTO_STATUSES.includes(project.status)) continue;
    // 실제 remote_jobs.progress가 있으면 단계별 current/total을 보여주는 쪽을 우선한다.
    // 같은 프로젝트의 포괄 상태 카드를 함께 내보내면 진행률이 두 줄로 중복된다.
    if (activeRemoteProjectIds.has(project.id)) continue;
    const href = photoSortingHref(project.source_relative_path);
    progress.push({
      id: `photo-progress:${project.id}`,
      kind: "photo_progress",
      level: "info",
      title: `${PHOTO_STATUS_LABEL[project.status] || project.status} · ${project.project_name || "이름 없는 폴더"}`,
      detail: project.source_relative_path || "사진작업실에서 진행 상황을 확인하세요.",
      href,
      workflowRunId: project.workflow_run_id,
      projectId: project.id,
      createdAt: project.updated_at,
    });
  }
  for (const job of remoteJobs) {
    if (!["QUEUED", "RUNNING"].includes(job.status ?? "")) continue;
    const projectId = projectIdFromJob(job);
    const project = projectId ? projectById.get(projectId) : undefined;
    const folder = jobFolder(job, project);
    const progressPercent = percentFromProgress(job.progress);
    const actionLabel = JOB_ACTION_LABEL[job.action ?? ""] || job.action || "원격 작업";
    const targetName = project?.project_name || folder || "대상 확인 중";
    progress.push({
      id: `remote-job:${job.id}`,
      kind: "remote_job_progress",
      level: "info",
      title: `${actionLabel} · ${targetName}`,
      detail: job.message || (typeof job.progress?.message === "string" ? job.progress.message : "Mac Studio에서 처리 중입니다."),
      href: photoSortingHref(folder),
      projectId,
      createdAt: job.created_at,
      progressPercent,
      remoteJob: {
        id: job.id,
        status: job.status === "QUEUED" ? "QUEUED" : "RUNNING",
        message: job.message,
        error: job.error,
        progress: safeRemoteProgress(job.progress),
      },
    });
  }

  const recentActivity: StatusPanelRecentEntry[] = [];
  for (const backup of backups.slice(0, RECENT_LIMIT)) {
    const project = projectByPath.get(backup.folder_name ?? "");
    const href = photoSortingHref(backup.folder_name);
    const fileCount = Math.max(0, Number(backup.file_count ?? 0));
    const byteText = formatBytes(backup.total_bytes);
    const actions = project && ["READY", "DEFERRED", "MERGE_COMPLETED"].includes(project.status)
      ? photoActions(project)
      : [openAction(`open-backup:${backup.id}`, "열어보기", href)];
    recentActivity.push({
      id: `backup:${backup.id}`,
      kind: "backup",
      title: backup.folder_name || "이름 없는 백업 폴더",
      detail: `백업 감지 · ${fileCount.toLocaleString("ko-KR")}개 파일${byteText ? ` · ${byteText}` : ""} · ${backup.status || "상태 확인 중"}`,
      level: "info",
      href,
      createdAt: backup.created_at || input.diagnostics.checkedAt,
      projectId: project?.id ?? null,
      actions,
    });
  }
  for (const job of remoteJobs.filter((row) => ["COMPLETED", "FAILED"].includes(row.status ?? "")).slice(0, RECENT_LIMIT)) {
    const projectId = projectIdFromJob(job);
    const project = projectId ? projectById.get(projectId) : undefined;
    const folder = jobFolder(job, project);
    const actionLabel = JOB_ACTION_LABEL[job.action ?? ""] || job.action || "원격 작업";
    recentActivity.push({
      id: `recent-job:${job.id}`,
      kind: "remote_job",
      title: `${actionLabel} · ${project?.project_name || folder || "대상 확인 중"}`,
      detail: `${JOB_STATUS_LABEL[job.status ?? ""] || job.status}${job.status === "FAILED" && job.error ? ` · ${job.error}` : ""}`,
      level: job.status === "FAILED" ? "error" : "info",
      href: photoSortingHref(folder),
      createdAt: job.completed_at || job.created_at || input.diagnostics.checkedAt,
      projectId,
      actions: [openAction(`open-job:${job.id}`, "대상 열기", photoSortingHref(folder))],
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
  const now = options.now ?? new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString();
  const [results, schemaIssues, workerProgressResult, healthResults] = await Promise.all([
    Promise.allSettled([
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
    db.from("worker_events").select("id,event_type,folder_name,file_count,total_bytes,status,created_at")
      .order("created_at", { ascending: false }).limit(RECENT_LIMIT),
    db.from("remote_jobs").select("id,action,status,payload,progress,message,error,created_at,completed_at")
      .neq("action", "PING").order("created_at", { ascending: false }).limit(200),
    db.from("olivia_chat_messages").select("id,metadata,created_at")
      .eq("role", "assistant").not("metadata->>fallbackReason", "is", null).gte("created_at", since24h)
      .order("created_at", { ascending: false }).limit(500),
    findWorkflowConsistencyIssues(db),
    ]),
    loadSchemaWarningEntries(diagnostics),
    db.from("remote_workers").select("watcher_progress").eq("worker_id", getConfiguredWorkerId()).maybeSingle(),
    Promise.allSettled([
      db.from("health_findings").select("id,rule_id,state,detail,remedy,evidence,last_seen_at").is("resolved_at", null).order("last_seen_at", { ascending: false }).limit(50),
    ]),
  ]);

  const healthResult = healthResults[0];

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
    queryFailure(healthResult, "health-findings", "자가 점검"),
    consistencyResult.status === "rejected" ? {
      id: "query:workflow-consistency", kind: "query_error", level: "unknown" as const,
      title: "워크플로 정합성 · 확인 불가",
      detail: consistencyResult.reason instanceof Error ? consistencyResult.reason.message : String(consistencyResult.reason),
    } : null,
  ].filter((entry): entry is StatusPanelEntry => Boolean(entry));

  const consistencyIssues = consistencyResult.status === "fulfilled"
    ? consistencyResult.value.slice(0, RECENT_LIMIT)
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
    fallbackRows: fulfilledRows(fallbackResult) as FallbackRow[],
    consistencyIssues,
    schemaIssues,
    queryIssues,
    watcherProgress: normalizeWatcherProgress((workerProgressResult.data as WorkerProgressRow | null)?.watcher_progress),
    healthFindings: fulfilledRows(healthResult) as HealthFindingRow[],
    nowMs: now.getTime(),
  });
}
