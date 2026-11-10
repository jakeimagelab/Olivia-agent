import { NextRequest, NextResponse } from "next/server";
import { getAiTrustProviderStatuses } from "@/lib/ai-trust/providers";
import { DEFAULT_PRICING, estimateAiTrustRunCost, type PricingTable } from "@/lib/ai-trust/costs";
import { isGeoRadarSchemaMissing, geoRadarSetupResponse } from "@/lib/ai-trust/database";
import { aiQueryJobKey, enqueueAiTrustJobs } from "@/lib/ai-trust/jobs";
import type { AiTrustProviderKey } from "@/lib/ai-trust/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
 try {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const projectId = String(body.project_id || "");
  const repeatCount = Math.min(5, Math.max(1, Number(body.repeat_count || 3)));
  const requestedProviders: AiTrustProviderKey[] = Array.isArray(body.providers) ? body.providers.map(String) : ["openai"];
  const availableProviders = new Set<string>(
    getAiTrustProviderStatuses()
      .filter((provider) => provider.status === "CONNECTED")
      .map((provider) => provider.provider),
  );
  const providers = requestedProviders.filter((provider) => availableProviders.has(provider));

  if (!projectId) return NextResponse.json({ ok: false, error: "project_id is required" }, { status: 400 });
  if (providers.length === 0) {
    return NextResponse.json({ ok: false, error: "실행 가능한 AI Provider가 없습니다. 환경변수 연결은 마지막 단계에서 설정하세요." }, { status: 400 });
  }

  const promptQuery = supabase
    .from("ai_trust_prompts")
    .select("id")
    .eq("project_id", projectId)
    .eq("selected", true);

  const { data: prompts, error: promptError } = await promptQuery;
  if (promptError) return NextResponse.json({ ok: false, error: promptError.message }, { status: 500 });
  if (!prompts?.length) return NextResponse.json({ ok: false, error: "선택된 질문이 없습니다." }, { status: 400 });

  const totalRequests = prompts.length * providers.length * repeatCount;
  const { data: pricingSetting } = await supabase.from("ai_trust_settings").select("value").eq("key", "pricing").maybeSingle();
  const pricing = (pricingSetting?.value as PricingTable | null) || DEFAULT_PRICING;
  const estimatedCost = estimateAiTrustRunCost({ requestCount: totalRequests, providers, pricing });
  const { data: run, error: runError } = await supabase
    .from("ai_trust_audit_runs")
    .insert({
      project_id: projectId,
      status: "PENDING",
      providers,
      repeat_count: repeatCount,
      question_count: prompts.length,
      total_requests: totalRequests,
      estimated_cost_usd: estimatedCost,
      pricing_note: Object.values(pricing).every((value) => value.input_per_million === 0 && value.output_per_million === 0 && value.web_search === 0)
        ? "단가표 확인 필요" : `예상 $${estimatedCost.toFixed(4)}`,
      settings: { requestedProviders, api_basis: true, web_search: true },
    })
    .select("*")
    .single();

  if (runError) return NextResponse.json({ ok: false, error: runError.message }, { status: 500 });

  const requestRows = prompts.flatMap((prompt: { id: string }) =>
    providers.flatMap((provider: string) =>
      Array.from({ length: repeatCount }, (_, index) => ({
        run_id: run.id,
        project_id: projectId,
        prompt_id: prompt.id,
        provider,
        run_number: index + 1,
        status: "PENDING",
      })),
    ),
  );

  const { data: insertedRequests, error: queueError } = await supabase.from("ai_trust_audit_requests").insert(requestRows).select("id, prompt_id, provider, run_number");
  if (queueError) return NextResponse.json({ ok: false, error: queueError.message }, { status: 500 });

  const { error: jobsError } = await enqueueAiTrustJobs(supabase, (insertedRequests || []).map((item) => ({
    project_id: projectId,
    run_id: run.id,
    audit_request_id: item.id,
    job_type: "ai_query" as const,
    idempotency_key: aiQueryJobKey(run.id, item.prompt_id, item.provider, item.run_number),
    payload: { prompt_id: item.prompt_id, provider: item.provider, run_number: item.run_number },
  })));
  if (jobsError) return NextResponse.json({ ok: false, error: jobsError.message }, { status: 500 });

  await supabase.from("ai_trust_projects").update({ status: "PENDING", updated_at: new Date().toISOString() }).eq("id", projectId);

  return NextResponse.json({ ok: true, run, total_requests: totalRequests, estimated_cost_usd: estimatedCost, queued: insertedRequests?.length || 0 });
 } catch (error) {
   if (isGeoRadarSchemaMissing(error)) return NextResponse.json(geoRadarSetupResponse(error), { status: 503 });
   return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "측정 작업 생성 실패" }, { status: 500 });
 }
}
