import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantChannel } from "@/lib/assistant/types";

export async function recordAssistantAudit(
  db: SupabaseClient,
  input: {
    ownerId?: string | null;
    sourceChannel: AssistantChannel | "system";
    eventType: string;
    action: string;
    targetType?: string;
    targetId?: string;
    beforeData?: Record<string, unknown>;
    afterData?: Record<string, unknown>;
    requestId?: string;
  },
) {
  const { error } = await db.from("assistant_audit_logs").insert({
    owner_id: input.ownerId ?? null,
    source_channel: input.sourceChannel,
    event_type: input.eventType.slice(0, 120),
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    action: input.action.slice(0, 200),
    before_data: input.beforeData ?? {},
    after_data: input.afterData ?? {},
    request_id: input.requestId ?? null,
  });
  if (error) throw new Error(`감사 로그 저장 실패: ${error.message}`);
}
