import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateConsensusStats } from "./consensus";
import { fetchHiraClinics, fetchKakaoClinics, mergeClinicCandidates } from "./clinics";
import { calculateAiTrustCost, EMPTY_PRICING, type PricingTable } from "./costs";
import { canonicalizeHospitalName, extractHospitalMentionsWithLlm, matchHospitalMention, type MatchableClinic } from "./entities";
import { enqueueAiTrustJobs, refreshAiTrustRunProgress, retryDelayMs } from "./jobs";
import { runAiTrustProvider } from "./providers";
import type { AiTrustProviderKey } from "./types";

type WorkerJob = {
  id: string;
  project_id: string | null;
  run_id: string | null;
  audit_request_id: string | null;
  job_type: "ai_query" | "clinic_sync" | "extract" | "score" | "retention";
  status: string;
  attempts: number;
  max_attempts: number;
  locked_at: string | null;
  payload: Record<string, unknown>;
};

export async function runAiTrustWorkerBatch(supabase: SupabaseClient, options?: { batchSize?: number; workerId?: string }) {
  const workerSettings = await getSetting<{ batch_size?: number; lease_minutes?: number }>(supabase, "worker", {});
  const batchSize = Math.min(5, Math.max(1, options?.batchSize || workerSettings.batch_size || 2));
  const workerId = options?.workerId || `vercel-${crypto.randomUUID()}`;
  const leaseMinutes = Math.min(30, Math.max(2, Number(workerSettings.lease_minutes || 10)));
  const stale = new Date(Date.now() - leaseMinutes * 60_000).toISOString();
  const now = new Date().toISOString();
  await enqueueAiTrustJobs(supabase, [{
    job_type: "retention",
    idempotency_key: `retention:${now.slice(0, 10)}`,
    payload: {},
  }]);
  const { data: candidates, error } = await supabase.from("ai_trust_jobs").select("*")
    .or(`and(status.in.(PENDING,RETRY),next_run_at.lte.${now}),and(status.eq.RUNNING,locked_at.lt.${stale})`)
    .order("next_run_at", { ascending: true }).limit(batchSize);
  if (error) throw error;

  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const candidate of (candidates || []) as WorkerJob[]) {
    const claimed = await claimJob(supabase, candidate, workerId);
    if (!claimed) continue;
    try {
      await processJob(supabase, claimed);
      await supabase.from("ai_trust_jobs").update({ status: "COMPLETED", completed_at: new Date().toISOString(), locked_at: null, locked_by: null, updated_at: new Date().toISOString() }).eq("id", claimed.id);
      results.push({ id: claimed.id, status: "COMPLETED" });
    } catch (errorValue) {
      const attempts = claimed.attempts;
      const retryable = (errorValue as Error & { retryable?: boolean }).retryable !== false && attempts < claimed.max_attempts;
      const errorMessage = errorValue instanceof Error ? errorValue.message.slice(0, 800) : "작업 실패";
      await supabase.from("ai_trust_jobs").update({
        status: retryable ? "RETRY" : "FAILED",
        next_run_at: retryable ? new Date(Date.now() + retryDelayMs(attempts)).toISOString() : now,
        error: errorMessage,
        completed_at: retryable ? null : new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      }).eq("id", claimed.id);
      if (!retryable && claimed.audit_request_id) {
        await supabase.from("ai_trust_audit_requests").update({ status: "FAILED", error_message: errorMessage, completed_at: new Date().toISOString() }).eq("id", claimed.audit_request_id);
        if (claimed.run_id) await refreshAiTrustRunProgress(supabase, claimed.run_id);
      }
      if (!retryable) {
        await notifyGeoRadar(supabase, {
          key: `geo-radar-job-failed:${claimed.id}`,
          projectId: claimed.project_id,
          title: "GEO 레이더 작업 실패",
          message: `${claimed.job_type} 작업이 3회 재시도 후 실패했습니다. ${errorMessage}`,
        });
      }
      results.push({ id: claimed.id, status: retryable ? "RETRY" : "FAILED", error: errorMessage });
    }
  }
  return results;
}

async function claimJob(supabase: SupabaseClient, candidate: WorkerJob, workerId: string) {
  let claim = supabase.from("ai_trust_jobs").update({
    status: "RUNNING",
    locked_at: new Date().toISOString(),
    locked_by: workerId,
    attempts: candidate.attempts + 1,
    started_at: candidate.attempts ? undefined : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", candidate.id).eq("status", candidate.status);
  if (candidate.status === "RUNNING" && candidate.locked_at) claim = claim.eq("locked_at", candidate.locked_at);
  const { data } = await claim.select("*").maybeSingle();
  return data as WorkerJob | null;
}

async function processJob(supabase: SupabaseClient, job: WorkerJob) {
  if (job.job_type === "ai_query") return processAiQuery(supabase, job);
  if (job.job_type === "extract") return processExtract(supabase, job);
  if (job.job_type === "score") return processScore(supabase, job);
  if (job.job_type === "clinic_sync") return processClinicSync(supabase, job);
  if (job.job_type === "retention") return processRetention(supabase);
}

async function processAiQuery(supabase: SupabaseClient, job: WorkerJob) {
  if (!job.audit_request_id || !job.run_id || !job.project_id) throw nonRetryable("AI 요청 연결 정보가 없습니다.");
  await assertBudget(supabase, job.project_id);
  const { data: requestRow, error } = await supabase.from("ai_trust_audit_requests")
    .select("*, prompt:ai_trust_prompts(id, question, region, department)").eq("id", job.audit_request_id).single();
  if (error || !requestRow) throw nonRetryable(error?.message || "AI 요청을 찾지 못했습니다.");
  if (requestRow.status === "COMPLETED") return;
  const prompt = Array.isArray(requestRow.prompt) ? requestRow.prompt[0] : requestRow.prompt;
  const models = await getSetting<Record<string, string>>(supabase, "models", {});
  await supabase.from("ai_trust_audit_requests").update({ status: "RUNNING", started_at: requestRow.started_at || new Date().toISOString() }).eq("id", requestRow.id);
  await supabase.from("ai_trust_audit_runs").update({ status: "RUNNING", started_at: new Date().toISOString(), current_prompt_id: requestRow.prompt_id, current_provider: requestRow.provider }).eq("id", job.run_id);
  const result = await runAiTrustProvider(requestRow.provider as AiTrustProviderKey, {
    question: prompt.question, region: prompt.region, department: prompt.department, model: models[requestRow.provider],
  });
  const pricingTable = await getSetting<PricingTable>(supabase, "pricing", EMPTY_PRICING);
  const pricing = pricingTable[result.provider] || EMPTY_PRICING[result.provider];
  const estimatedAmount = calculateAiTrustCost({ inputTokens: result.input_tokens, outputTokens: result.output_tokens, webSearchCount: result.web_search_count, pricing });
  const amount = result.reported_cost_usd ?? estimatedAmount;
  const { data: response, error: responseError } = await supabase.from("ai_trust_ai_responses").insert({
    run_id: job.run_id, project_id: job.project_id, prompt_id: requestRow.prompt_id,
    provider: result.provider, model: result.model, run_number: requestRow.run_number,
    question: prompt.question, raw_response: result.raw_response, citations: result.citations,
    source_urls: result.source_urls, request_parameters: result.request_parameters,
    input_tokens: result.input_tokens, output_tokens: result.output_tokens, web_search_count: result.web_search_count,
    response_status: "COMPLETED",
  }).select("id").single();
  if (responseError || !response) throw responseError || new Error("AI 응답 저장 실패");
  await supabase.from("ai_trust_cost_ledger").insert({
    project_id: job.project_id, run_id: job.run_id, job_id: job.id, provider: result.provider, model: result.model,
    input_tokens: result.input_tokens, output_tokens: result.output_tokens, web_search_count: result.web_search_count,
    input_price_per_million: pricing.input_per_million, output_price_per_million: pricing.output_per_million,
    web_search_price: pricing.web_search, amount_usd: amount,
    metadata: {
      cost_source: result.reported_cost_usd == null ? "settings_estimate" : "provider_reported",
      estimated_amount_usd: estimatedAmount,
    },
  });
  await supabase.from("ai_trust_jobs").update({ cost_usd: amount }).eq("id", job.id);
  await refreshRunActualCost(supabase, job.run_id);
  await supabase.from("ai_trust_audit_requests").update({ status: "COMPLETED", response_id: response.id, completed_at: new Date().toISOString() }).eq("id", requestRow.id);
  await enqueueAiTrustJobs(supabase, [{
    project_id: job.project_id, run_id: job.run_id, job_type: "extract",
    idempotency_key: `extract:${response.id}`, payload: { response_id: response.id },
  }]);
  const progress = await refreshAiTrustRunProgress(supabase, job.run_id);
  if (progress.status) {
    await supabase.from("ai_trust_projects").update({ status: progress.status, updated_at: new Date().toISOString() }).eq("id", job.project_id);
  }
}

async function processExtract(supabase: SupabaseClient, job: WorkerJob) {
  const responseId = String(job.payload.response_id || "");
  if (!responseId || !job.project_id) throw nonRetryable("추출할 응답이 없습니다.");
  const { data: response, error } = await supabase.from("ai_trust_ai_responses").select("id, raw_response, source_urls").eq("id", responseId).single();
  if (error || !response) throw nonRetryable(error?.message || "응답을 찾지 못했습니다.");
  const { mentions } = await extractHospitalMentionsWithLlm(response.raw_response || "", response.source_urls || []);
  const { data: clinics } = await supabase.from("ai_trust_clinics").select("id, canonical_name, normalized_name, address, website, phone");
  await supabase.from("ai_trust_hospital_mentions").delete().eq("response_id", responseId);
  for (const mention of mentions) {
    const canonicalName = canonicalizeHospitalName(mention.raw_name);
    const { data: legacyHospital } = await supabase.from("ai_trust_hospitals").upsert({
      project_id: job.project_id, canonical_name: canonicalName, aliases: [mention.raw_name],
    }, { onConflict: "project_id,canonical_name" }).select("id").single();
    const matched = matchHospitalMention(mention, (clinics || []) as MatchableClinic[]);
    const { data: mentionRow } = await supabase.from("ai_trust_hospital_mentions").insert({
      response_id: responseId, project_id: job.project_id, hospital_id: legacyHospital?.id || null,
      raw_name: mention.raw_name, rank: mention.rank, mention_context: mention.mention_context,
      confidence: mention.confidence, snippet: mention.snippet, source_url: mention.source_url || null,
      matched_clinic_id: matched.status === "MATCHED" ? matched.clinic?.id || null : null,
      match_confidence: matched.confidence, match_status: matched.status,
    }).select("id").single();
    if (matched.status === "REVIEW") {
      await supabase.from("ai_trust_review_queue").insert({
        project_id: job.project_id, response_id: responseId, mention_id: mentionRow?.id || null,
        raw_name: mention.raw_name, proposed_clinic_id: matched.clinic?.id || null, confidence: matched.confidence,
      });
    }
  }
  await enqueueAiTrustJobs(supabase, [{
    project_id: job.project_id, run_id: job.run_id, job_type: "score",
    idempotency_key: `score:${job.run_id || job.project_id}:${responseId}`, payload: {},
  }]);
}

async function processScore(supabase: SupabaseClient, job: WorkerJob) {
  if (!job.project_id) throw nonRetryable("집계할 프로젝트가 없습니다.");
  const [{ data: responses }, { data: prompts }, { data: mentions }] = await Promise.all([
    supabase.from("ai_trust_ai_responses").select("id, provider, prompt_id").eq("project_id", job.project_id).eq("response_status", "COMPLETED"),
    supabase.from("ai_trust_prompts").select("id, intent").eq("project_id", job.project_id),
    supabase.from("ai_trust_hospital_mentions").select("hospital_id, response_id, rank, mention_context").eq("project_id", job.project_id),
  ]);
  const stats = calculateConsensusStats(responses || [], prompts || [], mentions || []);
  if (stats.length) await supabase.from("ai_trust_consensus_stats").upsert(stats.map((stat) => ({ project_id: job.project_id, ...stat })), { onConflict: "project_id,hospital_id" });
}

async function processClinicSync(supabase: SupabaseClient, job: WorkerJob) {
  if (!job.project_id) throw nonRetryable("병원 목록 프로젝트가 없습니다.");
  const centerLat = Number(job.payload.center_lat);
  const centerLng = Number(job.payload.center_lng);
  const radiusM = Number(job.payload.radius_m || 1000);
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) throw nonRetryable("병원 검색 중심 좌표가 없습니다.");
  const scope = { centerLat, centerLng, radiusM, departmentCode: "14", keyword: String(job.payload.keyword || "피부과") };
  const [hira, kakao] = await Promise.all([fetchHiraClinics(scope), fetchKakaoClinics(scope)]);
  const allowedDistricts = Array.isArray(job.payload.districts) ? new Set(job.payload.districts.map(String)) : new Set<string>();
  const clinics = mergeClinicCandidates(hira, kakao).filter((clinic) => !allowedDistricts.size || (clinic.district && allowedDistricts.has(clinic.district)));
  for (const clinic of clinics) {
    const { data } = await supabase.from("ai_trust_clinics").upsert({ ...clinic, last_collected_at: new Date().toISOString() }, { onConflict: "source,source_id" }).select("id").single();
    if (data?.id) await supabase.from("ai_trust_project_clinics").upsert({ project_id: job.project_id, clinic_id: data.id }, { onConflict: "project_id,clinic_id" });
  }
}

async function processRetention(supabase: SupabaseClient) {
  await supabase.from("ai_trust_ai_responses").update({ raw_response: "", citations: [], source_urls: [] }).lt("expires_at", new Date().toISOString()).neq("raw_response", "");
}

async function assertBudget(supabase: SupabaseClient, projectId: string) {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const [{ data: project }, { data: projectLedger }, { data: allLedger }] = await Promise.all([
    supabase.from("ai_trust_projects").select("monthly_budget_usd").eq("id", projectId).single(),
    supabase.from("ai_trust_cost_ledger").select("amount_usd").eq("project_id", projectId).gte("created_at", start.toISOString()),
    supabase.from("ai_trust_cost_ledger").select("amount_usd").gte("created_at", start.toISOString()),
  ]);
  const budgets = await getSetting<{
    project_monthly_usd?: number;
    global_monthly_usd?: number;
    warning_ratio?: number;
  }>(supabase, "budgets", {});
  const projectBudget = Number(project?.monthly_budget_usd || budgets.project_monthly_usd || 20);
  const globalBudget = Number(process.env.AI_TRUST_GLOBAL_MONTHLY_BUDGET_USD || budgets.global_monthly_usd || 100);
  const projectSpent = (projectLedger || []).reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);
  const globalSpent = (allLedger || []).reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);
  const warningRatio = Number(budgets.warning_ratio || 0.8);
  const month = new Date().toISOString().slice(0, 7);
  if (projectBudget > 0 && projectSpent / projectBudget >= warningRatio) {
    await notifyGeoRadar(supabase, {
      key: `geo-radar-budget-project:${projectId}:${month}`,
      projectId,
      title: "GEO 레이더 프로젝트 예산 80% 도달",
      message: `이번 달 프로젝트 비용이 $${projectSpent.toFixed(2)}로 한도 $${projectBudget.toFixed(2)}의 ${Math.round(projectSpent / projectBudget * 100)}%입니다.`,
    });
  }
  if (globalBudget > 0 && globalSpent / globalBudget >= warningRatio) {
    await notifyGeoRadar(supabase, {
      key: `geo-radar-budget-global:${month}`,
      projectId: null,
      title: "GEO 레이더 전체 예산 80% 도달",
      message: `이번 달 전체 비용이 $${globalSpent.toFixed(2)}로 한도 $${globalBudget.toFixed(2)}의 ${Math.round(globalSpent / globalBudget * 100)}%입니다.`,
    });
  }
  if (projectSpent >= projectBudget) throw nonRetryable("프로젝트 월 예산을 모두 사용했습니다.");
  if (globalSpent >= globalBudget) throw nonRetryable("GEO 레이더 전체 월 예산을 모두 사용했습니다.");
}

async function getSetting<T>(supabase: SupabaseClient, key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from("ai_trust_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) || fallback;
}

async function refreshRunActualCost(supabase: SupabaseClient, runId: string) {
  const { data } = await supabase.from("ai_trust_cost_ledger").select("amount_usd").eq("run_id", runId);
  const amount = (data || []).reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);
  await supabase.from("ai_trust_audit_runs").update({ actual_cost_usd: amount }).eq("id", runId);
}

async function notifyGeoRadar(supabase: SupabaseClient, input: { key: string; projectId: string | null; title: string; message: string }) {
  try {
    await supabase.from("olivia_notification_history").upsert({
      notification_key: input.key,
      notification_type: "geo_radar",
      project_id: input.projectId,
      channel: "dashboard",
      title: input.title,
      message: input.message,
    }, { onConflict: "notification_key", ignoreDuplicates: true });
  } catch {
    // GEO jobs must not fail because an optional notification table is absent.
  }
}

function nonRetryable(message: string) {
  const error = new Error(message) as Error & { retryable?: boolean };
  error.retryable = false;
  return error;
}

