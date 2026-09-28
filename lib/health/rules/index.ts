import type { SupabaseClient } from "@supabase/supabase-js";
import { enforceCompletionClaims } from "@/lib/olivia/v2/completionClaimGuard";
import { executedToolsFromMetadata } from "@/lib/olivia/v2/executionEvidence";
import { hasClientDestructiveIntent, hasClientRegistrationIntent } from "@/lib/olivia/v2/mutationIntentGuard";
import { isRequiredToolChoiceCompatible } from "@/lib/olivia/v2/toolSelection";
import type { SystemStatusReport } from "@/lib/system-status/types";

export type HealthVerdict =
  | { state: "ok"; detail?: string; evidence?: unknown }
  | { state: "issue"; detail: string; remedy: string; evidence?: unknown }
  | { state: "unknown"; detail: string; evidence?: unknown };

export type HealthGroup = "mac_studio" | "chat" | "data" | "deploy";

export type HealthContext = {
  db: SupabaseClient;
  now: Date;
  diagnostics: SystemStatusReport;
  deployedRevision: string | null;
};

export type HealthRule = {
  id: string;
  label: string;
  group: HealthGroup;
  severity: "error" | "warning";
  check: (ctx: HealthContext) => Promise<HealthVerdict>;
};

type Row = Record<string, unknown>;
type RemoteWorkerRow = {
  last_seen_at?: string | null;
  openai_api_key_configured?: boolean | null;
  watcher_last_scan_at?: string | null;
  worker_rev?: string | null;
  worker_process_health?: unknown;
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;

function record(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function time(value: unknown): number | null {
  const valueMs = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(valueMs) ? valueMs : null;
}

function ageMs(value: unknown, now: Date): number | null {
  const valueMs = time(value);
  return valueMs === null ? null : Math.max(0, now.getTime() - valueMs);
}

function relativeAge(value: unknown, now: Date): string {
  const age = ageMs(value, now);
  if (age === null) return "시각 확인 불가";
  const minutes = Math.floor(age / MINUTE_MS);
  if (minutes < 1) return "1분 이내";
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

function issue(detail: string, remedy: string, evidence?: unknown): HealthVerdict {
  return { state: "issue", detail, remedy, evidence };
}

function unknown(detail: string, evidence?: unknown): HealthVerdict {
  return { state: "unknown", detail, evidence };
}

function configuredWorkerId(): string {
  return process.env.OLIVIA_WORKER_ID?.trim() || process.env.WORKER_ID?.trim() || "jake-macstudio-01";
}

function queryDb(ctx: HealthContext) {
  // The service-role database type intentionally varies between local and
  // deployed schemas. Rules validate every returned value at the boundary.
  return ctx.db as unknown as { from: (table: string) => any };
}

async function getWorker(ctx: HealthContext): Promise<{ row: RemoteWorkerRow | null; error: string | null }> {
  const { data, error } = await queryDb(ctx).from("remote_workers")
    .select("last_seen_at,openai_api_key_configured,watcher_last_scan_at,worker_rev,worker_process_health")
    .eq("worker_id", configuredWorkerId()).maybeSingle();
  return { row: data as RemoteWorkerRow | null, error: error?.message ?? null };
}

function processHealth(value: unknown): { restartCount: number; logBytes: number; observedAt: string | null } | null {
  const root = record(value);
  if (!root) return null;
  const processes = Array.isArray(root.processes) ? root.processes : [];
  let restartCount = 0;
  for (const process of processes) {
    const row = record(process);
    const count = Number(row?.restartEventsLast10m);
    if (Number.isFinite(count)) restartCount += Math.max(0, Math.floor(count));
  }
  const logBytes = Number(root.logBytes);
  return {
    restartCount,
    logBytes: Number.isFinite(logBytes) ? Math.max(0, Math.floor(logBytes)) : 0,
    observedAt: text(root.updatedAt),
  };
}

function completedClaimRows(rows: Array<{ id?: string; content?: string; metadata?: unknown }>) {
  return rows.flatMap((row) => {
    const verdict = enforceCompletionClaims({
      text: String(row.content ?? ""),
      executedTools: executedToolsFromMetadata(row.metadata),
    });
    return verdict.unsupported.length ? [{ id: row.id ?? "unknown", unsupported: verdict.unsupported }] : [];
  });
}

function metadataContains(value: unknown, pattern: RegExp): boolean {
  try {
    return pattern.test(JSON.stringify(value ?? {}));
  } catch {
    return false;
  }
}

export function hasRepeatedClientSuffix(name: string): boolean {
  return /(의원|병원|치과|내과|외과|클리닉|센터|연구소)\1+/i.test(name.replace(/\s+/g, ""));
}

const workerOpenAiKey: HealthRule = {
  id: "worker_openai_key", label: "Worker 씬 AI 키", group: "mac_studio", severity: "error",
  async check(ctx) {
    const { row, error } = await getWorker(ctx);
    if (error) return unknown(`Worker 진단을 조회하지 못했습니다: ${error}`);
    if (!row) return issue("Mac Studio Worker heartbeat가 없습니다.", "Mac Studio에서 OliviaWorker.app을 실행해 heartbeat를 보내세요.");
    if (row.openai_api_key_configured === true) return { state: "ok", detail: "OPENAI_API_KEY가 설정되어 있습니다." };
    if (row.openai_api_key_configured === false) return issue("Worker 씬 AI 키가 없습니다. 씬이 미분류로 나올 수 있습니다.", "Mac Studio의 ~/OliviaWorker/config/worker.env에 OPENAI_API_KEY를 설정하고 OliviaWorker를 재시작하세요.");
    return unknown("Worker가 씬 AI 키 상태를 아직 보고하지 않았습니다.");
  },
};

const workerScriptStale: HealthRule = {
  id: "worker_script_stale", label: "Worker 설치본 진단", group: "mac_studio", severity: "warning",
  async check(ctx) {
    const { row, error } = await getWorker(ctx);
    if (error) return unknown(`Worker 설치본 진단을 조회하지 못했습니다: ${error}`);
    if (!row) return unknown("Worker heartbeat가 없어 설치본 진단을 할 수 없습니다.");
    if (row.openai_api_key_configured !== null && row.openai_api_key_configured !== undefined) return { state: "ok", detail: "최신 worker.sh 진단 헤더를 보고하고 있습니다." };
    return issue("Worker가 최신 진단 헤더를 보내지 않습니다. 설치본이 구버전일 수 있습니다.", "Mac Studio에서 `cd ~/olivia-worker && git pull && ops/mac-studio/install-worker-bin.sh --restart`를 실행하세요.");
  },
};

const workerOffline: HealthRule = {
  id: "worker_offline", label: "Mac Studio Worker", group: "mac_studio", severity: "error",
  async check(ctx) {
    const { row, error } = await getWorker(ctx);
    if (error) return unknown(`Worker heartbeat를 조회하지 못했습니다: ${error}`);
    const age = ageMs(row?.last_seen_at, ctx.now);
    if (!row || age === null) return issue("Worker heartbeat가 없습니다.", "Mac Studio에서 OliviaWorker.app이 실행 중인지 확인하고 다시 시작하세요.");
    if (age > 2 * MINUTE_MS) return issue(`Worker heartbeat가 ${relativeAge(row.last_seen_at, ctx.now)}입니다.`, "Mac Studio에서 OliviaWorker.app과 네트워크 연결을 확인한 뒤 앱을 재시작하세요.", { lastSeenAt: row.last_seen_at });
    return { state: "ok", detail: `마지막 heartbeat ${relativeAge(row.last_seen_at, ctx.now)}` };
  },
};

const watcherStalled: HealthRule = {
  id: "watcher_stalled", label: "NAS 감지기", group: "mac_studio", severity: "error",
  async check(ctx) {
    const { row, error } = await getWorker(ctx);
    if (error) return unknown(`NAS 감지기 heartbeat를 조회하지 못했습니다: ${error}`);
    if (!row) return unknown("Worker heartbeat가 없어 NAS 감지기 상태를 확인할 수 없습니다.");
    const age = ageMs(row.watcher_last_scan_at, ctx.now);
    if (age === null || age > 5 * MINUTE_MS) return issue(`NAS 감지기 마지막 스캔이 ${relativeAge(row.watcher_last_scan_at, ctx.now)}입니다.`, "Mac Studio에서 OliviaWorker.app 로그와 nas-backup-watcher.ts를 확인한 뒤 OliviaWorker.app을 재시작하세요.", { watcherLastScanAt: row.watcher_last_scan_at ?? null });
    return { state: "ok", detail: `마지막 스캔 ${relativeAge(row.watcher_last_scan_at, ctx.now)}` };
  },
};

const processRestartStorm: HealthRule = {
  id: "process_restart_storm", label: "Worker 프로세스 재시작", group: "mac_studio", severity: "error",
  async check(ctx) {
    const { row, error } = await getWorker(ctx);
    if (error) return unknown(`Worker 프로세스 상태를 조회하지 못했습니다: ${error}`);
    const snapshot = processHealth(row?.worker_process_health);
    if (!snapshot) return unknown("OliviaWorker.app 프로세스 상태가 아직 보고되지 않았습니다.");
    if (snapshot.restartCount >= 5) return issue(`최근 10분 동안 Worker 하위 프로세스가 ${snapshot.restartCount}회 재시작했습니다.`, "Mac Studio에서 ~/OliviaWorker/logs/oliviaworker-app.log와 해당 stderr 로그를 확인하고 원인을 고친 뒤 OliviaWorker.app을 재시작하세요.", snapshot);
    return { state: "ok", detail: `최근 10분 재시작 ${snapshot.restartCount}회`, evidence: snapshot };
  },
};

const logGrowth: HealthRule = {
  id: "log_growth", label: "Worker 로그 증가", group: "mac_studio", severity: "warning",
  async check(ctx) {
    const { row, error } = await getWorker(ctx);
    if (error) return unknown(`Worker 로그 상태를 조회하지 못했습니다: ${error}`);
    const snapshot = processHealth(row?.worker_process_health);
    if (!snapshot || !snapshot.observedAt) return unknown("Worker 로그 용량 샘플이 아직 보고되지 않았습니다.");
    const { data: previous, error: previousError } = await queryDb(ctx).from("health_rule_metrics")
      .select("evidence,updated_at").eq("rule_id", "log_growth").maybeSingle();
    if (previousError) return unknown(`이전 로그 샘플을 조회하지 못했습니다: ${previousError.message}`);
    const previousEvidence = record(previous?.evidence);
    const previousBytes = Number(previousEvidence?.logBytes);
    const previousAt = time(previousEvidence?.baselineAt ?? previous?.updated_at);
    if (!Number.isFinite(previousBytes) || previousAt === null) {
      return unknown("Worker 로그 증가율의 첫 기준점을 저장했습니다. 24시간 뒤 다시 비교합니다.", { baselineBytes: snapshot.logBytes, baselineAt: snapshot.observedAt });
    }
    if (ctx.now.getTime() - previousAt < DAY_MS) {
      return { state: "ok", detail: "Worker 로그 증가율 기준점을 수집 중입니다.", evidence: previousEvidence };
    }
    const growth = snapshot.logBytes - previousBytes;
    const evidence = { baselineBytes: snapshot.logBytes, baselineAt: snapshot.observedAt, comparedBytes: previousBytes, comparedAt: new Date(previousAt).toISOString(), growthBytes: growth };
    if (growth > 100 * 1024 * 1024) return issue(`Worker 로그가 24시간 동안 ${(growth / 1024 / 1024).toFixed(1)}MB 증가했습니다.`, "Mac Studio에서 반복 오류를 먼저 수정한 뒤 ~/OliviaWorker/logs의 오래된 로그를 보관 또는 비우세요.", evidence);
    return { state: "ok", detail: `24시간 로그 증가 ${(Math.max(0, growth) / 1024 / 1024).toFixed(1)}MB`, evidence };
  },
};

const mcpConnection: HealthRule = {
  id: "mcp_connection", label: "Hermes MCP", group: "chat", severity: "error",
  async check(ctx) {
    const item = ctx.diagnostics.items.find((candidate) => candidate.id === "mcp_tools");
    if (!item) return unknown("Hermes MCP 진단 결과가 없습니다.");
    if (item.level === "ok") return { state: "ok", detail: item.detail || item.state };
    if (item.level === "unknown") return unknown(item.detail || "Hermes MCP 연결을 확인하지 못했습니다.");
    return issue(item.detail || "Hermes MCP 도구가 연결되지 않았습니다.", item.remedy || "Mac Studio에서 Hermes MCP 등록과 Gateway 재시작 상태를 확인하세요.");
  },
};

const queueBacklog: HealthRule = {
  id: "remote_queue_backlog", label: "원격 작업 큐", group: "mac_studio", severity: "warning",
  async check(ctx) {
    const { data, error, count } = await queryDb(ctx).from("remote_jobs").select("id,created_at", { count: "exact" }).eq("status", "QUEUED").order("created_at", { ascending: true }).limit(1);
    if (error) return unknown(`원격 작업 큐를 조회하지 못했습니다: ${error.message}`);
    const oldest = Array.isArray(data) ? data[0] : null;
    const queuedCount = Number(count ?? 0);
    const age = ageMs(oldest?.created_at, ctx.now);
    if ((queuedCount >= 20) || (age !== null && age > 10 * MINUTE_MS)) return issue(`원격 작업 ${queuedCount}개가 대기 중이며 가장 오래된 작업은 ${relativeAge(oldest?.created_at, ctx.now)}입니다.`, "Mac Studio Worker가 online인지 확인하고, 멈춘 작업은 사진작업실에서 대상별 상태를 확인하세요.", { count: queuedCount, oldestCreatedAt: oldest?.created_at ?? null });
    return { state: "ok", detail: `대기 작업 ${queuedCount}개` };
  },
};

const falseCompletionClaim: HealthRule = {
  id: "false_completion_claim", label: "근거 없는 완료 주장", group: "chat", severity: "error",
  async check(ctx) {
    const since = new Date(ctx.now.getTime() - DAY_MS).toISOString();
    const { data, error } = await queryDb(ctx).from("olivia_chat_messages")
      .select("id,content,metadata").eq("role", "assistant").gte("created_at", since).order("created_at", { ascending: false }).limit(500);
    if (error) return unknown(`채팅 실행 장부를 조회하지 못했습니다: ${error.message}`);
    const findings = completedClaimRows((data ?? []) as Array<{ id?: string; content?: string; metadata?: unknown }>);
    if (!findings.length) return { state: "ok", detail: "최근 24시간 근거 없는 완료 주장이 없습니다." };
    return issue(`최근 24시간 완료 주장 ${findings.length}건에 성공 도구 근거가 없습니다.`, "해당 채팅 turn의 실행 장부와 응답을 확인하세요. 재실행 전 실제 대상 상태를 먼저 조회하세요.", { messageIds: findings.slice(0, 20) });
  },
};

const forcedToolMismatch: HealthRule = {
  id: "forced_tool_mismatch", label: "강제 도구 의도 불일치", group: "chat", severity: "error",
  async check(ctx) {
    const since = new Date(ctx.now.getTime() - DAY_MS).toISOString();
    const { data: assistantRows, error } = await queryDb(ctx).from("olivia_chat_messages")
      .select("id,parent_message_id,metadata").eq("role", "assistant").gte("created_at", since).not("parent_message_id", "is", null).limit(500);
    if (error) return unknown(`강제 도구 실행 장부를 조회하지 못했습니다: ${error.message}`);
    const parentIds = (assistantRows ?? []).map((row: Row) => text(row.parent_message_id)).filter((id: string | null): id is string => Boolean(id));
    if (!parentIds.length) return { state: "ok", detail: "검사할 실행 대화가 없습니다." };
    const { data: userRows, error: userError } = await queryDb(ctx).from("olivia_chat_messages").select("id,content").in("id", parentIds);
    if (userError) return unknown(`원문 요청을 조회하지 못했습니다: ${userError.message}`);
    const userById = new Map<string, string>((userRows ?? []).map((row: Row): [string, string] => [String(row.id), String(row.content ?? "")]));
    const mismatches: string[] = [];
    for (const assistant of (assistantRows ?? []) as Row[]) {
      const userMessage = userById.get(String(assistant.parent_message_id)) ?? "";
      const metadata = record(assistant.metadata);
      const forced = text(metadata?.requiredFollowupTool);
      const tools = executedToolsFromMetadata(metadata);
      const createsClient = tools.some((tool) => tool.success && tool.name === "client_create");
      if ((forced && !isRequiredToolChoiceCompatible(userMessage, forced)) || (createsClient && hasClientDestructiveIntent(userMessage)) || (tools.some((tool) => tool.name === "client_archive") && hasClientRegistrationIntent(userMessage))) mismatches.push(String(assistant.id));
    }
    if (!mismatches.length) return { state: "ok", detail: "강제 도구와 요청 동사의 불일치가 없습니다." };
    return issue(`강제 도구와 요청 동사가 어긋난 turn ${mismatches.length}건을 찾았습니다.`, "해당 채팅의 원문·도구 장부를 확인하고, 반대 mutation은 실행하지 마세요.", { messageIds: mismatches.slice(0, 20) });
  },
};

const executionUnverified: HealthRule = {
  id: "execution_unverified", label: "미검증 실행", group: "chat", severity: "warning",
  async check(ctx) {
    const since = new Date(ctx.now.getTime() - DAY_MS).toISOString();
    const [messagesResult, jobsResult] = await Promise.all([
      queryDb(ctx).from("olivia_chat_messages").select("id,created_at,metadata").eq("role", "assistant").gte("created_at", since).limit(500),
      queryDb(ctx).from("remote_jobs").select("id,action,created_at,payload").gte("created_at", since).limit(500),
    ]);
    if (messagesResult.error || jobsResult.error) return unknown(`미검증 실행을 조회하지 못했습니다: ${messagesResult.error?.message || jobsResult.error?.message}`);
    const jobs = jobsResult.data ?? [];
    const suspected = (messagesResult.data ?? []).flatMap((message: Row) => {
      const calls = Array.isArray(record(message.metadata)?.toolCalls) ? record(message.metadata)?.toolCalls as unknown[] : [];
      const hasUnverifiedPhotoCall = calls.some((call) => {
        const row = record(call);
        return text(row?.name)?.includes("photo") && record(row?.verification)?.executed === false;
      });
      if (!hasUnverifiedPhotoCall) return [];
      const createdAt = time(message.created_at);
      const hasRelatedJob = createdAt !== null && jobs.some((job: Row) => {
        const jobAt = time(job.created_at);
        return jobAt !== null && jobAt >= createdAt && jobAt <= createdAt + 5 * MINUTE_MS;
      });
      return hasRelatedJob ? [String(message.id)] : [];
    });
    if (!suspected.length) return { state: "ok", detail: "미검증 응답과 실제 원격 잡의 충돌이 없습니다." };
    return issue(`실행되지 않았다고 기록한 turn 뒤에 원격 잡이 생성된 사례 ${suspected.length}건이 있습니다.`, "사진 작업을 다시 실행하기 전에 해당 폴더의 현재 job 상태를 먼저 조회하세요.", { messageIds: suspected.slice(0, 20) });
  },
};

const hermesTimeoutRate: HealthRule = {
  id: "hermes_timeout_rate", label: "Hermes 타임아웃", group: "chat", severity: "warning",
  async check(ctx) {
    const since = new Date(ctx.now.getTime() - DAY_MS).toISOString();
    const { data, error } = await queryDb(ctx).from("olivia_chat_messages").select("id,metadata").eq("role", "assistant").gte("created_at", since).limit(500);
    if (error) return unknown(`Hermes 타임아웃 기록을 조회하지 못했습니다: ${error.message}`);
    const ids = (data ?? []).filter((row: Row) => metadataContains(row.metadata, /total_timeout|전체 처리 시간이 초과/i)).map((row: Row) => String(row.id));
    if (ids.length < 3) return { state: "ok", detail: `최근 24시간 Hermes total timeout ${ids.length}회` };
    return issue(`최근 24시간 Hermes total timeout이 ${ids.length}회 발생했습니다.`, "Hermes Gateway 로그에서 지연 구간과 MCP 도구 호출 수를 확인하세요. 명령 요청은 legacy 직결 경로를 사용해야 합니다.", { messageIds: ids.slice(0, 20) });
  },
};

const duplicateDocuments: HealthRule = {
  id: "duplicate_documents", label: "중복 문서", group: "data", severity: "warning",
  async check(ctx) {
    const { data, error } = await queryDb(ctx).from("quotes").select("id,client_id,title,hospital_name,created_at").order("created_at", { ascending: false }).limit(2_000);
    if (error) return unknown(`견적 문서를 조회하지 못했습니다: ${error.message}`);
    const groups = new Map<string, string[]>();
    for (const row of data ?? []) {
      const title = text(row.title) || text(row.hospital_name) || "";
      const clientId = text(row.client_id) || text(row.hospital_name) || "unlinked";
      if (!title) continue;
      const key = `${clientId}:${title}`;
      groups.set(key, [...(groups.get(key) ?? []), String(row.id)]);
    }
    const duplicates = [...groups.entries()].filter(([, ids]) => ids.length >= 3).map(([key, ids]) => ({ key, count: ids.length, ids: ids.slice(0, 20) }));
    if (!duplicates.length) return { state: "ok", detail: "같은 고객·제목의 문서 3건 이상 중복이 없습니다." };
    return issue(`같은 고객·제목의 견적 문서가 3건 이상인 묶음 ${duplicates.length}개가 있습니다.`, "고객관리에서 실제 최신 문서를 남기고 중복 초안은 보관 또는 삭제하세요.", { duplicates: duplicates.slice(0, 20) });
  },
};

const nameSuffixRepeat: HealthRule = {
  id: "name_suffix_repeat", label: "고객명 접미사 중복", group: "data", severity: "error",
  async check(ctx) {
    const { data, error } = await queryDb(ctx).from("clients").select("id,hospital_name").limit(2_000);
    if (error) return unknown(`고객명을 조회하지 못했습니다: ${error.message}`);
    const names = (data ?? []).filter((row: Row) => hasRepeatedClientSuffix(String(row.hospital_name ?? ""))).map((row: Row) => ({ id: String(row.id), name: String(row.hospital_name) }));
    if (!names.length) return { state: "ok", detail: "반복 접미사 고객명이 없습니다." };
    return issue(`반복 접미사 고객명 ${names.length}건을 찾았습니다.`, "고객관리에서 잘못 생성된 고객인지 확인한 뒤, 연결된 문서·워크플로를 검토하고 수동으로 정리하세요.", { clients: names.slice(0, 50) });
  },
};

const orphanWorkflow: HealthRule = {
  id: "orphan_workflow", label: "고아 워크플로", group: "data", severity: "error",
  async check(ctx) {
    const { data: runs, error } = await queryDb(ctx).from("workflow_runs").select("id,client_id").not("client_id", "is", null).limit(2_000);
    if (error) return unknown(`워크플로를 조회하지 못했습니다: ${error.message}`);
    const ids = [...new Set((runs ?? []).map((run: Row) => text(run.client_id)).filter((id: string | null): id is string => Boolean(id)))];
    if (!ids.length) return { state: "ok", detail: "연결된 워크플로가 없습니다." };
    const { data: clients, error: clientsError } = await queryDb(ctx).from("clients").select("id").in("id", ids);
    if (clientsError) return unknown(`워크플로 고객을 조회하지 못했습니다: ${clientsError.message}`);
    const existing = new Set((clients ?? []).map((client: Row) => String(client.id)));
    const orphanIds = (runs ?? []).filter((run: Row) => !existing.has(String(run.client_id))).map((run: Row) => String(run.id));
    if (!orphanIds.length) return { state: "ok", detail: "고아 워크플로가 없습니다." };
    return issue(`고객 행이 없는 워크플로 ${orphanIds.length}건을 찾았습니다.`, "해당 workflow_run의 원래 고객을 복구하거나, 고객관리에서 연결 상태를 수동으로 정리하세요.", { workflowRunIds: orphanIds.slice(0, 50) });
  },
};

const migrationMissing: HealthRule = {
  id: "migration_missing", label: "미적용 migration", group: "deploy", severity: "error",
  async check(ctx) {
    const missing = ctx.diagnostics.items.filter((item) => item.level !== "ok" && item.migration);
    if (!missing.length) return { state: "ok", detail: "상태 진단이 요구하는 migration이 모두 적용되어 있습니다." };
    const migrations = missing.map((item) => item.migration).filter((value): value is string => Boolean(value));
    return issue(`미적용 또는 확인 불가 migration ${migrations.length}개가 있습니다: ${migrations.join(", ")}`, "상태표시줄의 ‘적용 안 된 SQL’ 항목에서 SQL 원문을 복사해 Supabase SQL Editor에 적용하세요.", { migrations });
  },
};

const workerRevisionMismatch: HealthRule = {
  id: "worker_rev_mismatch", label: "Worker revision", group: "deploy", severity: "warning",
  async check(ctx) {
    const { row, error } = await getWorker(ctx);
    if (error) return unknown(`Worker revision을 조회하지 못했습니다: ${error}`);
    const workerRevision = text(row?.worker_rev)?.toLowerCase() ?? null;
    if (!ctx.deployedRevision) return unknown("서버 배포 revision을 확인할 수 없어 Worker와 비교할 수 없습니다.");
    if (!workerRevision) return issue("Worker가 설치 revision을 보고하지 않습니다.", "Mac Studio에서 `cd ~/olivia-worker && git pull && ops/mac-studio/install-worker-bin.sh --restart`를 실행하세요.");
    if (workerRevision !== ctx.deployedRevision) return issue(`Worker ${workerRevision.slice(0, 12)}와 서버 ${ctx.deployedRevision.slice(0, 12)} revision이 다릅니다.`, "Mac Studio에서 `cd ~/olivia-worker && git pull && ops/mac-studio/install-worker-bin.sh --restart`를 실행하세요. Swift 앱 변경분이면 build-and-install.sh도 실행하세요.", { workerRevision, deployedRevision: ctx.deployedRevision });
    return { state: "ok", detail: `Worker와 서버 revision ${workerRevision.slice(0, 12)}가 같습니다.` };
  },
};

/** All self-health rules live in this one directory. A new rule only needs to
 * be added here with its label, severity, query, and concrete remedy. */
export const HEALTH_RULES: readonly HealthRule[] = [
  workerOpenAiKey, workerScriptStale, workerOffline, watcherStalled, processRestartStorm, logGrowth, queueBacklog,
  mcpConnection, falseCompletionClaim, forcedToolMismatch, executionUnverified, hermesTimeoutRate,
  duplicateDocuments, nameSuffixRepeat, orphanWorkflow, migrationMissing, workerRevisionMismatch,
];

export function healthRuleById(id: string): HealthRule | undefined {
  return HEALTH_RULES.find((rule) => rule.id === id);
}
