import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);
  let query = getSupabaseAdmin().from("olivia_insights").select("*").order("priority_score", { ascending: false }).order("detected_at", { ascending: false }).limit(limit);
  if (params.get("status")) query = query.eq("status", params.get("status")!);
  else query = query.in("status", ["open", "acknowledged", "action_created"]);
  if (params.get("type")) query = query.eq("insight_type", params.get("type")!);
  if (params.get("workflowRunId")) query = query.eq("workflow_run_id", params.get("workflowRunId")!);
  if (params.get("minPriority")) query = query.gte("priority_score", Number(params.get("minPriority")) || 0);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [], insights: data ?? [] });
}
