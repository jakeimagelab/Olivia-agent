import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  let query = getSupabaseAdmin().from("channel_analysis_reports")
    .select("id,client_id,project_id,workflow_run_id,hospital_name,specialty,overall_score,analysis_status,created_at")
    .order("created_at", { ascending: false }).limit(Math.min(Number(params.get("limit") || 20), 50));
  if (params.get("clientId")) query = query.eq("client_id", params.get("clientId"));
  if (params.get("workflowRunId")) query = query.eq("workflow_run_id", params.get("workflowRunId"));
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reports: data ?? [] });
}
