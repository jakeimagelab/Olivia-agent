import type { NextRequest } from "next/server";
import { createDeliveryDownloadUrls, deliveryAccessSummary } from "@/lib/person-select/deliveryServer";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";
import { resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken, { touch: true });
    await enforcePublicSelectionRateLimit({ db, request, token: `delivery:${reviewer.id}`, action: "person-shared-delivery-download", limit: 12, windowSeconds: 300, identityOnly: true });
    if (event.customer_stage !== "delivery") return Response.json({ ok: false, error: "현재는 보정본 확인 단계가 아닙니다." }, { status: 409 });
    const access = deliveryAccessSummary({ owner: event, retentionDays: event.delivery_retention_days ?? 30 });
    if (!access.downloadAvailable) return Response.json({ ok: false, error: access.expired ? "보관 기간이 끝났습니다. 포토클리닉에 요청해 주세요." : "최종 확인 후 다운로드할 수 있습니다." }, { status: 403 });
    const files = await createDeliveryDownloadUrls(db, { eventId: event.id });
    const now = new Date().toISOString();
    if (!event.delivery_downloaded_at) await db.from("person_select_events").update({ delivery_downloaded_at: now, updated_at: now }).eq("id", event.id);
    return Response.json({ ok: true, expiresIn: 600, files });
  } catch (error) { return publicSelectionErrorResponse(error); }
}
