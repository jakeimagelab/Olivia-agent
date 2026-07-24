import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantNotificationPriority } from "@/lib/assistant/types";

export async function createAssistantNotification(
  db: SupabaseClient,
  input: {
    ownerId: string;
    notificationKey: string;
    notificationType: string;
    priority: AssistantNotificationPriority;
    title: string;
    message: string;
    channel?: "dashboard" | "kakao" | "telegram";
    scheduledAt?: string;
    expiresAt?: string;
  },
) {
  const row = {
    owner_id: input.ownerId,
    notification_key: input.notificationKey,
    notification_type: input.notificationType,
    priority: input.priority,
    title: input.title,
    message: input.message,
    channel: input.channel ?? "dashboard",
    delivery_status: "queued",
    scheduled_at: input.scheduledAt ?? new Date().toISOString(),
    expires_at: input.expiresAt ?? null,
  };
  let duplicate = false;
  let { data, error } = await db
    .from("olivia_notification_history")
    .insert(row)
    .select("*")
    .single();
  if (error?.code === "23505") {
    duplicate = true;
    const existing = await db
      .from("olivia_notification_history")
      .select("*")
      .eq("notification_key", input.notificationKey)
      .single();
    data = existing.data;
    error = existing.error;
  }
  if (error) throw new Error(`알림 저장 실패: ${error.message}`);
  return { ...data, duplicate };
}
