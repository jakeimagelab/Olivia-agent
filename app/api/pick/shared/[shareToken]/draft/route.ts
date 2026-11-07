import { NextRequest } from "next/server";
import { enforcePublicSelectionRateLimit, parsePublicSelectionDraft, publicSelectionErrorResponse, readPublicSelectionJson } from "@/lib/select-gallery/publicSelection";
import { getSharedPersonSelectImageIds, resolveSharedPersonSelectAccess, sharedDraftResponse } from "@/lib/person-select/sharedPublic";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-draft-read", limit: 120 });
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    const { data, error } = await db.from("person_select_shared_drafts").select("*").eq("event_id", event.id).eq("reviewer_id", reviewer.id).maybeSingle();
    if (error) throw error;
    return Response.json({ ok: true, draft: sharedDraftResponse(data) });
  } catch (error) { return publicSelectionErrorResponse(error); }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-draft-write", limit: 90 });
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    const imageIds = await getSharedPersonSelectImageIds(db, event.id);
    const parsed = parsePublicSelectionDraft(await readPublicSelectionJson(request), new Set(imageIds));
    const storedItems = parsed.items.map((item) => ({ image_id: item.imageId, customer_rating: item.rating, customer_color_label: item.colorLabel, memo: item.memo }));
    const { data, error } = await db.rpc("save_person_select_shared_draft_v2", {
      p_event_id: event.id,
      p_reviewer_id: reviewer.id,
      p_expected_revision: parsed.revision,
      p_items: storedItems,
      p_customer_memo: parsed.customerMemo,
    });
    if (error) {
      if (/draft_revision_conflict|40001/i.test(error.message)) {
        const { data: latest } = await db.from("person_select_shared_drafts").select("*").eq("event_id", event.id).eq("reviewer_id", reviewer.id).maybeSingle();
        return Response.json({ ok: false, error: "다른 담당자가 선택 내용을 변경했습니다.", draft: sharedDraftResponse(latest) }, { status: 409 });
      }
      throw error;
    }
    return Response.json({ ok: true, draft: sharedDraftResponse(Array.isArray(data) ? data[0] : data) });
  } catch (error) { return publicSelectionErrorResponse(error); }
}
