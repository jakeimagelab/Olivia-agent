import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);
  let query = getSupabaseAdmin().from("meeting_commitments").select("*").order("due_at").limit(limit);
  if (params.get("status")) query = query.eq("status", params.get("status")!);
  if (params.get("ownerType")) query = query.eq("owner_type", params.get("ownerType")!);
  if (params.get("workflowRunId")) query = query.eq("workflow_run_id", params.get("workflowRunId")!);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [], commitments: data ?? [] });
}
