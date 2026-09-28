import type { WorkerDiagnosticSnapshot, WorkerWatcherProgress } from "./types";

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

function optionalRevision(value: string | null): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[0-9a-f]{7,64}$/.test(normalized) ? normalized : undefined;
}

function optionalWatcherProgress(value: string | null): WorkerWatcherProgress | undefined {
  if (!value || value.length > 12_000) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8")) as Record<string, unknown>;
    const scannedAt = optionalIsoDate(typeof parsed.scannedAt === "string" ? parsed.scannedAt : null);
    const sourceStatus = parsed.sourceStatus === "ONLINE" || parsed.sourceStatus === "SOURCE_OFFLINE"
      ? parsed.sourceStatus
      : undefined;
    if (parsed.version !== 1 || !scannedAt || !sourceStatus || !Array.isArray(parsed.stabilizing)) return undefined;
    const stabilizing = parsed.stabilizing.slice(0, 10).flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const row = value as Record<string, unknown>;
      const projectName = typeof row.projectName === "string" ? row.projectName.trim().slice(0, 255) : "";
      const elapsedSeconds = typeof row.elapsedSeconds === "number" && Number.isFinite(row.elapsedSeconds)
        ? Math.max(0, Math.floor(row.elapsedSeconds))
        : null;
      const targetSeconds = typeof row.targetSeconds === "number" && Number.isFinite(row.targetSeconds)
        ? Math.max(1, Math.floor(row.targetSeconds))
        : null;
      return projectName && elapsedSeconds !== null && targetSeconds !== null
        ? [{ projectName, elapsedSeconds: Math.min(elapsedSeconds, targetSeconds), targetSeconds }]
        : [];
    });
    return { version: 1, scannedAt, sourceStatus, stabilizing };
  } catch {
    return undefined;
  }
}

function optionalWorkerProcessHealth(value: string | null): Record<string, unknown> | undefined {
  if (!value || value.length > 12_000) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const row = parsed as Record<string, unknown>;
    if (typeof row.updatedAt !== "string" || !Number.isFinite(new Date(row.updatedAt).getTime())) return undefined;
    if (!Array.isArray(row.processes)) return undefined;
    return row;
  } catch {
    return undefined;
  }
}

export function readWorkerDiagnostics(headers: Headers): Partial<WorkerDiagnosticSnapshot> {
  const workstationMounted = optionalBoolean(headers.get("x-olivia-workstation-mounted"));
  const workstationAccessible = optionalBoolean(headers.get("x-olivia-workstation-accessible"));
  const agentstationMounted = optionalBoolean(headers.get("x-olivia-agentstation-mounted"));
  const agentstationAccessible = optionalBoolean(headers.get("x-olivia-agentstation-accessible"));
  const watcherLastScanAt = optionalIsoDate(headers.get("x-olivia-photo-watcher-last-scan-at"));
  const watcherProgress = optionalWatcherProgress(headers.get("x-olivia-photo-watcher-progress"));
  const openAiApiKeyConfigured = optionalBoolean(headers.get("x-olivia-openai-api-key-configured"));
  const workerRevision = optionalRevision(headers.get("x-olivia-worker-rev"));
  const workerInstalledAt = optionalIsoDate(headers.get("x-olivia-worker-installed-at"));
  const workerProcessHealth = optionalWorkerProcessHealth(headers.get("x-olivia-worker-process-health"));

  return {
    ...(workstationMounted === undefined ? {} : { workstationMounted }),
    ...(workstationAccessible === undefined ? {} : { workstationAccessible }),
    ...(agentstationMounted === undefined ? {} : { agentstationMounted }),
    ...(agentstationAccessible === undefined ? {} : { agentstationAccessible }),
    ...(watcherLastScanAt === undefined ? {} : { watcherLastScanAt }),
    ...(watcherProgress === undefined ? {} : { watcherProgress }),
    ...(openAiApiKeyConfigured === undefined ? {} : { openAiApiKeyConfigured }),
    ...(workerRevision === undefined ? {} : { workerRevision }),
    ...(workerInstalledAt === undefined ? {} : { workerInstalledAt }),
    ...(workerProcessHealth === undefined ? {} : { workerProcessHealth }),
  };
}

export function workerDiagnosticsToRow(snapshot: Partial<WorkerDiagnosticSnapshot>): Record<string, unknown> {
  return {
    ...(snapshot.workstationMounted === undefined ? {} : { workstation_mounted: snapshot.workstationMounted }),
    ...(snapshot.workstationAccessible === undefined ? {} : { workstation_accessible: snapshot.workstationAccessible }),
    ...(snapshot.agentstationMounted === undefined ? {} : { agentstation_mounted: snapshot.agentstationMounted }),
    ...(snapshot.agentstationAccessible === undefined ? {} : { agentstation_accessible: snapshot.agentstationAccessible }),
    ...(snapshot.watcherLastScanAt === undefined ? {} : { watcher_last_scan_at: snapshot.watcherLastScanAt }),
    ...(snapshot.watcherProgress === undefined ? {} : { watcher_progress: snapshot.watcherProgress }),
    ...(snapshot.openAiApiKeyConfigured === undefined ? {} : { openai_api_key_configured: snapshot.openAiApiKeyConfigured }),
    ...(snapshot.workerRevision === undefined ? {} : { worker_rev: snapshot.workerRevision }),
    ...(snapshot.workerInstalledAt === undefined ? {} : { worker_installed_at: snapshot.workerInstalledAt }),
    ...(snapshot.workerProcessHealth === undefined ? {} : { worker_process_health: snapshot.workerProcessHealth }),
  };
}
