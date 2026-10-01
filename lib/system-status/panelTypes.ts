import type { SystemStatusReport } from "./types";
import type { RemoteJobProgress } from "@/lib/remote-jobs/progress";

export type StatusPanelLevel = "info" | "warning" | "error" | "unknown";

export type StatusPanelAction = {
  id: string;
  label: string;
  kind: "api" | "copy" | "open" | "external";
  endpoint?: string;
  method?: "POST";
  body?: Record<string, unknown>;
  href?: string;
  value?: string;
  tone?: "primary" | "secondary" | "danger";
  auto?: boolean;
};

export type StatusPanelRemoteJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";
  message: string | null;
  error: string | null;
  progress: RemoteJobProgress | null;
  cancelRequested?: boolean;
};

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
  actions?: StatusPanelAction[];
  remoteJob?: StatusPanelRemoteJob | null;
};

export type StatusPanelRecentEntry = StatusPanelEntry & {
  kind: "backup" | "remote_job";
  detail: string;
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
