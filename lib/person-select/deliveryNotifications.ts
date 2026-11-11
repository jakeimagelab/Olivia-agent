import type { SupabaseClient } from "@supabase/supabase-js";
import { createAssistantNotification } from "@/lib/assistant/notifications/service";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";

/** 고객 보정본 상태 변경은 저장 성공 이후 관리자 대시보드에 best-effort로 알린다. */
export async function notifyPersonSelectDelivery(
  db: SupabaseClient,
  input: { eventId: string; eventTitle: string; actorName: string; action: "revision_sent" | "approved"; count: number; at: string },
) {
  try {
    const owner = await ensurePrimaryAssistantOwner(db);
    const approved = input.action === "approved";
    await createAssistantNotification(db, {
      ownerId: owner.id,
      notificationKey: `person-select-delivery:${input.eventId}:${input.actorName}:${input.action}:${input.at}`,
      notificationType: `person_select.delivery.${input.action}`,
      priority: approved ? "HIGH" : "NORMAL",
      title: approved ? `${input.eventTitle} 보정본 최종 확인` : `${input.eventTitle} 보정본 수정 요청`,
      message: approved
        ? `${input.actorName} 고객이 보정본 ${input.count}장을 최종 확인했습니다.`
        : `${input.actorName} 고객이 보정본 수정 요청을 보냈습니다.`,
      channel: "dashboard",
    });
  } catch (error) {
    console.error("[person-select-delivery] 관리자 알림 저장 실패", error);
  }
}
