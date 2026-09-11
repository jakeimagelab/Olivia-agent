import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";
import { logPortalEvent } from "@/lib/clientPortal";
import { resolveWorkflowRunId } from "@/lib/workflowRunLookup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 50)));
    const { data, error } = await getSupabaseAdmin()
      .from("contracts")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({ ok: true, contracts: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, contracts: [], error: error instanceof Error ? error.message : "계약서 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const clientId = body.clientId || await resolveClientId(supabase, body.hospitalName);
  const workflowRunId = await resolveWorkflowRunId(supabase, body.workflowRunId, clientId);

  const { data, error } = await supabase
    .from("contracts")
    .insert({
      quote_number: body.quoteNumber ?? null,
      hospital_name: body.hospitalName ?? "",
      client_id: clientId,
      workflow_run_id: workflowRunId,
      contact_name: body.contactName ?? "",
      email: body.email ?? "",
      quote_data: body.quoteData ?? {},
      signature_data_url: body.signatureDataUrl ?? null,
    })
    .select("id, created_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (clientId) {
    await logPortalEvent({ clientId, eventType: "contract_ready", targetType: "contracts", targetId: data.id }).catch(() => {});
  }
  // 최초 생성도 임시저장일 뿐 — 워크플로우 전진은 /api/contracts/[id]/publish("포털 공개")에서만.
  return NextResponse.json({ ok: true, id: data.id, createdAt: data.created_at });
}
