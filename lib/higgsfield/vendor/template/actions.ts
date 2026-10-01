"use client";

import type { StatusResult } from "./platform";

/** Olivia bridge for the official app-template poller. Higgsfield credentials
 * never reach this module; it only calls Olivia's authenticated status route. */
export async function getGenerationStatuses(data: unknown): Promise<StatusResult[]> {
  const response = await fetch("/api/higgsfield/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await response.json().catch(() => null) as { ok?: unknown; statuses?: unknown; error?: unknown } | null;
  if (!response.ok || !payload?.ok || !Array.isArray(payload.statuses)) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "생성 상태를 확인하지 못했습니다.");
  }
  return payload.statuses.flatMap((item): StatusResult[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const requestId = typeof record.requestId === "string" ? record.requestId : "";
    if (!requestId) return [];
    if (typeof record.providerError === "string" && record.status === "failed") return [{ requestId, error: record.providerError }];
    return [{
      requestId,
      status: {
        requestId,
        status: typeof record.status === "string" ? record.status : "unknown",
        ...(typeof record.videoUrl === "string" ? { video: { url: record.videoUrl } } : {}),
        ...(typeof record.providerError === "string" ? { error: record.providerError } : {}),
      },
    }];
  });
}
