import type { SystemStatusItem, SystemStatusReport } from "./types";
import type { StatusPanelData, StatusPanelEntry, StatusPanelLevel } from "./panelTypes";

export const STATUS_PANEL_STORAGE_KEY = "olivia.status-panel.sections.v1";

export type StatusPanelSectionKey = "myTurn" | "progress" | "connections" | "recent";
export type StatusPanelSectionState = Record<StatusPanelSectionKey, boolean>;

export const DEFAULT_STATUS_PANEL_SECTIONS: StatusPanelSectionState = {
  myTurn: true,
  progress: true,
  connections: false,
  recent: false,
};

const CONNECTION_IDS = new Set([
  "hermes_health",
  "hermes_address",
  "agent_engine",
  "mcp_tools",
  "worker",
  "nas_connection",
  "workstation_mount",
  "workstation_access",
  "agentstation_mount",
  "agentstation_access",
  "worker_openai_key",
  "worker_revision",
  "watcher_scan",
  "queued_jobs",
  "table_worker_events",
  "table_remote_workers",
  "table_remote_jobs",
  "table_photo_storage_projects",
]);

function itemLevel(item: SystemStatusItem): StatusPanelLevel {
  return item.level === "ok" ? "info" : item.level;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function entryArray(value: unknown): StatusPanelEntry[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is StatusPanelEntry => Boolean(recordValue(entry)) && typeof (entry as StatusPanelEntry).id === "string")
    : [];
}

function normalizeDiagnostics(value: unknown, checkedAt: string): SystemStatusReport {
  const source = recordValue(value);
  const items = Array.isArray(source?.items)
    ? source.items.filter((item): item is SystemStatusItem => Boolean(recordValue(item)) && typeof (item as SystemStatusItem).id === "string")
    : [];
  const issueCount = items.filter((item) => item.level !== "ok").length;
  return {
    ok: true,
    checkedAt: typeof source?.checkedAt === "string" ? source.checkedAt : checkedAt,
    issueCount,
    summary: typeof source?.summary === "string"
      ? source.summary
      : issueCount ? `${issueCount}개 항목을 확인할 수 없습니다.` : "상태 진단 결과가 없습니다.",
    items,
  };
}

/** API 일부 필드가 누락돼도 상태표시줄 렌더가 OS 전체로 예외를 전파하지 않게 한다. */
export function normalizeStatusPanelData(value: unknown): StatusPanelData {
  const source = recordValue(value);
  const checkedAt = typeof source?.checkedAt === "string" ? source.checkedAt : new Date().toISOString();
  return {
    ok: true,
    checkedAt,
    diagnostics: normalizeDiagnostics(source?.diagnostics, checkedAt),
    panelIssues: entryArray(source?.panelIssues),
    myTurn: entryArray(source?.myTurn),
    progress: entryArray(source?.progress),
    recentActivity: entryArray(source?.recentActivity).filter((entry) => entry.kind === "backup" || entry.kind === "remote_job") as StatusPanelData["recentActivity"],
  };
}

export function connectionStatusItems(items: SystemStatusItem[]) {
  return items.filter((item) => CONNECTION_IDS.has(item.id));
}

export function systemAttentionItems(data: StatusPanelData): StatusPanelEntry[] {
  const diagnostics = (data.diagnostics?.items ?? [])
    .filter((item) => item.level !== "ok")
    .map((item) => ({
      id: `diagnostic:${item.id}`,
      kind: "diagnostic",
      level: itemLevel(item),
      title: `${item.label} · ${item.state}`,
      detail: [item.detail, item.remedy].filter(Boolean).join(" · "),
      createdAt: data.checkedAt,
    }));
  const merged = new Map<string, StatusPanelEntry>();
  for (const entry of diagnostics) merged.set(entry.id, entry);
  for (const entry of data.panelIssues ?? []) merged.set(entry.id, entry);
  return [...merged.values()];
}

export function hasConnectionProblem(items: SystemStatusItem[]) {
  return connectionStatusItems(items).some((item) => item.level !== "ok");
}

export function retryableStatusIssueIds(data: StatusPanelData): string[] {
  const ids: string[] = [];
  const mcp = (data.diagnostics?.items ?? []).find((item) => item.id === "mcp_tools");
  if (mcp?.level === "unknown") ids.push("diagnostic:mcp_tools");
  if ((data.panelIssues ?? []).some((entry) => entry.id === "query:workflow-consistency")) {
    ids.push("query:workflow-consistency");
  }
  return ids;
}

export function parseStoredSectionState(raw: string | null): StatusPanelSectionState {
  if (!raw) return { ...DEFAULT_STATUS_PANEL_SECTIONS };
  try {
    const parsed = JSON.parse(raw) as Partial<Record<StatusPanelSectionKey, unknown>>;
    return {
      myTurn: typeof parsed.myTurn === "boolean" ? parsed.myTurn : true,
      progress: typeof parsed.progress === "boolean" ? parsed.progress : true,
      connections: typeof parsed.connections === "boolean" ? parsed.connections : false,
      recent: typeof parsed.recent === "boolean" ? parsed.recent : false,
    };
  } catch {
    return { ...DEFAULT_STATUS_PANEL_SECTIONS };
  }
}

export function resolveSectionState(raw: string | null, connectionProblem: boolean): StatusPanelSectionState {
  const stored = parseStoredSectionState(raw);
  return connectionProblem ? { ...stored, connections: true } : stored;
}

export type StatusPanelBadge = {
  tone: "red" | "orange" | "blue" | "none";
  count: number;
};

export function statusPanelBadge(input: {
  issues: StatusPanelEntry[];
  myTurnCount: number;
}): StatusPanelBadge {
  const redCount = input.issues.filter((item) => item.level === "error").length;
  if (redCount > 0) return { tone: "red", count: input.issues.length };
  const orangeCount = input.issues.filter((item) => item.level === "warning" || item.level === "unknown").length;
  if (orangeCount > 0) return { tone: "orange", count: input.issues.length };
  if (input.myTurnCount > 0) return { tone: "blue", count: input.myTurnCount };
  return { tone: "none", count: 0 };
}
