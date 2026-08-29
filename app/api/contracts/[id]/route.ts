import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";
import { resolveWorkflowRunId } from "@/lib/workflowRunLookup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(_req: NextRequest, ctx: any) {
  const { id } = await ctx.params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("contracts").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  return NextResponse.json({ ok: true, data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function PATCH(req: NextRequest, ctx: any) {
  const { id } = await ctx.params;
  const body = await req.json();
  const supabase = getSupabaseAdmin();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.quoteData !== undefined) update.quote_data = body.quoteData;
  if (body.signatureDataUrl !== undefined) update.signature_data_url = body.signatureDataUrl;
  if (body.hospitalName !== undefined) {
    update.hospital_name = body.hospitalName;
    // 모달 모드에서는 이미 알고 있는 정확한 clientId로 연결한다(이름매칭으로 재추론하면
    // 편집 중 병원명이 살짝 바뀔 때마다 다른 고객으로 잘못 연결될 위험이 있다).
    update.client_id = body.clientId || await resolveClientId(supabase, body.hospitalName);
  } else if (body.clientId) {
    update.client_id = body.clientId;
  }
  if (body.contactName !== undefined) update.contact_name = body.contactName;
  if (body.email !== undefined) update.email = body.email;
  // 채팅 계약 워크플로우(2026-08-30)가 추가한 필드 — 안 보내면 기존 호출부(페이지 저장/자동저장)
  // 동작과 100% 동일하다.
  if (body.depositRate !== undefined) update.deposit_rate = body.depositRate;
  if (body.paymentTerms !== undefined) update.payment_terms = body.paymentTerms;
  if (body.deliveryTerms !== undefined) update.delivery_terms = body.deliveryTerms;
  if (body.specialTerms !== undefined) update.special_terms = body.specialTerms;
  if (body.status !== undefined) update.status = body.status;

  // ContractBuilder는 모달/URL에서 이미 아는 workflowRunId를 매 저장마다 body.workflowRunId로
  // 보내는데 여기서 계속 무시하고 있었다 — client_id가 확정되는 순간(위에서 계산됨)엔 그 값이
  // 없어도 조회해서 채운다. 콘티/견적서와 같은 이유(정합성 점검·업무완료 체크가 workflow_run_id로
  // 찾음)로 비어 있으면 안 된다.
  if (update.client_id) {
    update.workflow_run_id = await resolveWorkflowRunId(supabase, body.workflowRunId, update.client_id as string);
  }

  const { error } = await supabase.from("contracts").update(update).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // 저장(자동저장 포함)은 임시저장일 뿐이다 — 워크플로우 전진은 실제 "포털 공개" 버튼을 눌러
  // /api/contracts/[id]/publish를 호출했을 때만 일어난다(그래야 팝업만 닫고 공개를 안 눌러도
  // 다음 단계로 넘어가버리는 일이 없다). 여기서 자동 전진 호출 제거.
  return NextResponse.json({ ok: true });
}
