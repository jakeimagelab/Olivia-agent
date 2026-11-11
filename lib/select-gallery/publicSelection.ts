import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PUBLIC_SELECTION_JSON_LIMIT = 1_000_000;
export const PUBLIC_SELECTION_MAX_ITEMS = 10_000;
export const PUBLIC_SELECTION_IMAGE_MEMO_LIMIT = 1_000;
export const PUBLIC_SELECTION_CUSTOMER_MEMO_LIMIT = 5_000;

export type PublicSelectionItemInput = {
  imageId: string;
  rating: number | null;
  colorLabel: number | null;
  memo: string;
};

export type PublicSelectionDraftInput = {
  revision: number;
  items: PublicSelectionItemInput[];
  customerMemo: string;
};

export type PublicSelectionSubmitInput = PublicSelectionDraftInput & {
  requestKey: string;
};

export class PublicSelectionRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "PublicSelectionRequestError";
  }
}

export async function readPublicSelectionJson(
  request: Request,
  maxBytes = PUBLIC_SELECTION_JSON_LIMIT,
) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new PublicSelectionRequestError("요청이 너무 큽니다.", 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new PublicSelectionRequestError("요청이 너무 큽니다.", 413);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PublicSelectionRequestError("요청 형식이 올바르지 않습니다.");
  }
}

function parseItems(value: unknown, allowedImageIds: ReadonlySet<string>) {
  if (!Array.isArray(value)) throw new PublicSelectionRequestError("사진 선택 형식이 올바르지 않습니다.");
  if (value.length > PUBLIC_SELECTION_MAX_ITEMS) throw new PublicSelectionRequestError("선택한 사진이 너무 많습니다.");
  const seen = new Set<string>();
  const items: PublicSelectionItemInput[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new PublicSelectionRequestError("사진 선택 형식이 올바르지 않습니다.");
    }
    const record = raw as Record<string, unknown>;
    const imageId = typeof record.imageId === "string" ? record.imageId.trim() : "";
    if (!imageId || !allowedImageIds.has(imageId)) {
      throw new PublicSelectionRequestError("이 갤러리에 없는 사진이 포함되어 있습니다.");
    }
    if (seen.has(imageId)) throw new PublicSelectionRequestError("같은 사진이 두 번 포함되어 있습니다.");
    seen.add(imageId);
    const rawRating = record.rating;
    const rating = rawRating === null || rawRating === undefined || rawRating === 0
      ? null
      : Number(rawRating);
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      throw new PublicSelectionRequestError("별점은 1점부터 5점까지만 저장할 수 있습니다.");
    }
    const rawColorLabel = record.colorLabel ?? record.color_label;
    const colorLabel = rawColorLabel === null || rawColorLabel === undefined || rawColorLabel === 0
      ? null
      : Number(rawColorLabel);
    if (colorLabel !== null && (!Number.isInteger(colorLabel) || colorLabel < 6 || colorLabel > 9)) {
      throw new PublicSelectionRequestError("컬러 셀렉은 6번부터 9번까지만 저장할 수 있습니다.");
    }
    const memo = typeof record.memo === "string" ? record.memo : "";
    if (memo.length > PUBLIC_SELECTION_IMAGE_MEMO_LIMIT) {
      throw new PublicSelectionRequestError(`사진별 메모는 ${PUBLIC_SELECTION_IMAGE_MEMO_LIMIT}자까지 적을 수 있습니다.`);
    }
    items.push({ imageId, rating, colorLabel, memo });
  }
  return items;
}

function parseCommon(
  value: unknown,
  allowedImageIds: ReadonlySet<string>,
): PublicSelectionDraftInput {
  const revision = parsePublicSelectionRevision(value);
  const body = value as Record<string, unknown>;
  const customerMemo = typeof body.customerMemo === "string" ? body.customerMemo : "";
  if (customerMemo.length > PUBLIC_SELECTION_CUSTOMER_MEMO_LIMIT) {
    throw new PublicSelectionRequestError(`전체 메모는 ${PUBLIC_SELECTION_CUSTOMER_MEMO_LIMIT}자까지 적을 수 있습니다.`);
  }
  return { revision, items: parseItems(body.items, allowedImageIds), customerMemo };
}

/**
 * Reads only the optimistic-lock revision before expensive image ownership
 * validation. Stale clients can then be rejected without scanning every photo.
 */
export function parsePublicSelectionRevision(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublicSelectionRequestError("요청 형식이 올바르지 않습니다.");
  }
  const body = value as Record<string, unknown>;
  const revision = Number(body.revision ?? 0);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new PublicSelectionRequestError("저장 버전이 올바르지 않습니다.");
  }
  return revision;
}

export function parsePublicSelectionDraft(
  value: unknown,
  allowedImageIds: ReadonlySet<string>,
) {
  return parseCommon(value, allowedImageIds);
}

export function parsePublicSelectionSubmit(
  value: unknown,
  allowedImageIds: ReadonlySet<string>,
): PublicSelectionSubmitInput {
  const parsed = parseCommon(value, allowedImageIds);
  const body = value as Record<string, unknown>;
  const requestKey = typeof body.requestKey === "string" ? body.requestKey.trim() : "";
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(requestKey)) {
    throw new PublicSelectionRequestError("제출 요청 키가 올바르지 않습니다.");
  }
  if (!parsed.items.length) throw new PublicSelectionRequestError("한 장 이상의 사진을 선택해 주세요.");
  return { ...parsed, requestKey };
}

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
    ? (body as Record<string, unknown>).items
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
}) {
  const keyHash = publicSelectionRateLimitKey({
    token: input.token,
    action: input.action,
    ip: publicRequestIp(input.request),
  });
  const { data, error } = await input.db.rpc("consume_select_public_rate_limit", {
    p_key_hash: keyHash,
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds ?? 60,
  });
  if (error) throw error;
  if (data !== true) throw new PublicSelectionRequestError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
}

export function publicSelectionErrorResponse(error: unknown) {
  if (error instanceof PublicSelectionRequestError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  }
  console.error("[public-selection] unexpected server error", error);
  return Response.json({
    ok: false,
    code: "PUBLIC_SELECTION_UNAVAILABLE",
    error: "사진선택 서버 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  }, { status: 500 });
}
