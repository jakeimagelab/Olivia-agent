import type { NextRequest } from "next/server";
import { getPublicSessionContext } from "@/lib/person-select/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventSlug: string; deliveryId: string }> }) {
  const { eventSlug, deliveryId } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  if (ctx.event.customer_stage !== "delivery") return Response.json({ ok: false, error: "현재는 보정본 확인 단계가 아닙니다." }, { status: 409 });
  if (ctx.person.delivery_state === "approved") return Response.json({ ok: false, error: "최종 확인이 끝난 보정본입니다. 다시 열기는 포토클리닉에 요청해 주세요." }, { status: 423 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action;
  const memo = typeof body.memo === "string" ? body.memo.trim() : "";
  if (action !== "approve" && action !== "request_revision") return Response.json({ ok: false, error: "올바른 확인 작업이 아닙니다." }, { status: 400 });
  if (action === "request_revision" && !memo) return Response.json({ ok: false, error: "수정 요청 내용을 적어 주세요." }, { status: 400 });
  if (memo.length > 2_000) return Response.json({ ok: false, error: "수정 요청은 2000자까지 적을 수 있습니다." }, { status: 400 });
  const db = getSupabaseAdmin();
  try { await enforcePublicSelectionRateLimit({ db, request, token: `delivery:${ctx.person.id}`, action: "person-delivery-write", limit: 90, identityOnly: true }); }
  catch (error) { return publicSelectionErrorResponse(error); }
  const { data: owned } = await db.from("person_select_deliveries").select("id")
    .eq("id", deliveryId).eq("event_id", ctx.event.id).eq("person_id", ctx.person.id).maybeSingle();
  if (!owned) return Response.json({ ok: false, error: "이 고객에게 전달된 사진이 아닙니다." }, { status: 404 });
  const now = new Date().toISOString();
  const { data, error } = await db.from("person_select_deliveries").update({
    status: action === "approve" ? "approved" : "revision_requested",
    customer_memo: action === "approve" ? "" : memo,
    updated_at: now,
  }).eq("id", deliveryId).select("id,status,customer_memo,updated_at").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (ctx.person.delivery_state === "none") await db.from("person_select_people").update({ delivery_state: "reviewing", updated_at: now }).eq("id", ctx.person.id);
  return Response.json({ ok: true, item: data });
}
