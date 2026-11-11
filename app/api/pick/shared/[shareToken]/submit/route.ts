import { NextRequest } from "next/server";
import { enforcePublicSelectionRateLimit, parsePublicSelectionSubmit, publicSelectionErrorResponse, readPublicSelectionJson } from "@/lib/select-gallery/publicSelection";
import { getLatestSharedPersonSelectSelection, getSharedPersonSelectOwnedImageIds, resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canPersonSelectReviewerFinalize } from "@/lib/person-select/reviewerPermissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-submit", limit: 15, windowSeconds: 300 });
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    if (!canPersonSelectReviewerFinalize(reviewer)) return Response.json({ ok: false, error: "최종 셀렉 확정 권한이 없습니다. 자동 저장된 검토 내용은 유지됩니다." }, { status: 403 });
    const body = await readPublicSelectionJson(request);
    const ownedImageIds = await getSharedPersonSelectOwnedImageIds(db, event.id, body);
    const parsed = parsePublicSelectionSubmit(body, ownedImageIds);
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
