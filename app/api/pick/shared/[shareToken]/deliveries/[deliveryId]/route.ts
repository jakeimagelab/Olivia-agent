import type { NextRequest } from "next/server";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";
import { resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ shareToken: string; deliveryId: string }> }) {
  const { shareToken, deliveryId } = await context.params;
  try {
    const db = getSupabaseAdmin();
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken, { touch: true });
    await enforcePublicSelectionRateLimit({ db, request, token: `delivery:${reviewer.id}`, action: "person-shared-delivery-write", limit: 90, identityOnly: true });
    if (event.customer_stage !== "delivery") return Response.json({ ok: false, error: "현재는 보정본 확인 단계가 아닙니다." }, { status: 409 });
    if (event.delivery_state === "approved") return Response.json({ ok: false, error: "최종 확인이 끝난 보정본입니다. 다시 열기는 포토클리닉에 요청해 주세요." }, { status: 423 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = body.action;
    const memo = typeof body.memo === "string" ? body.memo.trim() : "";
    if (action !== "approve" && action !== "request_revision") return Response.json({ ok: false, error: "올바른 확인 작업이 아닙니다." }, { status: 400 });
    if (action === "request_revision" && !memo) return Response.json({ ok: false, error: "수정 요청 내용을 적어 주세요." }, { status: 400 });
    if (memo.length > 2_000) return Response.json({ ok: false, error: "수정 요청은 2000자까지 적을 수 있습니다." }, { status: 400 });
    const { data: owned } = await db.from("person_select_deliveries").select("id")
      .eq("id", deliveryId).eq("event_id", event.id).is("person_id", null).maybeSingle();
    if (!owned) return Response.json({ ok: false, error: "이 프로젝트에 전달된 사진이 아닙니다." }, { status: 404 });
    const now = new Date().toISOString();
    const { data, error } = await db.from("person_select_deliveries").update({
      status: action === "approve" ? "approved" : "revision_requested",
      customer_memo: action === "approve" ? "" : memo,
      updated_at: now,
    }).eq("id", deliveryId).select("id,status,customer_memo,updated_at").single();
    if (error) throw error;
    if (event.delivery_state === "none") await db.from("person_select_events").update({ delivery_state: "reviewing", updated_at: now }).eq("id", event.id);
    return Response.json({ ok: true, item: data });
  } catch (error) { return publicSelectionErrorResponse(error); }
}
