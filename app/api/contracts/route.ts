import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";
import { logPortalEvent } from "@/lib/clientPortal";
import { resolveWorkflowRunId } from "@/lib/workflowRunLookup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  if (workflowRunId) {
    await completeOpenStepTasksForManualSave(supabase, workflowRunId, "contract").catch(() => {});
    await maybeAdvanceWorkflow(supabase, workflowRunId, "contract").catch((err) => {
      console.error("[contracts] maybeAdvanceWorkflow 실패", err);
    });
  }
  return NextResponse.json({ ok: true, id: data.id, createdAt: data.created_at });
}
