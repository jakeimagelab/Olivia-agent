import type { SystemStatusItem } from "./types";
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

export function connectionStatusItems(items: SystemStatusItem[]) {
  return items.filter((item) => CONNECTION_IDS.has(item.id));
}

export function systemAttentionItems(data: StatusPanelData): StatusPanelEntry[] {
  const diagnostics = data.diagnostics.items
    .filter((item) => item.level !== "ok")
    .map((item) => ({
      id: `diagnostic:${item.id}`,
      kind: "diagnostic",
      level: itemLevel(item),
      title: `${item.label} · ${item.state}`,
      detail: [item.detail, item.remedy].filter(Boolean).join(" · "),
    }));
  return [...diagnostics, ...data.panelIssues];
}

export function hasConnectionProblem(items: SystemStatusItem[]) {
  return connectionStatusItems(items).some((item) => item.level !== "ok");
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
