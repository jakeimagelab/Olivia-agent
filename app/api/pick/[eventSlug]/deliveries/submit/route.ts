import type { NextRequest } from "next/server";
import { canFinalizeDeliveries, type PersonSelectDeliveryStatus } from "@/lib/person-select/deliveries";
import { notifyPersonSelectDelivery } from "@/lib/person-select/deliveryNotifications";
import { getPublicSessionContext } from "@/lib/person-select/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  if (ctx.event.customer_stage !== "delivery") return Response.json({ ok: false, error: "현재는 보정본 확인 단계가 아닙니다." }, { status: 409 });
  if (ctx.person.delivery_state === "approved") return Response.json({ ok: true, state: "approved", approvedAt: ctx.person.delivery_approved_at });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action;
  if (action !== "submit_revisions" && action !== "finalize") return Response.json({ ok: false, error: "올바른 제출 작업이 아닙니다." }, { status: 400 });
  const db = getSupabaseAdmin();
  try { await enforcePublicSelectionRateLimit({ db, request, token: `delivery:${ctx.person.id}`, action: "person-delivery-submit", limit: 30, identityOnly: true }); }
  catch (error) { return publicSelectionErrorResponse(error); }
  const { data, error } = await db.from("person_select_deliveries").select("status")
    .eq("event_id", ctx.event.id).eq("person_id", ctx.person.id);
  if (error) throw error;
  const statuses = (data ?? []).map((item) => item.status as PersonSelectDeliveryStatus);
  const now = new Date().toISOString();
  if (action === "submit_revisions") {
    if (!statuses.includes("revision_requested")) return Response.json({ ok: false, error: "보낼 수정 요청이 없습니다." }, { status: 409 });
    const { error: updateError } = await db.from("person_select_people").update({ delivery_state: "revision_sent", updated_at: now }).eq("id", ctx.person.id);
    if (updateError) throw updateError;
    await notifyPersonSelectDelivery(db, { eventId: ctx.event.id, eventTitle: ctx.event.title, actorName: ctx.person.display_name, action: "revision_sent", count: statuses.filter((status) => status === "revision_requested").length, at: now });
    return Response.json({ ok: true, state: "revision_sent" });
  }
  if (!canFinalizeDeliveries(statuses)) return Response.json({ ok: false, error: "모든 보정본을 확인한 뒤 최종 확인할 수 있습니다." }, { status: 409 });
  const { error: updateError } = await db.from("person_select_people").update({
    delivery_state: "approved",
    delivery_approved_at: now,
    delivery_downloaded_at: null,
    delivery_files_purged_at: null,
    updated_at: now,
  }).eq("id", ctx.person.id);
  if (updateError) throw updateError;
  await notifyPersonSelectDelivery(db, { eventId: ctx.event.id, eventTitle: ctx.event.title, actorName: ctx.person.display_name, action: "approved", count: statuses.length, at: now });
  return Response.json({ ok: true, state: "approved", approvedAt: now });
}
