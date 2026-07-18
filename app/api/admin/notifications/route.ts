import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type NotificationItem = { id: string; kind: string; title: string; subtitle: string; href: string; createdAt: string };

export async function GET() {
  const db = getSupabaseAdmin();
  const [insights, actions, approvals, events] = await Promise.all([
    db.from("olivia_insights").select("id,title,summary,priority_score,workflow_run_id,detected_at").in("status", ["open", "acknowledged", "action_created"]).gte("priority_score", 60).order("priority_score", { ascending: false }).limit(5),
    db.from("olivia_actions").select("id,title,description,workflow_run_id,created_at").eq("status", "waiting_approval").order("created_at", { ascending: false }).limit(5),
    db.from("agent_approvals").select("id,title,description,workflow_run_id,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
    db.from("olivia_events").select("id,event_type,payload,workflow_run_id,occurred_at").like("event_type", "client.%").order("occurred_at", { ascending: false }).limit(5),
  ]);

  const items: NotificationItem[] = [
    ...(insights.data || []).map((row) => ({ id: row.id, kind: Number(row.priority_score) >= 80 ? "긴급" : "인사이트", title: row.title, subtitle: row.summary || `우선순위 ${row.priority_score}`, href: row.workflow_run_id ? `/clients?workflowRunId=${encodeURIComponent(row.workflow_run_id)}` : "/admin/dashboard/home#olivia-assistant", createdAt: row.detected_at })),
    ...(actions.data || []).map((row) => ({ id: row.id, kind: "승인 대기", title: row.title, subtitle: row.description || "올리비아가 준비한 행동", href: "/admin/dashboard/home#olivia-assistant", createdAt: row.created_at })),
    ...(approvals.data || []).map((row) => ({ id: row.id, kind: "승인 대기", title: row.title, subtitle: row.description || "대표 확인 필요", href: row.workflow_run_id ? `/clients?workflowRunId=${encodeURIComponent(row.workflow_run_id)}` : "/workflow/approvals", createdAt: row.created_at })),
    ...(events.data || []).map((row) => ({ id: row.id, kind: "고객 반응", title: String(row.event_type || "고객 반응").replace(/^client\./, "").replaceAll("_", " "), subtitle: String(row.payload?.summary || row.payload?.message || "새로운 고객 반응이 있습니다."), href: row.workflow_run_id ? `/clients?workflowRunId=${encodeURIComponent(row.workflow_run_id)}` : "/admin/dashboard/home#olivia-assistant", createdAt: row.occurred_at })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

  const unavailable = [insights, actions, approvals, events].filter((result) => result.error).length;
  return NextResponse.json({ ok: unavailable < 4, items, count: items.length, partial: unavailable > 0 });
}
