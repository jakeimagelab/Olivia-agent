import { getSupabaseAdmin } from "@/lib/supabase";

const EVENT_SUFFIX: Record<string, string> = {
  submitted: "업무를 확인 요청했습니다.",
  approved: "업무를 승인했습니다.",
  revision_requested: "수정을 요청했습니다.",
  status_changed: "업무 상태를 변경했습니다.",
};

export async function postTaskEventToRoom(input: {
  roomId?: string | null;
  taskId: string;
  taskTitle: string;
  actorId?: string | null;
  eventType: string;
  note?: string | null;
}): Promise<void> {
  if (!input.roomId) return;
  const db = getSupabaseAdmin();
  const { data: actor } = input.actorId
    ? await db.from("chat_members").select("display_name").eq("id", input.actorId).maybeSingle()
    : { data: null };
  const actorName = actor?.display_name ?? "올리비아";
  const suffix = EVENT_SUFFIX[input.eventType] ?? "업무가 변경되었습니다.";
  const body = input.eventType === "revision_requested" && input.note
    ? `${actorName}님이 ${input.taskTitle} 업무에 수정을 요청했습니다.\n수정 요청: ${input.note}`
    : `${actorName}님이 ${input.taskTitle} ${suffix}`;

  const { error } = await db.from("chat_messages").insert({
    room_id: input.roomId,
    sender_type: "olivia",
    sender_member_id: null,
    body,
    metadata: {
      messageType: "task_event",
      taskId: input.taskId,
      eventType: input.eventType,
    },
  });
  if (error) throw new Error(error.message);
}
