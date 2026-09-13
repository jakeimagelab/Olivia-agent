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

export function isAuthorizedWorker(request: NextRequest): boolean {
  const expectedToken = process.env.OLIVIA_WORKER_TOKEN?.trim();
  if (!expectedToken) return false;

  const auth = request.headers.get("authorization") || "";
  const workerId = request.headers.get("x-olivia-worker") || "";

  if (!auth.startsWith("Bearer ")) return false;

  const suppliedToken = auth.slice(7).trim();

  return (
    workerId === getConfiguredWorkerId() &&
    safeEqual(suppliedToken, expectedToken)
  );
}
