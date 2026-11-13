import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PublicSelectionRequestError } from "./publicSelectionValidation";

export function publicSelectionRateLimitKey(input: {
  token: string;
  action: string;
  ip?: string | null;
}) {
  return createHash("sha256")
    .update(`${input.action}\n${input.token}\n${input.ip || "unknown"}`)
    .digest("hex");
}

export function publicRequestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || null;
}

const OWNED_IMAGE_LOOKUP_CHUNK = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getOwnedSelectionImageIds(
  db: SupabaseClient,
  scope: { table: string; ownerColumn: string; ownerId: string },
  body: unknown,
) {
  const rawItems = body && typeof body === "object" && !Array.isArray(body)
    ? ((body as Record<string, unknown>).items ?? (body as Record<string, unknown>).diffs)
    : null;
  const requested = [...new Set((Array.isArray(rawItems) ? rawItems : []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const imageId = (item as Record<string, unknown>).imageId;
    return typeof imageId === "string" && UUID_PATTERN.test(imageId.trim()) ? [imageId.trim()] : [];
  }))];
  const owned = new Set<string>();
  for (let index = 0; index < requested.length; index += OWNED_IMAGE_LOOKUP_CHUNK) {
    const chunk = requested.slice(index, index + OWNED_IMAGE_LOOKUP_CHUNK);
    const { data, error } = await db.from(scope.table)
      .select("id")
      .eq(scope.ownerColumn, scope.ownerId)
      .in("id", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id: unknown }>) owned.add(String(row.id));
  }
  return owned;
}

export async function enforcePublicSelectionRateLimit(input: {
  db: SupabaseClient;
  request: Request;
  token: string;
  action: string;
  limit: number;
  windowSeconds?: number;
  identityOnly?: boolean;
}) {
  const keyHash = publicSelectionRateLimitKey({
    token: input.token,
    action: input.action,
    ip: input.identityOnly ? null : publicRequestIp(input.request),
  });
  const { data, error } = await input.db.rpc("consume_select_public_rate_limit", {
    p_key_hash: keyHash,
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds ?? 60,
  });
  if (error) throw error;
  if (data !== true) throw new PublicSelectionRequestError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
}
