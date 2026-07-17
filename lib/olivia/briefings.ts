import type { SupabaseClient } from "@supabase/supabase-js";

export function getKstDate(value = new Date()) {
  return value.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export async function generateMorningBriefing(db: SupabaseClient, date = getKstDate()) {
  const start = `${date}T00:00:00+09:00`;
  const endDate = new Date(`${date}T00:00:00+09:00`);
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString();
  const dueEnd = new Date(`${date}T23:59:59+09:00`).toISOString();

  const [insightsRes, approvalsRes, commitmentsRes, eventsRes, actionsRes, ideasRes, trendsRes] = await Promise.all([
    db.from("olivia_insights").select("*").in("status", ["open", "acknowledged", "action_created"]).gte("priority_score", 40).or(`snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString()}`).order("priority_score", { ascending: false }).limit(50),
    db.from("agent_approvals").select("*").eq("status", "pending").order("created_at").limit(30),
    db.from("meeting_commitments").select("*").in("status", ["open", "overdue"]).lte("due_at", dueEnd).order("due_at").limit(30),
    db.from("olivia_events").select("*").like("event_type", "client.%").gte("occurred_at", start).lt("occurred_at", end).order("occurred_at", { ascending: false }).limit(30),
    db.from("olivia_actions").select("*").in("status", ["prepared", "waiting_approval", "approved"]).order("created_at", { ascending: false }).limit(30),
    db.from("daily_ideas").select("date,marketing_idea,content_ideas,mission,trend_keywords").order("date", { ascending: false }).limit(1),
    db.from("trend_insights").select("id,industry,summary,highlights,created_at").order("created_at", { ascending: false }).limit(3),
  ]);

  const insights = insightsRes.data ?? [];
  const urgent = insights.filter((item) => item.priority_score >= 80);
  const today = insights.filter((item) => item.priority_score >= 60 && item.priority_score < 80);
  const sections = [
    { key: "urgent", title: "긴급", items: urgent },
    { key: "approvals", title: "승인 대기", items: approvalsRes.data ?? [] },
    { key: "today", title: "오늘 할 일", items: [...today, ...(commitmentsRes.data ?? [])] },
    { key: "customer_reactions", title: "고객 반응", items: eventsRes.data ?? [] },
    { key: "suggestions", title: "올리비아 제안", items: actionsRes.data ?? [] },
    { key: "marketing", title: "마케팅 인사이트", items: [...(ideasRes.data ?? []), ...(trendsRes.data ?? [])] },
  ];
  const counts = Object.fromEntries(sections.map((section) => [section.key, section.items.length]));
  const summary = urgent.length
    ? `긴급 확인 ${urgent.length}건과 승인 대기 ${(approvalsRes.data ?? []).length}건이 있습니다.`
    : `승인 대기 ${(approvalsRes.data ?? []).length}건, 오늘 확인할 내용 ${today.length + (commitmentsRes.data ?? []).length}건입니다.`;

  const { data, error } = await db.from("olivia_briefings").upsert({
    briefing_type: "morning",
    briefing_date: date,
    title: "대표님, 지금 확인할 내용",
    summary,
    sections,
    source_data: counts,
    status: "generated",
    generated_at: new Date().toISOString(),
  }, { onConflict: "briefing_type,briefing_date,title" }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}
