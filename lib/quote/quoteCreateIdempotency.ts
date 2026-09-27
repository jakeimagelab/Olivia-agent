import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

export const QUOTE_CREATE_DEDUP_WINDOW_MS = 10 * 60_000;
export const QUOTE_CREATE_REQUEST_KEY_FIELD = "oliviaCreateRequestKey";

function normalizeRequestText(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("ko-KR");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

export function buildQuoteCreateRequestKey(
  context: OliviaContextSnapshot,
  quoteData: Record<string, unknown>,
): string | undefined {
  const conversationId = context.currentConversationId?.trim();
  const requestText = context.currentRequestText?.trim();
  if (!conversationId || !requestText) return undefined;

  const payload = stableValue({
    conversationId,
    requestText: normalizeRequestText(requestText),
    quoteData,
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function stampQuoteCreateRequestKey(
  quoteData: Record<string, unknown>,
  requestKey: string,
) {
  const formState = quoteData.formState && typeof quoteData.formState === "object" && !Array.isArray(quoteData.formState)
    ? quoteData.formState as Record<string, unknown>
    : {};
  return {
    ...quoteData,
    formState: {
      ...formState,
      [QUOTE_CREATE_REQUEST_KEY_FIELD]: requestKey,
    },
  };
}

export async function findRecentQuoteByCreateRequestKey(
  db: SupabaseClient,
  requestKey: string,
  now = Date.now(),
): Promise<Record<string, unknown> | null> {
  const cutoff = new Date(now - QUOTE_CREATE_DEDUP_WINDOW_MS).toISOString();
  const { data, error } = await db
    .from("quotes")
    .select("*")
    .eq(`form_state->>${QUOTE_CREATE_REQUEST_KEY_FIELD}`, requestKey)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`견적 중복 확인에 실패했습니다: ${error.message}`);
  return data ? data as Record<string, unknown> : null;
}
