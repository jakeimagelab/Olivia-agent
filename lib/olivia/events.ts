import type { SupabaseClient } from "@supabase/supabase-js";
import type { OliviaEventInput } from "@/lib/olivia/types";

const SENSITIVE_KEYS = new Set([
  "email",
  "phone",
  "contact_email",
  "contact_phone",
  "contract_content",
  "raw_transcript",
  "transcript",
]);

function sanitizePayload(input: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => !SENSITIVE_KEYS.has(key.toLowerCase()))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 2_000) : value]),
  );
}

export function createEventDeduplicationKey(
  eventType: string,
  ...parts: Array<string | number | null | undefined>
) {
  const normalized = parts
    .filter((part): part is string | number => part !== null && part !== undefined && String(part).trim() !== "")
    .map((part) => String(part).trim().replace(/\s+/g, "_"));
  return [eventType, ...normalized].join(":");
}

export async function emitOliviaEvent(db: SupabaseClient, input: OliviaEventInput) {
  const row = {
    event_type: input.eventType,
    event_source: input.eventSource,
    client_id: input.clientId ?? null,
    project_id: input.projectId ?? null,
    workflow_run_id: input.workflowRunId ?? null,
    actor_type: input.actorType ?? "system",
    actor_id: input.actorId ?? null,
    payload: sanitizePayload(input.payload),
    deduplication_key: input.deduplicationKey ?? null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
  };

  const { data, error } = await db.from("olivia_events").insert(row).select("*").single();
  if (!error) return data;

  if (error.code === "23505" && row.deduplication_key) {
    const { data: existing, error: existingError } = await db
      .from("olivia_events")
      .select("*")
      .eq("deduplication_key", row.deduplication_key)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return existing;
  }

  throw new Error(error.message);
}

export async function markOliviaEventProcessed(db: SupabaseClient, eventId: string) {
  const { data, error } = await db
    .from("olivia_events")
    .update({ event_status: "processed", processed_at: new Date().toISOString(), error_message: "" })
    .eq("id", eventId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function markOliviaEventFailed(db: SupabaseClient, eventId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const { data, error: updateError } = await db
    .from("olivia_events")
    .update({ event_status: "failed", processed_at: new Date().toISOString(), error_message: message.slice(0, 1_000) })
    .eq("id", eventId)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);
  return data;
}

export async function emitOliviaEventSafely(db: SupabaseClient, input: OliviaEventInput) {
  try {
    return await emitOliviaEvent(db, input);
  } catch (error) {
    console.error(`[olivia:event] ${input.eventType}`, error instanceof Error ? error.message : String(error));
    return null;
  }
}
