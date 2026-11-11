import type { NextRequest } from "next/server";
import { createDeliveryDownloadUrls, deliveryAccessSummary } from "@/lib/person-select/deliveryServer";
import { getPublicSessionContext } from "@/lib/person-select/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  if (ctx.event.customer_stage !== "delivery") return Response.json({ ok: false, error: "현재는 보정본 확인 단계가 아닙니다." }, { status: 409 });
  const db = getSupabaseAdmin();
  try { await enforcePublicSelectionRateLimit({ db, request, token: `delivery:${ctx.person.id}`, action: "person-delivery-download", limit: 12, windowSeconds: 300, identityOnly: true }); }
  catch (error) { return publicSelectionErrorResponse(error); }
  const access = deliveryAccessSummary({ owner: ctx.person, retentionDays: ctx.event.delivery_retention_days ?? 30 });
  if (!access.downloadAvailable) return Response.json({ ok: false, error: access.expired ? "보관 기간이 끝났습니다. 포토클리닉에 요청해 주세요." : "최종 확인 후 다운로드할 수 있습니다." }, { status: 403 });
  const files = await createDeliveryDownloadUrls(db, { eventId: ctx.event.id, personId: ctx.person.id });
  const now = new Date().toISOString();
  if (!ctx.person.delivery_downloaded_at) await db.from("person_select_people").update({ delivery_downloaded_at: now, updated_at: now }).eq("id", ctx.person.id);
  return Response.json({ ok: true, expiresIn: 600, files });
}
