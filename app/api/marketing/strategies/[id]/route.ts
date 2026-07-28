import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const { data: strategy, error: strategyError } = await supabase
      .from("marketing_strategies")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (strategyError) throw new Error(strategyError.message);
    if (!strategy) return NextResponse.json({ ok: false, error: "전략을 찾을 수 없습니다." }, { status: 404 });

    const { data: actions, error: actionsError } = await supabase
      .from("marketing_actions")
      .select("*")
      .eq("strategy_id", id)
      .order("scheduled_date", { ascending: true, nullsFirst: false });
    if (actionsError) throw new Error(actionsError.message);

    const actionIds = (actions ?? []).map((a) => a.id);
    let metricsByAction: Record<string, any[]> = {};
    if (actionIds.length > 0) {
      const { data: metrics, error: metricsError } = await supabase
        .from("marketing_metric_logs")
        .select("*")
        .in("action_id", actionIds)
        .order("recorded_at", { ascending: true });
      if (metricsError) throw new Error(metricsError.message);
      metricsByAction = (metrics ?? []).reduce((acc, metric) => {
        const key = metric.action_id as string;
        if (!acc[key]) acc[key] = [];
        acc[key].push(metric);
        return acc;
      }, metricsByAction);
    }

    const enrichedActions = (actions ?? []).map((a) => ({
      ...a,
      metrics: metricsByAction[a.id] ?? [],
    }));

    return NextResponse.json({ ok: true, strategy, actions: enrichedActions });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "전략 상세 조회 실패" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const body = await req.json();

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.hypothesis !== undefined) patch.hypothesis = body.hypothesis;
    if (body.channel !== undefined) patch.channel = body.channel;
    if (body.status !== undefined) patch.status = body.status;
    if (body.startDate !== undefined) patch.start_date = body.startDate || null;
    if (body.targetEndDate !== undefined) patch.target_end_date = body.targetEndDate || null;
    if (body.baselineNote !== undefined) patch.baseline_note = body.baselineNote;

    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

    const { error } = await supabase.from("marketing_strategies").update(patch).eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "전략 수정 실패" }, { status: 500 });
  }
}
