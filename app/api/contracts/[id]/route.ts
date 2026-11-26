import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";
import { resolveWorkflowRunId } from "@/lib/workflowRunLookup";
import { contractContentUpdate } from "@/lib/contract/contractEdits";
import { getContractEditLock } from "@/lib/contract/contractEditLock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ContractRouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: ContractRouteContext) {
  const { id } = await ctx.params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("contracts").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  try {
    const editLock = await getContractEditLock(supabase, data);
    return NextResponse.json({ ok: true, data, editLock });
  } catch (error) {
    console.error("[ContractEdit] 계약 확인 상태 조회 실패", error);
    return NextResponse.json({ ok: false, error: "계약서의 확인 상태를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: ContractRouteContext) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "계약서 저장 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();

  let update: Record<string, unknown>;
  try {
    update = contractContentUpdate(body);
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }

  const { data: current, error: lookupError } = await supabase.from("contracts")
    .select("id,status,workflow_run_id,updated_at").eq("id", id).maybeSingle();
  if (lookupError) return NextResponse.json({ ok: false, error: lookupError.message }, { status: 500 });
  if (!current) return NextResponse.json({ ok: false, error: "계약서를 찾을 수 없습니다." }, { status: 404 });
  try {
    const editLock = await getContractEditLock(supabase, current);
    if (editLock) return NextResponse.json({ ok: false, error: editLock, editLock }, { status: 409 });
  } catch (error) {
    console.error("[ContractEdit] 계약 확인 상태 조회 실패", error);
    return NextResponse.json({ ok: false, error: "계약서의 확인 상태를 불러오지 못했습니다." }, { status: 500 });
  }
  const conflict = () => NextResponse.json({
    ok: false, error: "다른 화면에서 계약서가 변경되었습니다. 입력 내용을 복사한 뒤 계약서를 다시 열어 주세요.",
  }, { status: 409 });
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== current.updated_at) return conflict();
  update.updated_at = new Date(Math.max(Date.now(), (Date.parse(current.updated_at ?? "") || 0) + 1)).toISOString();
  if (body.signatureDataUrl !== undefined) update.signature_data_url = body.signatureDataUrl;
  if (typeof body.hospitalName === "string") {
    update.hospital_name = body.hospitalName;
    // 모달 모드에서는 이미 알고 있는 정확한 clientId로 연결한다(이름매칭으로 재추론하면
    // 편집 중 병원명이 살짝 바뀔 때마다 다른 고객으로 잘못 연결될 위험이 있다).
    update.client_id = typeof body.clientId === "string" && body.clientId || await resolveClientId(supabase, body.hospitalName);
  } else if (typeof body.clientId === "string" && body.clientId) {
    update.client_id = body.clientId;
  }
  if (body.contactName !== undefined) update.contact_name = body.contactName;
  if (body.email !== undefined) update.email = body.email;
  if (body.status !== undefined) update.status = body.status;

  // ContractBuilder는 모달/URL에서 이미 아는 workflowRunId를 매 저장마다 body.workflowRunId로
  // 보내는데 여기서 계속 무시하고 있었다 — client_id가 확정되는 순간(위에서 계산됨)엔 그 값이
  // 없어도 조회해서 채운다. 콘티/견적서와 같은 이유(정합성 점검·업무완료 체크가 workflow_run_id로
  // 찾음)로 비어 있으면 안 된다.
  if (update.client_id) {
    update.workflow_run_id = await resolveWorkflowRunId(supabase, typeof body.workflowRunId === "string" ? body.workflowRunId : undefined, update.client_id as string);
  }

  let mutation = supabase.from("contracts").update(update).eq("id", id).eq("status", current.status);
  mutation = current.updated_at == null ? mutation.is("updated_at", null) : mutation.eq("updated_at", current.updated_at);
  const { data: saved, error } = await mutation.select("updated_at").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!saved) return conflict();

  // 저장(자동저장 포함)은 임시저장일 뿐이다 — 워크플로우 전진은 실제 "포털 공개" 버튼을 눌러
  // /api/contracts/[id]/publish를 호출했을 때만 일어난다(그래야 팝업만 닫고 공개를 안 눌러도
  // 다음 단계로 넘어가버리는 일이 없다). 여기서 자동 전진 호출 제거.
  return NextResponse.json({ ok: true, updatedAt: saved.updated_at });
}
