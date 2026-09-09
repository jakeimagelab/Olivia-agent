import { timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function authorizeHermesToolRequest(request: Request): "ok" | "missing_config" | "unauthorized" {
  const expected = process.env.HERMES_TOOL_SHARED_SECRET?.trim();
  if (!expected) return "missing_config";
  const authorization = request.headers.get("authorization") ?? "";
  const actual = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return actual && safeEqual(actual, expected) ? "ok" : "unauthorized";
}
