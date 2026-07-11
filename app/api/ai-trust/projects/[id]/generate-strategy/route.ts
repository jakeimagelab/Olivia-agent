import { NextResponse } from "next/server";
import { buildShootPlanFromStrategies, buildStrategiesFromGaps } from "@/lib/ai-trust/strategy";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data: gaps, error } = await supabase
    .from("ai_trust_gaps")
    .select("id, schema_key, gap, recommended_avg, client_score")
    .eq("project_id", id)
    .order("rank", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!gaps?.length) return NextResponse.json({ ok: false, error: "Trust Gap 계산 결과가 없습니다." }, { status: 400 });

  const strategies = buildStrategiesFromGaps(gaps);
  if (!strategies.length) return NextResponse.json({ ok: true, strategies: 0, shoot_plan: 0 });

  const { data: savedStrategies, error: strategyError } = await supabase
    .from("ai_trust_strategies")
    .insert(strategies.map((strategy) => ({ ...strategy, project_id: id })))
    .select("id, title, category, priority");

  if (strategyError) return NextResponse.json({ ok: false, error: strategyError.message }, { status: 500 });

  const shootPlan = buildShootPlanFromStrategies(savedStrategies || []);
  if (shootPlan.length) {
    await supabase.from("ai_trust_shoot_plan").insert(shootPlan.map((shot) => ({ ...shot, project_id: id })));
  }

  return NextResponse.json({ ok: true, strategies: savedStrategies?.length || 0, shoot_plan: shootPlan.length });
}
