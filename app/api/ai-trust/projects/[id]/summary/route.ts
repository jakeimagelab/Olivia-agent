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
    projectClinicsRes,
    reviewRes,
    jobsRes,
    costsRes,
    mentionsRes,
    dataSourcesRes,
  ] = await Promise.all([
    supabase.from("ai_trust_projects").select("*, region_config:ai_trust_regions(*)").eq("id", id).single(),
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
    supabase.from("ai_trust_project_clinics").select("distance_m,is_client,clinic:ai_trust_clinics(*)").eq("project_id", id),
    supabase.from("ai_trust_review_queue").select("*").eq("project_id", id).eq("status", "PENDING").order("created_at", { ascending: false }),
    supabase.from("ai_trust_jobs").select("id,job_type,status,attempts,error,cost_usd,created_at,updated_at").eq("project_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("ai_trust_cost_ledger").select("provider,model,amount_usd,input_tokens,output_tokens,web_search_count,created_at").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("ai_trust_hospital_mentions").select("id,response_id,hospital_id,raw_name,rank,mention_context,hospital:ai_trust_hospitals(id,canonical_name)").eq("project_id", id),
    supabase.from("ai_trust_data_sources").select("source_key,source_name,status,message,checked_at").eq("project_id", id).order("source_name", { ascending: true }),
  ]);

  if (projectRes.error) return NextResponse.json({ ok: false, error: projectRes.error.message }, { status: 500 });
  await supabase.from("ai_trust_projects").update({ latest_viewed_at: new Date().toISOString() }).eq("id", id);

  let historyQuery = supabase.from("ai_trust_projects")
    .select("id,client_hospital_name,scope_label,region_id,created_at,runs:ai_trust_audit_runs(id,status,created_at)")
    .neq("id", id).order("created_at", { ascending: false }).limit(20);
  if (projectRes.data.client_id) historyQuery = historyQuery.eq("client_id", projectRes.data.client_id);
  else historyQuery = historyQuery.eq("client_hospital_name", projectRes.data.client_hospital_name);
  if (projectRes.data.region_id) historyQuery = historyQuery.eq("region_id", projectRes.data.region_id);
  else historyQuery = historyQuery.eq("region", projectRes.data.region);
  const { data: history } = await historyQuery;
  const historyIds = (history || []).map((item) => item.id);
  const { data: historyConsensus } = historyIds.length
    ? await supabase.from("ai_trust_consensus_stats").select("project_id,mention_rate,provider_consensus,hospital:ai_trust_hospitals(canonical_name)").in("project_id", historyIds)
    : { data: [] };

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
    projectClinics: projectClinicsRes.data || [],
    reviewQueue: reviewRes.data || [],
    jobs: jobsRes.data || [],
    costs: costsRes.data || [],
    mentions: mentionsRes.data || [],
    history: history || [],
    historyConsensus: historyConsensus || [],
    dataSources: dataSourcesRes.data || [],
  });
}
