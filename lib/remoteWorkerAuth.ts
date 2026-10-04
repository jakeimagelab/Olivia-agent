import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);

  if (aa.length !== bb.length) return false;

  return timingSafeEqual(aa, bb);
}

export function getConfiguredWorkerId(): string {
  return process.env.OLIVIA_WORKER_ID?.trim() || "jake-macstudio-01";
}

export function listConfiguredWorkerIds(): string[] {
  const configured = process.env.OLIVIA_WORKER_IDS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const workerIds = configured?.length ? configured : [getConfiguredWorkerId()];
  const primaryWorkerId = getConfiguredWorkerId();
  return Array.from(new Set([primaryWorkerId, ...workerIds]));
}

export function isKnownWorkerId(workerId: string): boolean {
  return listConfiguredWorkerIds().includes(workerId.trim());
}

function workerToken(workerId: string): string | null {
  const configuredTokens = process.env.OLIVIA_WORKER_TOKENS_JSON?.trim();
  if (configuredTokens) {
    try {
      const parsed: unknown = JSON.parse(configuredTokens);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const value = (parsed as Record<string, unknown>)[workerId];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    } catch {
      // A malformed optional map must not break the existing shared-token deployment.
    }
  }
  return process.env.OLIVIA_WORKER_TOKEN?.trim() || null;
}

export function authorizeWorker(request: NextRequest): string | null {
  const workerId = request.headers.get("x-olivia-worker")?.trim() || "";
  if (!workerId || !isKnownWorkerId(workerId)) return null;

  const expectedToken = workerToken(workerId);
  if (!expectedToken) return null;

  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;

  const suppliedToken = auth.slice(7).trim();
  return safeEqual(suppliedToken, expectedToken) ? workerId : null;
}

/** @deprecated Prefer authorizeWorker() so authorization and worker identity cannot diverge. */
export function isAuthorizedWorker(request: NextRequest): boolean {
  return authorizeWorker(request) !== null;
}
