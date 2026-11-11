import type { NextRequest } from "next/server";
import { deliveryAccessSummary, loadDeliveryItems } from "@/lib/person-select/deliveryServer";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";
import { resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken, { touch: true });
    await enforcePublicSelectionRateLimit({ db, request, token: `delivery:${reviewer.id}`, action: "person-shared-delivery-read", limit: 120, identityOnly: true });
    if (event.customer_stage !== "delivery") return Response.json({ ok: false, error: "현재는 원본 사진 선택 단계입니다." }, { status: 409 });
    const items = await loadDeliveryItems(db, { eventId: event.id });
    const access = deliveryAccessSummary({ owner: event, retentionDays: event.delivery_retention_days ?? 30 });
    return Response.json({
      ok: true,
      event: { title: event.title, retentionDays: event.delivery_retention_days ?? 30 },
      viewer: { displayName: reviewer.display_name, canFinalize: reviewer.can_finalize !== false },
      access,
      items,
    });
  } catch (error) { return publicSelectionErrorResponse(error); }
}
