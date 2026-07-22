import type { SupabaseClient } from "@supabase/supabase-js";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";

type CalendarAwarenessInput = {
  id: string;
  date: string;
  title: string;
  category?: string | null;
  time?: string | null;
  location?: string | null;
  memo?: string | null;
  reminderEnabled?: boolean;
};

function kstDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function calendarPriority(task: CalendarAwarenessInput) {
  const today = kstDate();
  const tomorrow = kstDate(1);
  if (task.date < today) return 82;
  if (task.date === today && task.time) return 78;
  if (task.date === today) return 70;
  if (task.date === tomorrow && ["client", "shooting"].includes(task.category ?? "")) return 68;
  if (task.date === tomorrow && (task.location || task.memo || task.reminderEnabled)) return 62;
  return 45;
}

export async function registerCalendarAwareness(db: SupabaseClient, task: CalendarAwarenessInput) {
  const priority = calendarPriority(task);
  const eventKey = createEventDeduplicationKey("calendar.task_created", task.id);
  const event = await emitOliviaEventSafely(db, {
    eventType: "calendar.task_created",
    eventSource: "calendar",
    payload: {
      calendarTaskId: task.id,
      title: task.title,
      date: task.date,
      time: task.time ?? null,
      category: task.category ?? "general",
      hasLocation: Boolean(task.location),
      hasMemo: Boolean(task.memo),
      reminderEnabled: task.reminderEnabled === true,
    },
    deduplicationKey: eventKey,
  });

  if (!event) return;
  const schedule = [task.date, task.time?.slice(0, 5)].filter(Boolean).join(" ");
  const prep = [task.location ? `장소 ${task.location}` : "", task.memo ? "준비 메모 있음" : ""].filter(Boolean).join(" · ");
  const { error } = await db.rpc("upsert_olivia_insight", {
    p_insight: {
      insight_type: "recommendation",
      title: `새 일정: ${task.title}`,
      summary: `${schedule}${prep ? ` · ${prep}` : ""}`,
      reason: priority >= 60
        ? "오늘 또는 임박한 일정이라 준비 여부를 먼저 확인하는 것이 좋습니다."
        : "새 일정으로 등록되어 올리비아가 추적을 시작했습니다.",
      event_id: event.id,
      priority_score: priority,
      urgency_score: priority,
      impact_score: ["client", "shooting"].includes(task.category ?? "") ? 75 : 50,
      confidence: 1,
      recommended_action: "캘린더에서 일정과 준비사항 확인",
      recommended_due_at: task.time ? `${task.date}T${task.time.slice(0, 5)}:00+09:00` : `${task.date}T09:00:00+09:00`,
      deduplication_key: createEventDeduplicationKey("calendar.task_insight", task.id),
    },
  });
  if (error) throw new Error(error.message);
}
