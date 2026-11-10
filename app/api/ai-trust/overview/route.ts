import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PRICING } from "@/lib/ai-trust/costs";
import { geoRadarSetupResponse, isGeoRadarSchemaMissing } from "@/lib/ai-trust/database";
import { getAiTrustProviderStatuses } from "@/lib/ai-trust/providers";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const [clients, projects, regions, reviews, jobs, costs, pricing, budgets] = await Promise.all([
      loadClients(db),
      db.from("ai_trust_projects").select("*, runs:ai_trust_audit_runs(id,status,completed_requests,failed_requests,total_requests,actual_cost_usd,created_at)").order("latest_viewed_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(50),
      db.from("ai_trust_regions").select("*").order("is_preset", { ascending: false }).order("created_at", { ascending: true }),
      db.from("ai_trust_review_queue").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
      db.from("ai_trust_jobs").select("id,job_type,status,error,project_id,attempts,created_at,updated_at").order("created_at", { ascending: false }).limit(100),
      db.from("ai_trust_cost_ledger").select("project_id,provider,amount_usd,created_at").gte("created_at", monthStart.toISOString()),
      db.from("ai_trust_settings").select("value").eq("key", "pricing").maybeSingle(),
      db.from("ai_trust_settings").select("value").eq("key", "budgets").maybeSingle(),
    ]);
    const firstError = [clients.error, projects.error, regions.error, reviews.error, jobs.error, costs.error, pricing.error, budgets.error].find(Boolean);
    if (firstError) throw firstError;
    return NextResponse.json({
      ok: true,
      clients: clients.data || [], projects: projects.data || [], regions: regions.data || [],
      providers: getAiTrustProviderStatuses(), review_count: reviews.count || 0,
      jobs: jobs.data || [], costs: costs.data || [], pricing: pricing.data?.value || DEFAULT_PRICING,
      budgets: budgets.data?.value || { project_monthly_usd: 20, global_monthly_usd: 100, warning_ratio: 0.8 },
      map: { connected: Boolean(process.env.NEXT_PUBLIC_KAKAO_JS_KEY) },
      clinic_sources: { hira: Boolean(process.env.DATA_GO_KR_SERVICE_KEY), kakao: Boolean(process.env.KAKAO_REST_API_KEY) },
    });
  } catch (error) {
    if (isGeoRadarSchemaMissing(error)) return NextResponse.json(geoRadarSetupResponse(error), { status: 503 });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "GEO 레이더 데이터를 불러오지 못했습니다." }, { status: 500 });
  }
}

async function loadClients(db: SupabaseClient) {
  const extended = await db.from("clients").select("id, hospital_name, specialty, address, memo").order("created_at", { ascending: false }).limit(200);
  if (!extended.error) return extended;
  const legacy = await db.from("clients").select("id, hospital_name, specialty, memo").order("created_at", { ascending: false }).limit(200);
  return {
    ...legacy,
    data: (legacy.data || []).map((client) => ({ ...client, address: client.memo || null })),
  };
}

