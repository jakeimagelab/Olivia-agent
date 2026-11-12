import type { SupabaseClient } from "@supabase/supabase-js";
import { mergePersonSelectClientImages } from "@/lib/person-select/imagePageClient";
import {
  getLatestSharedPersonSelectSelection,
  sharedDraftResponse,
  type SharedPersonSelectReviewer,
} from "@/lib/person-select/sharedPublic";
import {
  loadPersonSelectFolderManifest,
  loadPersonSelectImagePage,
  loadPersonSelectImagesByIds,
} from "./imageRepository";

export async function loadSharedProjectSelectBootstrap(
  db: SupabaseClient,
  eventId: string,
  reviewer: Pick<SharedPersonSelectReviewer, "id">,
) {
  const [manifest, page, draftResult, selection] = await Promise.all([
    loadPersonSelectFolderManifest(db, eventId),
    loadPersonSelectImagePage(db, eventId, { location: "all", limit: 72 }),
    db.from("person_select_shared_drafts")
      .select("*")
      .eq("event_id", eventId)
      .eq("reviewer_id", reviewer.id)
      .maybeSingle(),
    getLatestSharedPersonSelectSelection(db, eventId, reviewer.id),
  ]);
  if (draftResult.error) throw draftResult.error;
  const draft = sharedDraftResponse(draftResult.data);
  const selectedIds = [...new Set([
    ...draft.selectedImageIds,
    ...(selection?.items ?? []).map((item: { image_id: unknown }) => String(item.image_id)),
  ])];
  const selectedImages = await loadPersonSelectImagesByIds(db, eventId, selectedIds);
  return {
    manifest,
    page,
    images: mergePersonSelectClientImages(page.items, selectedImages),
    draft,
    selection,
  };
}
