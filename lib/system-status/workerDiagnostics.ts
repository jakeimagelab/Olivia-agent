import type { WorkerDiagnosticSnapshot } from "./types";

function optionalBoolean(value: string | null): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function optionalIsoDate(value: string | null): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function readWorkerDiagnostics(headers: Headers): Partial<WorkerDiagnosticSnapshot> {
  const workstationMounted = optionalBoolean(headers.get("x-olivia-workstation-mounted"));
  const workstationAccessible = optionalBoolean(headers.get("x-olivia-workstation-accessible"));
  const agentstationMounted = optionalBoolean(headers.get("x-olivia-agentstation-mounted"));
  const agentstationAccessible = optionalBoolean(headers.get("x-olivia-agentstation-accessible"));
  const watcherLastScanAt = optionalIsoDate(headers.get("x-olivia-photo-watcher-last-scan-at"));
  const openAiApiKeyConfigured = optionalBoolean(headers.get("x-olivia-openai-api-key-configured"));

  return {
    ...(workstationMounted === undefined ? {} : { workstationMounted }),
    ...(workstationAccessible === undefined ? {} : { workstationAccessible }),
    ...(agentstationMounted === undefined ? {} : { agentstationMounted }),
    ...(agentstationAccessible === undefined ? {} : { agentstationAccessible }),
    ...(watcherLastScanAt === undefined ? {} : { watcherLastScanAt }),
    ...(openAiApiKeyConfigured === undefined ? {} : { openAiApiKeyConfigured }),
  };
}

export function workerDiagnosticsToRow(snapshot: Partial<WorkerDiagnosticSnapshot>): Record<string, unknown> {
  return {
    ...(snapshot.workstationMounted === undefined ? {} : { workstation_mounted: snapshot.workstationMounted }),
    ...(snapshot.workstationAccessible === undefined ? {} : { workstation_accessible: snapshot.workstationAccessible }),
    ...(snapshot.agentstationMounted === undefined ? {} : { agentstation_mounted: snapshot.agentstationMounted }),
    ...(snapshot.agentstationAccessible === undefined ? {} : { agentstation_accessible: snapshot.agentstationAccessible }),
    ...(snapshot.watcherLastScanAt === undefined ? {} : { watcher_last_scan_at: snapshot.watcherLastScanAt }),
    ...(snapshot.openAiApiKeyConfigured === undefined ? {} : { openai_api_key_configured: snapshot.openAiApiKeyConfigured }),
  };
}
