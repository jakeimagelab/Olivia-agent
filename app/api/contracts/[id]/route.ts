import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";

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

  const { error } = await supabase.from("contracts").update(update).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // 계약서를 실제 도구에서 직접 수정/저장하는 것도 견적서와 동일하게 업무 이벤트로 보고
  // 워크플로우를 자동으로 진행시킨다 — POST(최초 생성)에서만 하던 걸 PATCH(수정 저장)에도
  // 동일하게 적용한다. 모달 자동저장은 대부분 이 PATCH 경로를 타기 때문에 필수.
  const workflowRunId = body.workflowRunId;
  if (workflowRunId) {
    await completeOpenStepTasksForManualSave(supabase, workflowRunId, "contract").catch(() => {});
    await maybeAdvanceWorkflow(supabase, workflowRunId, "contract").catch((err) => {
      console.error("[contracts] maybeAdvanceWorkflow 실패", err);
    });
  }
  return NextResponse.json({ ok: true });
}
