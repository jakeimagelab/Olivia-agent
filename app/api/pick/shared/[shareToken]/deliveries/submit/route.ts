import type { NextRequest } from "next/server";
import { canFinalizeDeliveries, type PersonSelectDeliveryStatus } from "@/lib/person-select/deliveries";
import { notifyPersonSelectDelivery } from "@/lib/person-select/deliveryNotifications";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";
import { resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken, { touch: true });
    await enforcePublicSelectionRateLimit({ db, request, token: `delivery:${reviewer.id}`, action: "person-shared-delivery-submit", limit: 30, identityOnly: true });
    if (event.customer_stage !== "delivery") return Response.json({ ok: false, error: "현재는 보정본 확인 단계가 아닙니다." }, { status: 409 });
    if (event.delivery_state === "approved") return Response.json({ ok: true, state: "approved", approvedAt: event.delivery_approved_at });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = body.action;
    if (action !== "submit_revisions" && action !== "finalize") return Response.json({ ok: false, error: "올바른 제출 작업이 아닙니다." }, { status: 400 });
    const { data, error } = await db.from("person_select_deliveries").select("status").eq("event_id", event.id).is("person_id", null);
    if (error) throw error;
    const statuses = (data ?? []).map((item) => item.status as PersonSelectDeliveryStatus);
    const now = new Date().toISOString();
    if (action === "submit_revisions") {
      if (!statuses.includes("revision_requested")) return Response.json({ ok: false, error: "보낼 수정 요청이 없습니다." }, { status: 409 });
      const { error: updateError } = await db.from("person_select_events").update({ delivery_state: "revision_sent", updated_at: now }).eq("id", event.id);
      if (updateError) throw updateError;
      await notifyPersonSelectDelivery(db, { eventId: event.id, eventTitle: event.title, actorName: reviewer.display_name, action: "revision_sent", count: statuses.filter((status) => status === "revision_requested").length, at: now });
      return Response.json({ ok: true, state: "revision_sent" });
    }
    if (reviewer.can_finalize === false) return Response.json({ ok: false, error: "최종 확정 권한이 없습니다." }, { status: 403 });
    if (!canFinalizeDeliveries(statuses)) return Response.json({ ok: false, error: "모든 보정본을 확인한 뒤 최종 확인할 수 있습니다." }, { status: 409 });
    const { error: updateError } = await db.from("person_select_events").update({
      delivery_state: "approved",
      delivery_approved_at: now,
      delivery_downloaded_at: null,
      delivery_files_purged_at: null,
      updated_at: now,
    }).eq("id", event.id);
    if (updateError) throw updateError;
    await notifyPersonSelectDelivery(db, { eventId: event.id, eventTitle: event.title, actorName: reviewer.display_name, action: "approved", count: statuses.length, at: now });
    return Response.json({ ok: true, state: "approved", approvedAt: now });
  } catch (error) { return publicSelectionErrorResponse(error); }
}
