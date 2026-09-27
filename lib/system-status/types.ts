export type SystemStatusGroup = "cloud" | "mac_studio" | "database";

export type SystemStatusLevel = "ok" | "warning" | "error" | "unknown";

export type SystemStatusItem = {
  id: string;
  group: SystemStatusGroup;
  label: string;
  level: SystemStatusLevel;
  state: string;
  detail?: string;
  remedy?: string;
  toolCount?: number;
  migration?: string;
};

export type SystemStatusReport = {
  ok: true;
  checkedAt: string;
  issueCount: number;
  summary: string;
  items: SystemStatusItem[];
};

export type WorkerDiagnosticSnapshot = {
  workstationMounted: boolean | null;
  workstationAccessible: boolean | null;
  agentstationMounted: boolean | null;
  agentstationAccessible: boolean | null;
  watcherLastScanAt: string | null;
  watcherProgress: WorkerWatcherProgress | null;
  openAiApiKeyConfigured: boolean | null;
  workerRevision: string | null;
  workerInstalledAt: string | null;
};

export type WorkerWatcherProgress = {
  version: 1;
  scannedAt: string;
  sourceStatus: "ONLINE" | "SOURCE_OFFLINE";
  stabilizing: Array<{
    projectName: string;
    elapsedSeconds: number;
    targetSeconds: number;
  }>;
};
