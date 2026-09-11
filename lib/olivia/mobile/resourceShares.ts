import { createHmac, timingSafeEqual } from "node:crypto";
import type { MobileResourceType } from "./navigation";

export const MOBILE_RESOURCE_SHARE_DAYS = 7;
const SHAREABLE_TYPES = new Set<MobileResourceType>(["quote", "contract"]);

function signingKey() {
  const key = process.env.TEMPORARY_DOCUMENT_SHARE_SECRET
    || process.env.INTERNAL_API_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("미리보기 링크 서명 키가 없습니다.");
  return key;
}

function signature(payload: string) {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function createMobileResourceShareToken(resourceType: MobileResourceType, resourceId: string, nowMs = Date.now()) {
  if (!SHAREABLE_TYPES.has(resourceType) || !resourceId) throw new Error("공유할 수 없는 문서입니다.");
  const expiresAtMs = nowMs + MOBILE_RESOURCE_SHARE_DAYS * 86_400_000;
  const payload = Buffer.from(JSON.stringify({ t: resourceType, i: resourceId, e: expiresAtMs }), "utf8").toString("base64url");
  return { token: `${payload}.${signature(payload)}`, expiresAt: new Date(expiresAtMs).toISOString() };
}

export function verifyMobileResourceShareToken(token: string) {
  const [payload, provided] = token.split(".");
  if (!payload || !provided) return null;
  const expected = signature(payload);
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { t?: unknown; i?: unknown; e?: unknown };
    if (typeof value.t !== "string" || !SHAREABLE_TYPES.has(value.t as MobileResourceType)) return null;
    if (typeof value.i !== "string" || !value.i || typeof value.e !== "number" || value.e <= Date.now()) return null;
    return { resourceType: value.t as "quote" | "contract", resourceId: value.i, expiresAt: new Date(value.e).toISOString() };
  } catch {
    return null;
  }
}

