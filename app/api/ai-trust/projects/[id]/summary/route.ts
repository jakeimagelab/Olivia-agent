import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const [
    projectRes,
    promptsRes,
    runsRes,
    responsesRes,
    hospitalsRes,
    consensusRes,
    scoresRes,
    gapsRes,
    evidenceRes,
    strategiesRes,
    shootsRes,
  ] = await Promise.all([
    supabase.from("ai_trust_projects").select("*").eq("id", id).single(),
    supabase.from("ai_trust_prompts").select("*").eq("project_id", id).order("created_at", { ascending: true }),
    supabase.from("ai_trust_audit_runs").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("ai_trust_ai_responses").select("id, provider, model, prompt_id, run_number, question, raw_response, source_urls, executed_at, response_status").eq("project_id", id).order("executed_at", { ascending: false }),
    supabase.from("ai_trust_hospitals").select("*").eq("project_id", id).order("created_at", { ascending: true }),
    supabase.from("ai_trust_consensus_stats").select("*, hospital:ai_trust_hospitals(*)").eq("project_id", id).order("mention_rate", { ascending: false }).limit(10),
    supabase.from("ai_trust_schema_scores").select("*").eq("project_id", id),
    supabase.from("ai_trust_gaps").select("*").eq("project_id", id).order("rank", { ascending: true }),
    supabase.from("ai_trust_evidence_documents").select("*").eq("project_id", id).order("collected_at", { ascending: false }),
    supabase.from("ai_trust_strategies").select("*").eq("project_id", id).order("priority", { ascending: true }),
    supabase.from("ai_trust_shoot_plan").select("*").eq("project_id", id).order("priority", { ascending: true }),
  ]);

  if (projectRes.error) return NextResponse.json({ ok: false, error: projectRes.error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    project: projectRes.data,
    prompts: promptsRes.data || [],
    runs: runsRes.data || [],
    responses: responsesRes.data || [],
    hospitals: hospitalsRes.data || [],
    consensusTop10: consensusRes.data || [],
    scores: scoresRes.data || [],
    gaps: gapsRes.data || [],
    evidence: evidenceRes.data || [],
    strategies: strategiesRes.data || [],
    shootPlan: shootsRes.data || [],
  });
}
