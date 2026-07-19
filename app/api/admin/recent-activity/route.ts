import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ActivityItem = {
  id: string;
  kind: "olivia" | "admin" | "client" | "system";
  title: string;
  detail: string;
  createdAt: string;
};

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const [logsResult, eventsResult] = await Promise.all([
      db.from("agent_logs")
        .select("id,message,log_type,input_summary,output_summary,success,error_message,created_at")
        .order("created_at", { ascending: false })
        .limit(12),
      db.from("olivia_events")
        .select("id,event_type,event_source,actor_type,payload,occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(12),
    ]);

    const logItems: ActivityItem[] = (logsResult.data ?? []).map((row) => ({
      id: `log-${row.id}`,
      kind: row.log_type === "manual" ? "admin" : row.success === false ? "system" : "olivia",
      title: row.message || String(row.log_type || "올리비아 작업").replaceAll("_", " "),
      detail: row.error_message || row.output_summary || row.input_summary || "업무 기록",
      createdAt: row.created_at,
    }));
    const eventItems: ActivityItem[] = (eventsResult.data ?? []).map((row) => ({
      id: `event-${row.id}`,
      kind: row.actor_type === "admin" ? "admin" : String(row.event_type).startsWith("client.") ? "client" : "olivia",
      title: String(row.event_type || "이벤트").replaceAll("_", " ").replace("client.", "고객 "),
      detail: String(row.payload?.summary || row.payload?.message || row.event_source || "상태 변경"),
      createdAt: row.occurred_at,
    }));

    const items = [...logItems, ...eventItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    return NextResponse.json({
      ok: true,
      items,
      partial: Boolean(logsResult.error || eventsResult.error),
    });
  } catch {
    return NextResponse.json({ ok: true, items: [], partial: true });
  }
}
