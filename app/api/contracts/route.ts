import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";
import { logPortalEvent } from "@/lib/clientPortal";
import { resolveWorkflowRunId } from "@/lib/workflowRunLookup";
import { contractContentUpdate } from "@/lib/contract/contractEdits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 50)));
    const sourceQuoteId = req.nextUrl.searchParams.get("sourceQuoteId");
    const query = getSupabaseAdmin().from("contracts").select("*");
    const { data, error } = await (sourceQuoteId ? query.eq("source_quote_id", sourceQuoteId) : query)
      .order("updated_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return NextResponse.json({ ok: true, contracts: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, contracts: [], error: error instanceof Error ? error.message : "계약서 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "계약서 저장 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  let content: Record<string, unknown>;
  try {
    content = contractContentUpdate(body);
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }
  const clientId = body.clientId || await resolveClientId(supabase, body.hospitalName);
  const workflowRunId = await resolveWorkflowRunId(supabase, body.workflowRunId, clientId);

  const { data, error } = await supabase
    .from("contracts")
    .insert({
      quote_number: body.quoteNumber ?? null,
      hospital_name: body.hospitalName ?? "",
      client_id: clientId,
      workflow_run_id: workflowRunId,
      source_quote_id: body.sourceQuoteId ?? null,
      contact_name: body.contactName ?? "",
      email: body.email ?? "",
      quote_data: {},
      ...content,
      signature_data_url: body.signatureDataUrl ?? null,
    })
    .select("id, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (clientId) {
    await logPortalEvent({ clientId, workflowRunId, eventType: "contract_ready", targetType: "contracts", targetId: data.id }).catch((error) => { console.error("[OLIVIA] Suppressed promise rejection", error); });
  }
  // 최초 생성도 임시저장일 뿐 — 워크플로우 전진은 /api/contracts/[id]/publish("포털 공개")에서만.
  return NextResponse.json({ ok: true, id: data.id, createdAt: data.created_at, updatedAt: data.updated_at });
}
