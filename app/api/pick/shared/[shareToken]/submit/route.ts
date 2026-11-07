import { NextRequest } from "next/server";
import { enforcePublicSelectionRateLimit, parsePublicSelectionSubmit, publicSelectionErrorResponse, readPublicSelectionJson } from "@/lib/select-gallery/publicSelection";
import { getLatestSharedPersonSelectSelection, getSharedPersonSelectImageIds, resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-submit", limit: 15, windowSeconds: 300 });
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    const imageIds = await getSharedPersonSelectImageIds(db, event.id);
    const parsed = parsePublicSelectionSubmit(await readPublicSelectionJson(request), new Set(imageIds));
    const { data, error } = await db.rpc("submit_person_select_shared_v2", {
      p_event_id: event.id,
      p_reviewer_id: reviewer.id,
      p_request_key: parsed.requestKey,
      p_items: parsed.items.map((item) => ({ image_id: item.imageId, rating: item.rating, color_label: item.colorLabel, memo: item.memo })),
      p_customer_memo: parsed.customerMemo,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    const selection = await getLatestSharedPersonSelectSelection(db, event.id, reviewer.id);
    if (!result?.selection_id || !selection) throw new Error("제출 결과를 확인하지 못했습니다.");
    return Response.json({ ok: true, created: Boolean(result.created), selection });
  } catch (error) { return publicSelectionErrorResponse(error); }
}
