import { NextRequest } from "next/server";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";
import { getLatestSharedPersonSelectSelection, getSharedPersonSelectEvent, getSharedPersonSelectImages, sharedDraftResponse } from "@/lib/person-select/sharedPublic";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-read", limit: 120 });
    const event = await getSharedPersonSelectEvent(db, shareToken);
    const [images, { data: draft }, selection] = await Promise.all([
      getSharedPersonSelectImages(db, event.id),
      db.from("person_select_shared_drafts").select("*").eq("event_id", event.id).maybeSingle(),
      getLatestSharedPersonSelectSelection(db, event.id),
    ]);
    return Response.json({ ok: true, event, images, draft: sharedDraftResponse(draft), selection });
  } catch (error) { return publicSelectionErrorResponse(error); }
}
