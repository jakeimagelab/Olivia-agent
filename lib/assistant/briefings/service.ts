import type { SupabaseClient } from "@supabase/supabase-js";
import { sendKakaoEvent } from "@/lib/assistant/channels/kakao/client";
import { createAssistantNotification } from "@/lib/assistant/notifications/service";
import { searchAssistantGmail } from "@/lib/assistant/oauth/google";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { decryptAssistantSecret } from "@/lib/assistant/security";
import { getKstDate } from "@/lib/olivia/briefings";

export type AssistantBriefingType = "morning" | "afternoon" | "evening";

function nextDate(date: string) {
  const value = new Date(`${date}T00:00:00+09:00`);
  value.setDate(value.getDate() + 1);
  return value.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export function renderBriefingText(briefing: {
  title: string;
  summary: string;
  sections: Array<{ title: string; items: any[] }>;
}) {
  const lines = [briefing.title, "", briefing.summary];
  for (const section of briefing.sections) {
    if (!section.items.length) continue;
    lines.push("", `[${section.title}]`);
    for (const item of section.items.slice(0, 5)) {
      lines.push(
        `- ${String(item.title || item.subject || item.commitment || item.action_name || "확인 필요")}`,
      );
    }
  }
  return lines.join("\n").slice(0, 900);
}

export async function generateAssistantBriefing(
  db: SupabaseClient,
  type: AssistantBriefingType,
  date = getKstDate(),
) {
  const owner = await ensurePrimaryAssistantOwner(db);
  const tomorrow = nextDate(date);
  const [
    calendarResult,
    tomorrowCalendarResult,
    teamTasksResult,
    approvalsResult,
    actionRequestsResult,
  ] = await Promise.all([
    db
      .from("calendar_tasks")
      .select("id,title,date,time,category,memo,completed")
      .eq("date", date)
      .order("time"),
    type === "evening"
      ? db
          .from("calendar_tasks")
          .select("id,title,date,time,category,memo,completed")
          .eq("date", tomorrow)
          .order("time")
      : Promise.resolve({ data: [] as any[], error: null }),
    db
      .from("team_tasks")
      .select("id,title,status,priority,due_date,revision_note")
      .in("status", ["todo", "in_progress", "review"])
      .or(`due_date.eq.${date},status.eq.review`)
      .order("due_date"),
    db
      .from("agent_approvals")
      .select("id,title,description,created_at")
      .eq("status", "pending")
      .order("created_at")
      .limit(20),
    db
      .from("assistant_action_requests")
      .select("id,action_name,status,created_at")
      .eq("owner_id", owner.id)
      .eq("status", "waiting_confirmation")
      .order("created_at")
      .limit(20),
  ]);

  let importantEmails: any[] = [];
  try {
    importantEmails = await searchAssistantGmail(
      db,
      owner.id,
      "is:unread newer_than:2d",
      5,
    );
  } catch {
    importantEmails = [];
  }

  const calendar = calendarResult.data ?? [];
  const unfinishedCalendar = calendar.filter((item: any) => !item.completed);
  const completedCalendar = calendar.filter((item: any) => item.completed);
  const teamTasks = teamTasksResult.data ?? [];
  const waiting = [
    ...(approvalsResult.data ?? []),
    ...(actionRequestsResult.data ?? []),
  ];
  const sections =
    type === "morning"
      ? [
          { key: "schedule", title: "오늘 일정", items: calendar },
          { key: "tasks", title: "오늘 업무", items: teamTasks },
          { key: "approvals", title: "확인 요청", items: waiting },
          { key: "email", title: "중요 미확인 메일", items: importantEmails },
        ]
      : type === "afternoon"
        ? [
            { key: "completed", title: "오전 완료", items: completedCalendar },
            { key: "remaining", title: "오후 남은 일정", items: unfinishedCalendar },
            { key: "tasks", title: "미완료 중요 업무", items: teamTasks },
            { key: "approvals", title: "확인 요청", items: waiting },
            { key: "email", title: "새 중요 메일", items: importantEmails },
          ]
        : [
            { key: "completed", title: "오늘 완료", items: completedCalendar },
            { key: "unfinished", title: "미완료 업무", items: [...unfinishedCalendar, ...teamTasks] },
            {
              key: "tomorrow",
              title: "내일 주요 일정",
              items: tomorrowCalendarResult.data ?? [],
            },
            { key: "approvals", title: "확인 요청", items: waiting },
            { key: "email", title: "늦게 도착한 중요 메일", items: importantEmails },
          ];
  const title =
    type === "morning"
      ? "좋은 아침입니다"
      : type === "afternoon"
        ? "오후 업무 브리핑"
        : "오늘 업무 정리";
  const summary =
    type === "morning"
      ? `오늘 일정 ${calendar.length}건, 확인 요청 ${waiting.length}건, 미확인 중요 메일 ${importantEmails.length}건입니다.`
      : type === "afternoon"
        ? `완료 ${completedCalendar.length}건, 남은 일정 ${unfinishedCalendar.length}건, 확인 요청 ${waiting.length}건입니다.`
        : `오늘 완료 ${completedCalendar.length}건, 미완료 ${unfinishedCalendar.length + teamTasks.length}건, 내일 일정 ${(tomorrowCalendarResult.data ?? []).length}건입니다.`;
  const row = {
    owner_id: owner.id,
    briefing_type: type,
    briefing_date: date,
    title,
    summary,
    sections,
    source_data: {
      calendar: calendar.length,
      teamTasks: teamTasks.length,
      approvals: waiting.length,
      importantEmails: importantEmails.length,
    },
    status: "generated",
    delivery_status: "generated",
    generated_at: new Date().toISOString(),
  };
  const { data: briefing, error } = await db
    .from("olivia_briefings")
    .upsert(row, { onConflict: "briefing_type,briefing_date,title" })
    .select("*")
    .single();
  if (error) throw new Error(`브리핑 저장 실패: ${error.message}`);

  await createAssistantNotification(db, {
    ownerId: owner.id,
    notificationKey: `briefing:${type}:${date}:${owner.id}`,
    notificationType: `briefing.${type}`,
    priority: "NORMAL",
    title,
    message: summary,
    channel: "dashboard",
  });
  return { owner, briefing, text: renderBriefingText({ title, summary, sections }) };
}

export async function deliverAssistantBriefingToKakao(
  db: SupabaseClient,
  generated: Awaited<ReturnType<typeof generateAssistantBriefing>>,
) {
  const eventName = process.env.KAKAO_BRIEFING_EVENT_NAME;
  if (!eventName || !process.env.KAKAO_BOT_ID || !process.env.KAKAO_REST_API_KEY) {
    return { sent: false, reason: "not_configured" as const };
  }
  const [settingsResult, connectionResult] = await Promise.all([
    db
      .from("assistant_notification_settings")
      .select("kakao_enabled")
      .eq("owner_id", generated.owner.id)
      .maybeSingle(),
    db
      .from("assistant_channel_connections")
      .select("external_user_id_encrypted")
      .eq("owner_id", generated.owner.id)
      .eq("channel", "kakao")
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (
    !settingsResult.data?.kakao_enabled ||
    !connectionResult.data?.external_user_id_encrypted
  ) {
    return { sent: false, reason: "disabled" as const };
  }
  const sent = await sendKakaoEvent({
    eventName,
    userType: "botUserKey",
    userId: decryptAssistantSecret(
      connectionResult.data.external_user_id_encrypted,
    ),
    data: {
      text: generated.text,
      briefingId: generated.briefing.id,
    },
  });
  await db.from("assistant_delivery_attempts").insert({
    owner_id: generated.owner.id,
    channel: "kakao",
    external_request_id: sent.taskId,
    status: "accepted",
    response_metadata: {
      eventName,
      briefingId: generated.briefing.id,
      status: sent.status,
    },
    sent_at: new Date().toISOString(),
  });
  await db
    .from("olivia_briefings")
    .update({ delivery_status: "sent" })
    .eq("id", generated.briefing.id);
  return { sent: true, taskId: sent.taskId };
}
