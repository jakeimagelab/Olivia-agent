import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { linkNewClientToQuote, resolveQuoteClient } from "@/lib/olivia/tools/quoteClientLink";
import { isMissingColumnError } from "@/lib/dbErrors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const db = getSupabaseAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const { data: quote, error } = await db.from("quotes").select("*").eq("id", id).maybeSingle();
    if (error || !quote) return NextResponse.json({ ok: false, error: "승인할 견적서를 찾지 못했습니다." }, { status: 404 });

    const match = await resolveQuoteClient(db, quote);
    if (match.status === "ambiguous" && !body.clientId) {
      return NextResponse.json({ ok: false, requiresClientChoice: true, candidates: match.candidates }, { status: 409 });
    }

    let clientId = quote.client_id as string | null;
    let workflowRunId = quote.workflow_run_id as string | null;
    if (!clientId) {
      const chosenClientId = body.clientId || (match.status === "match" ? match.candidates[0]?.id : null);
      const linked = await linkNewClientToQuote(db, {
        resourceId: id,
        clientId: chosenClientId,
        hospitalName: quote.hospital_name,
        contactName: quote.contact_name,
        phone: quote.phone,
        email: quote.email,
      });
      clientId = linked.client.id;
      workflowRunId = linked.workflowRunId;
    }

    const approvedAt = new Date().toISOString();
    let approval = await db.from("quotes").update({ status: "approved", approved_at: approvedAt }).eq("id", id);
    if (isMissingColumnError(approval.error)) {
      approval = await db.from("quotes").update({ status: "approved" }).eq("id", id);
    }
    if (approval.error) throw approval.error;

    return NextResponse.json({ ok: true, clientId, workflowRunId, approvedAt });
  } catch (error) {
    console.error("[clients/quotes/approve]", error);
    return NextResponse.json({ ok: false, error: "견적 승인과 고객 연결을 마치지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
