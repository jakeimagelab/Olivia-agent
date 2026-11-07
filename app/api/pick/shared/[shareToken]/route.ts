import { NextRequest } from "next/server";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";
import { getLatestSharedPersonSelectSelection, getSharedPersonSelectImages, resolveSharedPersonSelectAccess, sharedDraftResponse, sharedPersonSelectEventResponse } from "@/lib/person-select/sharedPublic";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-read", limit: 120 });
    const access = await resolveSharedPersonSelectAccess(db, shareToken, { touch: true });
    const { event, reviewer } = access;
    const [images, { data: draft }, selection] = await Promise.all([
      getSharedPersonSelectImages(db, event.id),
      db.from("person_select_shared_drafts").select("*").eq("event_id", event.id).eq("reviewer_id", reviewer.id).maybeSingle(),
      getLatestSharedPersonSelectSelection(db, event.id, reviewer.id),
    ]);
    return Response.json({ ok: true, event: sharedPersonSelectEventResponse(event), reviewer, images, draft: sharedDraftResponse(draft), selection });
  } catch (error) { return publicSelectionErrorResponse(error); }
}
