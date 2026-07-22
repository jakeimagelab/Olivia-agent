import { NextRequest, NextResponse } from "next/server";
import { createClientWithWorkflow } from "@/lib/clients/createClientWithWorkflow";
import { markOliviaEventProcessed } from "@/lib/olivia/events";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  const { data: event, error } = await db.from("olivia_events").select("*").eq("id", id).eq("event_type", "client.registration_suggested").maybeSingle();
  if (error || !event) return NextResponse.json({ ok: false, error: error?.message || "등록 제안을 찾지 못했습니다." }, { status: 404 });

  if (body.operation === "dismiss") {
    await db.from("olivia_events").update({ event_status: "ignored", processed_at: new Date().toISOString() }).eq("id", id);
    await db.from("olivia_insights").update({ status: "dismissed", dismissed_reason: "신규 고객 등록 제안 무시" }).eq("event_id", id);
    return NextResponse.json({ ok: true, message: "신규 고객 등록 제안을 닫았습니다." });
  }

  const { data: claimed } = await db.from("olivia_events")
    .update({ event_status: "processing" })
    .eq("id", id)
    .eq("event_status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) {
    if (event.event_status === "processed") return NextResponse.json({ ok: true, message: "이미 고객등록이 완료된 제안입니다." });
    return NextResponse.json({ ok: false, error: "다른 요청에서 처리 중이거나 닫힌 제안입니다." }, { status: 409 });
  }

  try {
    const payload = event.payload || {};
    const result = await createClientWithWorkflow(db, {
      hospitalName: String(payload.hospitalName || ""),
      startStepKey: String(payload.suggestedStep || "consult_meeting"),
      eventSource: "olivia_client_candidate",
    });
    if (payload.sourceType === "quote") {
      await db.from("quotes").update({ client_id: result.client.id }).eq("id", payload.sourceRecordId);
    } else if (payload.sourceType === "conti") {
      await db.from("conti_saves").update({ client_id: result.client.id, workflow_run_id: result.run?.id ?? null }).eq("id", payload.sourceRecordId);
    }
    await markOliviaEventProcessed(db, id);
    await db.from("olivia_insights").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("event_id", id);
    return NextResponse.json({
      ok: true,
      message: `${result.client.hospital_name} 고객등록을 완료하고 ${payload.suggestedStep || "consult_meeting"} 단계에 연결했습니다.`,
      clientId: result.client.id,
      workflowRunId: result.run?.id ?? null,
    });
  } catch (registerError) {
    await db.from("olivia_events").update({ event_status: "pending", error_message: registerError instanceof Error ? registerError.message.slice(0, 1000) : String(registerError).slice(0, 1000) }).eq("id", id);
    return NextResponse.json({ ok: false, error: registerError instanceof Error ? registerError.message : "고객등록 실패" }, { status: 500 });
  }
}
