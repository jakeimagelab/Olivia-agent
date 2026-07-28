import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

    const [activeStrategiesRes, upcomingRes, overdueRes] = await Promise.all([
      supabase
        .from("marketing_strategies")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("marketing_actions")
        .select("id, title, scheduled_date, marketing_strategies(title)")
        .eq("status", "pending")
        .gte("scheduled_date", todayStr)
        .order("scheduled_date", { ascending: true })
        .limit(5),
      supabase
        .from("marketing_actions")
        .select("id, title, scheduled_date, marketing_strategies(title)")
        .eq("status", "pending")
        .lt("scheduled_date", todayStr)
        .order("scheduled_date", { ascending: true })
        .limit(10),
    ]);

    if (activeStrategiesRes.error) throw new Error(activeStrategiesRes.error.message);
    if (upcomingRes.error) throw new Error(upcomingRes.error.message);
    if (overdueRes.error) throw new Error(overdueRes.error.message);

    const today = new Date(`${todayStr}T00:00:00+09:00`);
    const dayMs = 24 * 60 * 60 * 1000;

    const upcomingActions = (upcomingRes.data ?? []).map((a: any) => ({
      id: a.id,
      title: a.title,
      scheduledDate: a.scheduled_date,
      strategyTitle: a.marketing_strategies?.title ?? "",
    }));

    const overdueActions = (overdueRes.data ?? []).map((a: any) => {
      const scheduled = new Date(`${a.scheduled_date}T00:00:00+09:00`);
      const daysOverdue = Math.max(1, Math.round((today.getTime() - scheduled.getTime()) / dayMs));
      return {
        id: a.id,
        title: a.title,
        scheduledDate: a.scheduled_date,
        strategyTitle: a.marketing_strategies?.title ?? "",
        daysOverdue,
      };
    });

    return NextResponse.json({
      ok: true,
      activeStrategiesCount: activeStrategiesRes.count ?? 0,
      upcomingActions,
      overdueActions,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "마케팅 요약 조회 실패" }, { status: 500 });
  }
}
