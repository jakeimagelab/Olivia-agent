import type { SupabaseClient } from "@supabase/supabase-js";
import { checkHermesHealth, getOliviaAgentEngine } from "@/lib/hermes/client";
import { getConfiguredWorkerId } from "@/lib/remoteWorkerAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { HERMES_MCP_SIGNAL_KEY } from "./mcpSignal";
import { SYSTEM_STATUS_GUIDANCE } from "./messages";
import type { SystemStatusItem, SystemStatusReport } from "./types";

const WORKER_OFFLINE_MS = 5 * 60 * 1_000;
const MCP_STALE_MS = 24 * 60 * 60 * 1_000;
const WATCHER_STALE_MS = 5 * 60 * 1_000;

const REQUIRED_TABLES = [
  ["worker_events", "supabase/migrations/20260917_worker_events.sql"],
  ["remote_workers", "supabase/migrations/20260913_remote_photo_progress.sql"],
  ["remote_jobs", "supabase/migrations/20260913_remote_photo_progress.sql"],
  ["photo_storage_projects", "supabase/migrations/20260914_photo_storage_projects.sql"],
] as const;

const REQUIRED_ENV = [
  "HERMES_API_SECRET",
  "HERMES_TOOL_SHARED_SECRET",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

type SupabaseErrorLike = { code?: string; message?: string } | null;

function isMissingSchemaObject(error: SupabaseErrorLike): boolean {
  if (!error) return false;
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "")
    || /does not exist|schema cache|could not find/i.test(error.message ?? "");
}

function privateHermesAddress(value: string | undefined): boolean {
  const raw = value?.trim();
  if (!raw) return false;
  let hostname = "";
  try {
    hostname = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (["localhost", "127.0.0.1", "::1"].includes(hostname) || hostname.endsWith(".local")) return true;
  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^100\./.test(hostname)) return true;
  const match = hostname.match(/^172\.(\d{1,3})\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function relativeKorean(iso: string | null | undefined, now: Date): string {
  if (!iso) return "기록 없음";
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "시각 확인 불가";
  const seconds = Math.max(0, Math.round((now.getTime() - timestamp) / 1_000));
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function unknownItem(id: string, group: SystemStatusItem["group"], label: string, detail: string, remedy: string): SystemStatusItem {
  return { id, group, label, level: "unknown", state: "확인 불가", detail, remedy };
}

async function checkHermes(now: Date): Promise<SystemStatusItem[]> {
  const health = await checkHermesHealth();
  const url = process.env.HERMES_BASE_URL?.trim();
  const engine = getOliviaAgentEngine();
  const items: SystemStatusItem[] = [
    health.online
      ? { id: "hermes_health", group: "cloud", label: "Hermes", level: "ok", state: "ONLINE", detail: `응답 ${health.elapsedMs}ms` }
      : { id: "hermes_health", group: "cloud", label: "Hermes", level: "error", state: "OFFLINE", detail: "Hermes health check에 응답이 없습니다.", remedy: SYSTEM_STATUS_GUIDANCE.hermesOffline },
    !url
      ? { id: "hermes_address", group: "cloud", label: "Hermes 주소", level: "error", state: "설정 없음", detail: "주소 값은 보안을 위해 표시하지 않습니다.", remedy: SYSTEM_STATUS_GUIDANCE.hermesUrlMissing }
      : privateHermesAddress(url)
        ? { id: "hermes_address", group: "cloud", label: "Hermes 주소", level: "error", state: "사설 IP", detail: "외부 Vercel 환경에서 도달할 수 없는 주소 형태입니다.", remedy: SYSTEM_STATUS_GUIDANCE.hermesPrivateUrl }
        : { id: "hermes_address", group: "cloud", label: "Hermes 주소", level: "ok", state: "공개 주소", detail: "주소 값은 보안을 위해 표시하지 않습니다." },
    engine === "hermes"
      ? { id: "agent_engine", group: "cloud", label: "Agent 엔진", level: "ok", state: "hermes" }
      : { id: "agent_engine", group: "cloud", label: "Agent 엔진", level: "warning", state: "legacy", detail: "현재 채팅 기본 엔진이 legacy입니다.", remedy: SYSTEM_STATUS_GUIDANCE.legacyEngine },
  ];
  void now;
  return items;
}

function checkEnvironment(): SystemStatusItem[] {
  return REQUIRED_ENV.map((name) => {
    const configured = Boolean(process.env[name]?.trim());
    return configured
      ? { id: `env_${name.toLowerCase()}`, group: "cloud" as const, label: name, level: "ok" as const, state: "설정됨" }
      : { id: `env_${name.toLowerCase()}`, group: "cloud" as const, label: name, level: "error" as const, state: "없음", detail: "값은 진단 결과에 노출하지 않습니다.", remedy: SYSTEM_STATUS_GUIDANCE.envMissing(name) };
  });
}

async function checkRequiredTable(db: SupabaseClient, table: string, migration: string): Promise<SystemStatusItem> {
  try {
    const { error } = await db.from(table).select("*").limit(1);
    if (!error) return { id: `table_${table}`, group: "database", label: table, level: "ok", state: "OK" };
    if (isMissingSchemaObject(error)) {
      return { id: `table_${table}`, group: "database", label: table, level: "error", state: "없음", detail: "필수 테이블을 찾지 못했습니다.", remedy: `${migration} migration을 적용하세요.`, migration };
    }
    return unknownItem(`table_${table}`, "database", table, "테이블 조회에 실패했습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable);
  } catch {
    return unknownItem(`table_${table}`, "database", table, "테이블 조회에 실패했습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable);
  }
}

export async function checkMcpSignal(db: SupabaseClient, now: Date): Promise<SystemStatusItem> {
  try {
    const { data, error } = await db
      .from("system_status_signals")
      .select("last_seen_at,tool_count")
      .eq("signal_key", HERMES_MCP_SIGNAL_KEY)
      .maybeSingle();
    if (error) {
      if (isMissingSchemaObject(error)) {
        return { id: "mcp_tools", group: "cloud", label: "MCP 도구", level: "error", state: "기록 불가", detail: "MCP 연결 기록용 migration이 적용되지 않았습니다.", remedy: SYSTEM_STATUS_GUIDANCE.mcpSignalUnavailable, toolCount: 0, migration: "supabase/migrations/20260919_system_status_diagnostics.sql" };
      }
      return unknownItem("mcp_tools", "cloud", "MCP 도구", "MCP 연결 기록을 조회하지 못했습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable);
    }
    if (!data) {
      return { id: "mcp_tools", group: "cloud", label: "MCP 도구", level: "error", state: "미연결", detail: "Hermes의 Olivia ListTools 요청 기록이 없습니다.", remedy: SYSTEM_STATUS_GUIDANCE.mcpDisconnected, toolCount: 0 };
    }
    const lastSeenAt = typeof data.last_seen_at === "string" ? data.last_seen_at : null;
    const toolCount = typeof data.tool_count === "number" ? data.tool_count : 0;
    const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : Number.NaN;
    const recent = Number.isFinite(lastSeenMs) && now.getTime() - lastSeenMs <= MCP_STALE_MS;
    if (!recent || toolCount <= 0) {
      return { id: "mcp_tools", group: "cloud", label: "MCP 도구", level: "error", state: "미연결", detail: `도구 ${toolCount.toLocaleString("ko-KR")}개 · 마지막 확인 ${relativeKorean(lastSeenAt, now)}`, remedy: SYSTEM_STATUS_GUIDANCE.mcpDisconnected, toolCount };
    }
    return { id: "mcp_tools", group: "cloud", label: "MCP 도구", level: "ok", state: "연결됨", detail: `도구 ${toolCount.toLocaleString("ko-KR")}개 · 마지막 확인 ${relativeKorean(lastSeenAt, now)}`, toolCount };
  } catch {
    return unknownItem("mcp_tools", "cloud", "MCP 도구", "MCP 연결 기록을 조회하지 못했습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable);
  }
}

type WorkerBaseRow = { last_seen_at?: string | null; worker_status?: string | null; nas_connected?: boolean | null };
type WorkerDiagnosticRow = {
  workstation_mounted?: boolean | null;
  workstation_accessible?: boolean | null;
  agentstation_mounted?: boolean | null;
  agentstation_accessible?: boolean | null;
  watcher_last_scan_at?: string | null;
};
type WorkerAiDiagnosticRow = { openai_api_key_configured?: boolean | null };

function mountItem(options: { id: string; label: string; mounted: boolean | null | undefined; remedy: string }): SystemStatusItem {
  if (options.mounted === true) return { id: options.id, group: "mac_studio", label: options.label, level: "ok", state: "MOUNTED" };
  if (options.mounted === false) return { id: options.id, group: "mac_studio", label: options.label, level: "error", state: "NOT_MOUNTED", remedy: options.remedy };
  return unknownItem(options.id, "mac_studio", options.label, "Worker가 마운트 상태를 아직 보고하지 않았습니다.", SYSTEM_STATUS_GUIDANCE.workerDiagnosticsMissing);
}

function accessItem(options: { id: string; label: string; mounted: boolean | null | undefined; accessible: boolean | null | undefined; remedy: string }): SystemStatusItem {
  if (options.accessible === true) return { id: options.id, group: "mac_studio", label: options.label, level: "ok", state: "ACCESSIBLE" };
  if (options.accessible === false) return { id: options.id, group: "mac_studio", label: options.label, level: "error", state: options.mounted === false ? "NOT_MOUNTED" : "PERMISSION_DENIED", detail: options.mounted === false ? "볼륨이 마운트되지 않아 접근할 수 없습니다." : "마운트는 되었지만 Worker가 디렉터리를 읽지 못합니다.", remedy: options.mounted === false ? options.remedy.replace("전체 디스크 접근 권한에서 OliviaWorker.app 권한을 확인하세요.", "해당 볼륨을 먼저 마운트하세요.") : options.remedy };
  return unknownItem(options.id, "mac_studio", options.label, "Worker가 접근 권한 상태를 아직 보고하지 않았습니다.", SYSTEM_STATUS_GUIDANCE.workerDiagnosticsMissing);
}

async function checkWorker(db: SupabaseClient, now: Date): Promise<SystemStatusItem[]> {
  const workerId = getConfiguredWorkerId();
  const [baseResult, diagnosticsResult, aiDiagnosticsResult, queuedResult] = await Promise.all([
    db.from("remote_workers").select("last_seen_at,worker_status,nas_connected").eq("worker_id", workerId).maybeSingle(),
    db.from("remote_workers").select("workstation_mounted,workstation_accessible,agentstation_mounted,agentstation_accessible,watcher_last_scan_at").eq("worker_id", workerId).maybeSingle(),
    db.from("remote_workers").select("openai_api_key_configured").eq("worker_id", workerId).maybeSingle(),
    db.from("remote_jobs").select("id", { count: "exact", head: true }).eq("status", "QUEUED"),
  ]);

  const items: SystemStatusItem[] = [];
  const base = !baseResult.error && baseResult.data ? baseResult.data as WorkerBaseRow : null;
  if (baseResult.error) {
    items.push(unknownItem("worker", "mac_studio", "Worker", "Worker heartbeat를 조회하지 못했습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable));
  } else if (!base) {
    items.push({ id: "worker", group: "mac_studio", label: "Worker", level: "error", state: "OFFLINE", detail: "등록된 heartbeat가 없습니다.", remedy: SYSTEM_STATUS_GUIDANCE.workerMissing });
  } else {
    const lastSeenMs = base.last_seen_at ? new Date(base.last_seen_at).getTime() : Number.NaN;
    const online = Number.isFinite(lastSeenMs) && now.getTime() - lastSeenMs < WORKER_OFFLINE_MS;
    items.push(online
      ? { id: "worker", group: "mac_studio", label: "Worker", level: "ok", state: "ONLINE", detail: `${base.worker_status ?? "online"} · 마지막 연결 ${relativeKorean(base.last_seen_at, now)}` }
      : { id: "worker", group: "mac_studio", label: "Worker", level: "error", state: "OFFLINE", detail: `마지막 연결 ${relativeKorean(base.last_seen_at, now)}`, remedy: SYSTEM_STATUS_GUIDANCE.workerOffline });
  }

  const diagnostics = !diagnosticsResult.error && diagnosticsResult.data ? diagnosticsResult.data as WorkerDiagnosticRow : null;
  const aiDiagnostics = !aiDiagnosticsResult.error && aiDiagnosticsResult.data
    ? aiDiagnosticsResult.data as WorkerAiDiagnosticRow
    : null;
  const diagnosticsUnavailable = Boolean(diagnosticsResult.error && isMissingSchemaObject(diagnosticsResult.error));
  if (diagnosticsResult.error && !diagnosticsUnavailable) console.warn("[system-status] worker diagnostics 조회 실패", diagnosticsResult.error.message);

  items.push(
    mountItem({ id: "workstation_mount", label: "Workstation 마운트", mounted: diagnostics?.workstation_mounted, remedy: SYSTEM_STATUS_GUIDANCE.workstationNotMounted }),
    accessItem({ id: "workstation_access", label: "Workstation 접근", mounted: diagnostics?.workstation_mounted, accessible: diagnostics?.workstation_accessible, remedy: SYSTEM_STATUS_GUIDANCE.workstationPermission }),
    mountItem({ id: "agentstation_mount", label: "Agentstation 마운트", mounted: diagnostics?.agentstation_mounted, remedy: SYSTEM_STATUS_GUIDANCE.agentstationNotMounted }),
    accessItem({ id: "agentstation_access", label: "Agentstation 접근", mounted: diagnostics?.agentstation_mounted, accessible: diagnostics?.agentstation_accessible, remedy: SYSTEM_STATUS_GUIDANCE.agentstationPermission }),
  );

  items.push(aiDiagnostics?.openai_api_key_configured === true
    ? { id: "worker_openai_key", group: "mac_studio", label: "Worker 씬 AI", level: "ok", state: "설정됨" }
    : aiDiagnostics?.openai_api_key_configured === false
      ? { id: "worker_openai_key", group: "mac_studio", label: "Worker 씬 AI", level: "error", state: "OPENAI_API_KEY 없음", detail: "씬 경계는 시간·로컬 특징으로만 나뉘며 폴더명은 미분류 추정값으로 표시됩니다.", remedy: SYSTEM_STATUS_GUIDANCE.workerOpenAiMissing }
      : unknownItem("worker_openai_key", "mac_studio", "Worker 씬 AI", "Worker의 OPENAI_API_KEY 설정 여부를 아직 보고받지 못했습니다.", SYSTEM_STATUS_GUIDANCE.workerDiagnosticsMissing));

  const watcherIso = diagnostics?.watcher_last_scan_at;
  const watcherMs = watcherIso ? new Date(watcherIso).getTime() : Number.NaN;
  const watcherRecent = Number.isFinite(watcherMs) && now.getTime() - watcherMs < WATCHER_STALE_MS;
  items.push(watcherRecent
    ? { id: "watcher_scan", group: "mac_studio", label: "NAS 감지기", level: "ok", state: "정상", detail: `마지막 스캔 ${relativeKorean(watcherIso, now)}` }
    : { id: "watcher_scan", group: "mac_studio", label: "NAS 감지기", level: "warning", state: watcherIso ? "지연" : "확인 불가", detail: watcherIso ? `마지막 스캔 ${relativeKorean(watcherIso, now)}` : "마지막 스캔 기록이 없습니다.", remedy: SYSTEM_STATUS_GUIDANCE.watcherMissing });

  items.push(queuedResult.error
    ? unknownItem("queued_jobs", "mac_studio", "대기 중인 잡", "Remote job 개수를 조회하지 못했습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable)
    : { id: "queued_jobs", group: "mac_studio", label: "대기 중인 잡", level: "ok", state: `${queuedResult.count ?? 0}개` });
  return items;
}

export async function collectSystemStatus(options: { now?: Date; db?: SupabaseClient } = {}): Promise<SystemStatusReport> {
  const now = options.now ?? new Date();
  let db: SupabaseClient | null = options.db ?? null;
  let databaseConfigError = false;
  if (!db) {
    try {
      db = getSupabaseAdmin();
    } catch {
      databaseConfigError = true;
    }
  }

  const hermesPromise = checkHermes(now).catch(() => [unknownItem("hermes_health", "cloud", "Hermes", "Hermes 상태 확인 중 오류가 발생했습니다.", SYSTEM_STATUS_GUIDANCE.hermesOffline)]);
  const envItems = checkEnvironment();
  let databaseItems: SystemStatusItem[];
  let mcpItem: SystemStatusItem;
  let workerItems: SystemStatusItem[];

  if (!db || databaseConfigError) {
    databaseItems = REQUIRED_TABLES.map(([table]) => unknownItem(`table_${table}`, "database", table, "Supabase에 연결할 수 없습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable));
    mcpItem = unknownItem("mcp_tools", "cloud", "MCP 도구", "MCP 연결 기록을 조회할 수 없습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable);
    workerItems = [
      unknownItem("worker", "mac_studio", "Worker", "Worker 상태를 조회할 수 없습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable),
      unknownItem("workstation_mount", "mac_studio", "Workstation 마운트", "Worker 상태를 조회할 수 없습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable),
      unknownItem("workstation_access", "mac_studio", "Workstation 접근", "Worker 상태를 조회할 수 없습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable),
      unknownItem("agentstation_mount", "mac_studio", "Agentstation 마운트", "Worker 상태를 조회할 수 없습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable),
      unknownItem("agentstation_access", "mac_studio", "Agentstation 접근", "Worker 상태를 조회할 수 없습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable),
      unknownItem("worker_openai_key", "mac_studio", "Worker 씬 AI", "Worker 상태를 조회할 수 없습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable),
      unknownItem("watcher_scan", "mac_studio", "NAS 감지기", "Worker 상태를 조회할 수 없습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable),
      unknownItem("queued_jobs", "mac_studio", "대기 중인 잡", "Remote job 상태를 조회할 수 없습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable),
    ];
  } else {
    const [tableResults, mcpResult, workerResult] = await Promise.all([
      Promise.all(REQUIRED_TABLES.map(([table, migration]) => checkRequiredTable(db!, table, migration))),
      checkMcpSignal(db, now),
      checkWorker(db, now).catch(() => [unknownItem("worker", "mac_studio", "Worker", "Worker 상태 확인 중 오류가 발생했습니다.", SYSTEM_STATUS_GUIDANCE.databaseUnavailable)]),
    ]);
    databaseItems = tableResults;
    mcpItem = mcpResult;
    workerItems = workerResult;
  }

  const items = [...await hermesPromise, mcpItem, ...envItems, ...workerItems, ...databaseItems];
  const issueCount = items.filter((item) => item.level !== "ok").length;
  return {
    ok: true,
    checkedAt: now.toISOString(),
    issueCount,
    summary: issueCount === 0 ? "현재 확인된 시스템 이상이 없습니다." : `${issueCount}개 항목에 문제가 있거나 확인이 필요합니다.`,
    items,
  };
}

export const systemStatusInternals = { privateHermesAddress, relativeKorean, isMissingSchemaObject };
