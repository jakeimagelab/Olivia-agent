import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function marketingErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("public.marketing_") && message.includes("schema cache")) {
    return "마케팅 플랜 DB가 아직 준비되지 않았습니다. Supabase SQL Editor에서 20260728_marketing_plan_assistant.sql을 실행해주세요.";
  }
  return message;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const channel = searchParams.get("channel");

    let query = supabase
      .from("marketing_strategies")
      .select("*")
      .order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    if (channel) query = query.eq("channel", channel);

    const { data: strategies, error } = await query;
    if (error) throw new Error(error.message);

    const strategyIds = (strategies ?? []).map((s) => s.id);
    let actionCounts: Record<string, { total: number; done: number }> = {};
    if (strategyIds.length > 0) {
      const { data: actions, error: actionsError } = await supabase
        .from("marketing_actions")
        .select("strategy_id, status")
        .in("strategy_id", strategyIds);
      if (actionsError) throw new Error(actionsError.message);
      actionCounts = (actions ?? []).reduce((acc, action) => {
        const key = action.strategy_id as string;
        if (!acc[key]) acc[key] = { total: 0, done: 0 };
        acc[key].total += 1;
        if (action.status === "done") acc[key].done += 1;
        return acc;
      }, actionCounts);
    }

    const enriched = (strategies ?? []).map((s) => ({
      ...s,
      actionTotal: actionCounts[s.id]?.total ?? 0,
      actionDone: actionCounts[s.id]?.done ?? 0,
    }));

    return NextResponse.json({ ok: true, strategies: enriched });
  } catch (error) {
    return NextResponse.json({ ok: false, error: marketingErrorMessage(error, "전략 목록 조회 실패") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ ok: false, error: "전략명을 입력해주세요." }, { status: 400 });
    }

    const payload = {
      title: body.title.trim(),
      hypothesis: body.hypothesis ?? "",
      channel: body.channel ?? "",
      status: body.status ?? "planned",
      start_date: body.startDate || null,
      target_end_date: body.targetEndDate || null,
      baseline_note: body.baselineNote ?? "",
    };

    const { data, error } = await supabase
      .from("marketing_strategies")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, strategy: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: marketingErrorMessage(error, "전략 생성 실패") }, { status: 500 });
  }
}
