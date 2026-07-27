import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { moveRecordToTrash } from "@/lib/trash";
import { isOptionalClientDetailColumnMissing, withClientDetailDefaults } from "@/lib/clientDetailFallback";
import { isMissingColumnError } from "@/lib/dbErrors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ── 실제 DB 컬럼: hospital_name, contact_name, phone, email, specialty, memo ── */
/* ── 확장 컬럼(2026-07-27 고객관리 개편, 마이그레이션 미적용 시 자동 폴백): director_name,
     address, website_url, instagram_url, naver_place_url, manager_staff, referral_source, notes ── */
const EXTENDED_CLIENT_COLUMNS = "director_name, address, website_url, instagram_url, naver_place_url, manager_staff, referral_source, notes";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  const requestedRunId = new URL(req.url).searchParams.get("workflowRunId");

  // client_id가 없어서 프론트가 자리표시자("_by-workflow")로 보낸 경우,
  // 잘못된 UUID로 clients 테이블을 조회하지 않고 곧바로 자가치유 경로로 진입한다.
  if (id === "_by-workflow") {
    if (!requestedRunId) return NextResponse.json({ ok: false, error: "workflowRunId가 필요합니다." }, { status: 400 });
    return healClientLinkAndRespond(supabase, requestedRunId);
  }

  let [clientRes, runsRes, quotesRes, contractsRes, artifactsRes] = await Promise.all([
    supabase.from("clients")
      .select(`id, hospital_name, contact_name, phone, email, specialty, memo, created_at, original_photos_link, retouched_photos_link, total_paid_amount, available_points, total_earned_points, reward_tier, quote_amount, quote_vat, quote_total, contract_amount, contract_vat, contract_total, contract_signed_at, ${EXTENDED_CLIENT_COLUMNS}`)
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

  if (isMissingColumnError(clientRes.error)) {
    clientRes = await supabase.from("clients")
      .select("id, hospital_name, contact_name, phone, email, specialty, memo, created_at, original_photos_link, retouched_photos_link, total_paid_amount, available_points, total_earned_points, reward_tier, quote_amount, quote_vat, quote_total, contract_amount, contract_vat, contract_total, contract_signed_at")
      .eq("id", id).maybeSingle();
  }
  if (isOptionalClientDetailColumnMissing(clientRes.error)) {
    clientRes = await supabase.from("clients")
      .select("id, hospital_name, contact_name, phone, email, specialty, memo, created_at, original_photos_link, retouched_photos_link")
      .eq("id", id)
      .maybeSingle();
  }

  if (clientRes.error) {
    return NextResponse.json({ ok: false, error: clientRes.error.message }, { status: 500 });
  }
  if (!clientRes.data) {
    if (requestedRunId) return healClientLinkAndRespond(supabase, requestedRunId);
    return NextResponse.json({ ok: false, error: "고객을 찾을 수 없습니다." }, { status: 404 });
  }

  const c = withClientDetailDefaults(clientRes.data);
  const hospitalName = (c.hospital_name ?? "") as string;
  const workflowRuns = runsRes.data ?? [];
  const workflowRun = workflowRuns.find((run) => run.id === requestedRunId)
    ?? workflowRuns.find((run) => run.status === "active" && run.run_kind !== "additional_shooting")
    ?? workflowRuns.find((run) => run.status === "active")
    ?? workflowRuns[0]
    ?? null;

  const activitiesRes = workflowRun?.id
    ? await supabase.from("pcrm_activity_logs")
        .select("*")
        .eq("client_id", id)
        .eq("workflow_run_id", workflowRun.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [], error: null };

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
    activities: activitiesRes.error ? [] : activitiesRes.data ?? [],
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
  // 담당자(contact_name)와 원장명(director_name)은 서로 다른 사람이므로 별도 컬럼에 저장한다.
  const patch: Record<string, unknown> = {};
  const hospitalName = body.name || body.hospital_name;
  if (hospitalName !== undefined)                       patch.hospital_name   = hospitalName;
  if (body.contact_name    !== undefined)               patch.contact_name    = body.contact_name    || null;
  if (body.manager_name    !== undefined)               patch.contact_name    = body.manager_name     || null;
  if (body.director_name   !== undefined)               patch.director_name   = body.director_name    || null;
  if (body.phone           !== undefined)               patch.phone           = body.phone            || null;
  if (body.email           !== undefined)               patch.email           = body.email            || null;
  if (body.specialty       !== undefined)               patch.specialty       = body.specialty         || null;
  if (body.department      !== undefined)               patch.specialty       = body.department        || null;
  if (body.memo            !== undefined)               patch.memo            = body.memo              || null;
  if (body.address         !== undefined)               patch.address         = body.address           || null;
  if (body.website_url     !== undefined)               patch.website_url     = body.website_url        || null;
  if (body.instagram_url   !== undefined)               patch.instagram_url   = body.instagram_url      || null;
  if (body.naver_place_url !== undefined)               patch.naver_place_url = body.naver_place_url    || null;
  if (body.manager_staff   !== undefined)               patch.manager_staff   = body.manager_staff      || null;
  if (body.referral_source !== undefined)               patch.referral_source = body.referral_source    || null;
  if (body.notes           !== undefined)               patch.notes           = body.notes              || null;

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ ok: true });

  let { error } = await supabase.from("clients").update(patch).eq("id", id);
  // 확장 필드 마이그레이션이 아직 안 돌았으면, 그 필드들만 빼고 나머지는 저장되도록 한 번 더 시도한다.
  if (isMissingColumnError(error)) {
    const EXTENDED_KEYS = ["director_name", "address", "website_url", "instagram_url", "naver_place_url", "manager_staff", "referral_source", "notes"];
    const basePatch = Object.fromEntries(Object.entries(patch).filter(([key]) => !EXTENDED_KEYS.includes(key)));
    if (Object.keys(basePatch).length > 0) {
      ({ error } = await supabase.from("clients").update(basePatch).eq("id", id));
    } else {
      error = null;
    }
  }
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
    // 고객관리가 기준 데이터이므로, 고객을 삭제하면 연결된 프로젝트도 홈 화면 칸반보드에서
    // 곧바로 사라지도록 취소 처리한다. workflow_runs 자체는 남겨 감사·복구 시 참고할 수 있게 유지한다.
    await supabase.from("workflow_runs").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("client_id", id);
    return NextResponse.json({ ok: true, trashId: item.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "고객 삭제 실패" }, { status: 500 });
  }
}

/**
 * workflow_runs.client_id가 비어있거나(null) 존재하지 않는 고객을 가리킬 때,
 * 워크플로우의 client_name으로 "기존" 고객을 찾아 재연결한다.
 * 고객관리(clients)가 기준 데이터이므로 여기서 새 고객을 만들지는 않는다 —
 * 예전엔 매칭되는 고객이 없으면 새로 만들어버려서, 고객관리에서 삭제한 고객이 칸반카드를
 * 클릭할 때마다 되살아나는 문제가 있었다 (신규 생성은 app/api/workflow/start에서만 한다).
 * 재연결에 성공하면 409로 healedClientId를 내려주고, 프론트는 그 id로 즉시 재조회한다.
 */
async function healClientLinkAndRespond(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  requestedRunId: string
) {
  const { data: run } = await supabase.from("workflow_runs").select("id, client_name, status").eq("id", requestedRunId).maybeSingle();
  const runClientName = String(run?.client_name || "").trim();
  if (run && run.status !== "canceled" && runClientName) {
    const { data: candidates } = await supabase.from("clients").select("id, hospital_name").ilike("hospital_name", `%${runClientName}%`).limit(5);
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    const matched = (candidates ?? []).find((row) => normalize(row.hospital_name) === normalize(runClientName));

    if (matched?.id) {
      await supabase.from("workflow_runs").update({ client_id: matched.id }).eq("id", run.id);
      return NextResponse.json({ ok: false, error: "고객 연결이 어긋나 있어 방금 복구했습니다. 새로고침해주세요.", healedClientId: matched.id }, { status: 409 });
    }
  }
  return NextResponse.json({ ok: false, error: "고객을 찾을 수 없습니다." }, { status: 404 });
}
