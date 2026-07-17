import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);
  let query = getSupabaseAdmin().from("olivia_actions").select("*").order("created_at", { ascending: false }).limit(limit);
  if (params.get("status")) query = query.eq("status", params.get("status")!);
  if (params.get("workflowRunId")) query = query.eq("workflow_run_id", params.get("workflowRunId")!);
  if (params.get("insightId")) query = query.eq("insight_id", params.get("insightId")!);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [], actions: data ?? [] });
}
