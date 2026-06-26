import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildNextAction, createStepTasks, ensureStepRun, logAgent } from "@/lib/workflowAutomation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ── 실제 DB 컬럼: hospital_name, contact_name, phone, email, specialty, memo ── */

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  let query = supabase
    .from("clients")
    .select("id, hospital_name, contact_name, phone, email, specialty, memo, created_at")
    .order("created_at", { ascending: false });

  if (q) query = query.ilike("hospital_name", `%${q}%`);

  const [clientsRes, runsRes] = await Promise.all([
    query,
    supabase
      .from("workflow_runs")
      .select("client_id, current_step_key, status, started_at")
      .eq("status", "active"),
  ]);

  if (clientsRes.error)
    return NextResponse.json({ ok: false, error: clientsRes.error.message }, { status: 500 });

  const runMap = Object.fromEntries(
    (runsRes.data ?? []).map((r) => [r.client_id, r])
  );

  const clients = (clientsRes.data ?? []).map((c) => normalizeClient(c, runMap[c.id] ?? null));

  return NextResponse.json({ ok: true, clients });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const hospitalName = body.name || body.hospital_name;
  if (!hospitalName) return NextResponse.json({ ok: false, error: "병원명 필수" }, { status: 400 });

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      hospital_name: hospitalName,
      contact_name:  body.director_name || body.contact_name || body.manager_name || null,
      phone:         body.phone         || null,
      email:         body.email         || null,
      specialty:     body.department    || body.specialty     || null,
      memo:          body.memo          || null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const { data: run } = await supabase.from("workflow_runs").insert({
    client_id:        client.id,
    client_name:      hospitalName,
    current_step_key: "consult_meeting",
    next_action:      buildNextAction("consult_meeting"),
    status:           "active",
    started_at:       new Date().toISOString(),
  }).select().single();

  if (run?.id) {
    await ensureStepRun(supabase, run.id, "consult_meeting", "in_progress");
    const taskResult = await createStepTasks(supabase, run.id, "consult_meeting");
    await logAgent(supabase, {
      workflow_run_id: run.id,
      log_type: "workflow_started",
      message: `${hospitalName} 고객 생성 후 워크플로우가 시작되었습니다.`,
      output_summary: `created_tasks: ${taskResult.created.length}`,
    });
  }

  return NextResponse.json({ ok: true, id: client.id });
}

/* 프론트가 기대하는 필드명으로 정규화 */
function normalizeClient(c: Record<string, unknown>, activeRun: unknown) {
  return {
    ...c,
    name:         c.hospital_name ?? "",
    manager_name: c.contact_name  ?? "",
    department:   c.specialty     ?? "",
    active_run:   activeRun,
  };
}
