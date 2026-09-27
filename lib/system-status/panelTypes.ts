import type { SystemStatusReport } from "./types";

export type StatusPanelLevel = "info" | "warning" | "error" | "unknown";

export type StatusPanelEntry = {
  id: string;
  kind: string;
  level: StatusPanelLevel;
  title: string;
  detail?: string;
  href?: string;
  clientId?: string | null;
  workflowRunId?: string | null;
  projectId?: string | null;
  createdAt?: string | null;
  progressPercent?: number | null;
};

export type StatusPanelRecentEntry = {
  id: string;
  kind: "backup" | "remote_job";
  title: string;
  detail: string;
  level: StatusPanelLevel;
  href: string;
  createdAt: string;
};

export type StatusPanelData = {
  ok: true;
  checkedAt: string;
  diagnostics: SystemStatusReport;
  panelIssues: StatusPanelEntry[];
  myTurn: StatusPanelEntry[];
  progress: StatusPanelEntry[];
  recentActivity: StatusPanelRecentEntry[];
};
