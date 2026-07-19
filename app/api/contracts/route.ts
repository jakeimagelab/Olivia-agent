import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const clientId = await resolveClientId(supabase, body.hospitalName);
  const workflowRunId = typeof body.workflowRunId === "string" && body.workflowRunId
    ? body.workflowRunId
    : clientId
      ? (await supabase.from("workflow_runs").select("id").eq("client_id", clientId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.id ?? null
      : null;

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
  return NextResponse.json({ ok: true, id: data.id, createdAt: data.created_at });
}
