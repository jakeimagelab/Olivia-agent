import { getSupabaseAdmin } from "@/lib/supabase";

export type TaskEventType =
  | "created"
  | "assigned"
  | "status_changed"
  | "submitted"
  | "approved"
  | "revision_requested"
  | "due_date_changed"
  | "commented"
  | "attachment_added";

export async function recordTaskEvent(input: {
  taskId: string;
  actorId?: string | null;
  eventType: TaskEventType;
  fromValue?: string | null;
  toValue?: string | null;
  note?: string | null;
}): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("team_task_events").insert({
    task_id: input.taskId,
    actor_id: input.actorId ?? null,
    event_type: input.eventType,
    from_value: input.fromValue ?? null,
    to_value: input.toValue ?? null,
    note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
}
