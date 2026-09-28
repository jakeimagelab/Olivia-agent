import type { SupabaseClient } from "@supabase/supabase-js";
import { reportSafelyFailure } from "@/lib/observability/safelyFailure";
import type { PcrmActorType } from "./types";

export async function recordPcrmActivity(
  db: SupabaseClient,
  input: {
    clientId: string;
    workflowRunId?: string | null;
    actorType: PcrmActorType;
    actorName?: string;
    actionType: string;
    title: string;
    description?: string;
    relatedType?: string;
    relatedId?: string;
  },
) {
  const { error } = await db.from("pcrm_activity_logs").insert({
    client_id: input.clientId,
    workflow_run_id: input.workflowRunId ?? null,
    actor_type: input.actorType,
    actor_name: input.actorName ?? "",
    action_type: input.actionType,
    title: input.title,
    description: input.description ?? "",
    related_type: input.relatedType ?? "",
    related_id: input.relatedId ?? "",
  });
  if (error) throw error;
}

export async function recordPcrmActivitySafely(
  db: SupabaseClient,
  input: Parameters<typeof recordPcrmActivity>[1],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await recordPcrmActivity(db, input);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);
    reportSafelyFailure("recordPcrmActivitySafely", input.actionType || input.clientId, error);
    return { ok: false, error: message };
  }
}
