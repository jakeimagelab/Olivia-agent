import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { moveRecordToTrash } from "@/lib/trash";
import { isOptionalClientDetailColumnMissing, withClientDetailDefaults } from "@/lib/clientDetailFallback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ── 실제 DB 컬럼: hospital_name, contact_name, phone, email, specialty, memo ── */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;

  const requestedRunId = new URL(req.url).searchParams.get("workflowRunId");
  let [clientRes, runsRes, quotesRes, contractsRes, artifactsRes] = await Promise.all([
    supabase.from("clients")
      .select("id, hospital_name, contact_name, phone, email, specialty, memo, created_at, original_photos_link, retouched_photos_link, total_paid_amount, available_points, total_earned_points, reward_tier, quote_amount, quote_vat, quote_total, contract_amount, contract_vat, contract_total, contract_signed_at")
      .eq("id", id).maybeSingle(),
    supabase.from("workflow_runs")
      .select("*").eq("client_id", id)
      .order("created_at", { ascending: false }),
    // quotes/contracts 테이블이 아직 없는 프로젝트도 있어 실패해도 전체 응답을 막지 않는다 (아래에서 error는 무시하고 빈 배열로 처리).
    supabase.from("quotes")
      .select("id, quote_number, title, supply_amount, vat, total_amount, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("contracts")
      .select("id, quote_number, quote_data, signature_data_url, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("workflow_artifacts")
      .select("id, client_id, workflow_run_id, workflow_step_key, document_type, source_table, source_id, title, file_name, mime_type, file_size, status, created_at")
      .eq("client_id", id)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (isOptionalClientDetailColumnMissing(clientRes.error)) {
    clientRes = await supabase.from("clients")
      .select("id, hospital_name, contact_name, phone, email, specialty, memo, created_at, original_photos_link, retouched_photos_link")
      .eq("id", id)
      .maybeSingle();
  }

  if (clientRes.error) {
    return NextResponse.json({ ok: false, error: clientRes.error.message }, { status: 500 });
  }
  if (!clientRes.data)
    return NextResponse.json({ ok: false, error: "고객을 찾을 수 없습니다." }, { status: 404 });

  const c = withClientDetailDefaults(clientRes.data);
  const hospitalName = (c.hospital_name ?? "") as string;
  const workflowRuns = runsRes.data ?? [];
  const workflowRun = workflowRuns.find((run) => run.id === requestedRunId)
    ?? workflowRuns.find((run) => run.status === "active" && run.run_kind !== "additional_shooting")
    ?? workflowRuns.find((run) => run.status === "active")
    ?? workflowRuns[0]
    ?? null;

  const { data: mailings } = await supabase
    .from("mailing_queue")
    .select("id, type, status, subject, to_email, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  // 프론트가 기대하는 필드명으로 정규화
  const client = {
    ...c,
    name:         hospitalName,
    manager_name: c.contact_name ?? "",
    department:   c.specialty    ?? "",
  };

  return NextResponse.json({
    ok: true,
    client,
    workflowRun,
    workflowRuns,
    mailingQueue: mailings ?? [],
    quotes: quotesRes.error ? [] : quotesRes.data ?? [],
    contracts: contractsRes.error ? [] : contractsRes.data ?? [],
    artifacts: artifactsRes.error
      ? []
      : (artifactsRes.data ?? []).filter((artifact) => !workflowRun?.id || artifact.workflow_run_id === workflowRun.id || artifact.workflow_run_id === null),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  const body = await req.json();

  // 프론트 필드 → 실제 DB 컬럼 매핑
  const patch: Record<string, unknown> = {};
  const hospitalName = body.name || body.hospital_name;
  if (hospitalName !== undefined)                       patch.hospital_name = hospitalName;
  if (body.contact_name  !== undefined)                 patch.contact_name  = body.contact_name  || null;
  if (body.manager_name  !== undefined)                 patch.contact_name  = body.manager_name  || null;
  if (body.director_name !== undefined)                 patch.contact_name  = body.director_name || null;
  if (body.phone         !== undefined)                 patch.phone         = body.phone         || null;
  if (body.email         !== undefined)                 patch.email         = body.email         || null;
  if (body.specialty     !== undefined)                 patch.specialty     = body.specialty     || null;
  if (body.department    !== undefined)                 patch.specialty     = body.department    || null;
  if (body.memo          !== undefined)                 patch.memo          = body.memo          || null;

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ ok: true });

  const { error } = await supabase.from("clients").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  try {
    const item = await moveRecordToTrash(supabase, "client", id);
    return NextResponse.json({ ok: true, trashId: item.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "고객 삭제 실패" }, { status: 500 });
  }
}
