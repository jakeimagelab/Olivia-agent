import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MOCK_WORKFLOW_RUNS } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("workflow_runs").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, runs: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: true, mock: true, note: error instanceof Error ? error.message : String(error), runs: MOCK_WORKFLOW_RUNS });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("workflow_runs")
    .insert({
      client_id: body.client_id ?? null,
      project_id: body.project_id ?? null,
      template_id: body.template_id ?? null,
      client_name: body.client_name ?? "",
      project_name: body.project_name ?? "",
      manager_name: body.manager_name ?? "",
      shoot_date: body.shoot_date || null,
      current_step_key: body.current_step_key ?? "consult_received",
      next_action: body.next_action ?? "고객 정보와 사전자료 요청 정리",
      status: body.status ?? "active",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, run: data });
}
