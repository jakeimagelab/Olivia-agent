import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CALENDAR_REMINDER_LABEL, type CalendarReminderMinutes } from "@/lib/calendarReminders";
import { sendTelegramNotification } from "@/lib/telegramNotifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function formatReminder(task: any) {
  const date = new Date(`${task.date}T12:00:00+09:00`).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short",
  });
  const timing = CALENDAR_REMINDER_LABEL[(task.reminder_minutes_before ?? 30) as CalendarReminderMinutes] || "30분 전";
  return [
    "🔔 올리비아 일정 알림",
    "",
    `📌 ${task.title}`,
    `🗓 ${date}`,
    `⏰ ${String(task.time).slice(0, 5)}${task.end_time ? ` - ${String(task.end_time).slice(0, 5)}` : ""} · ${timing}`,
    task.location ? `📍 ${task.location}` : "",
    task.memo ? `📝 ${task.memo}` : "",
  ].filter(Boolean).join("\n");
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  const { data: tasks, error } = await db.rpc("claim_due_calendar_reminders", { p_limit: 25 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const task of tasks ?? []) {
    try {
      const message = formatReminder(task);
      const { chatId } = await sendTelegramNotification(message);
      const sentAt = new Date().toISOString();
      const { error: updateError } = await db.from("calendar_tasks").update({
        reminder_sent_at: sentAt,
        reminder_claimed_at: null,
        reminder_last_error: null,
        updated_at: sentAt,
      }).eq("id", task.id);
      if (updateError) throw new Error(updateError.message);
      await Promise.all([
        db.from("olivia_chat_messages").insert({ role: "assistant", content: message, source: "telegram", chat_id: chatId }),
        db.from("olivia_notification_history").insert({
          notification_key: `calendar:${task.id}:${task.reminder_due_at}`,
          notification_type: "calendar_reminder",
          channel: "telegram",
          title: task.title,
          message,
          sent_at: sentAt,
        }),
      ]);
      sent += 1;
    } catch (sendError) {
      failed += 1;
      await db.from("calendar_tasks").update({
        reminder_claimed_at: null,
        reminder_last_error: sendError instanceof Error ? sendError.message.slice(0, 500) : "텔레그램 발송 실패",
        updated_at: new Date().toISOString(),
      }).eq("id", task.id);
    }
  }
  return NextResponse.json({ ok: true, claimed: tasks?.length ?? 0, sent, failed });
}
