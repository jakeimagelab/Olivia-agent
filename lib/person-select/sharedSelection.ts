import type { SupabaseClient } from "@supabase/supabase-js";

import { getOwnedSelectionImageIds } from "@/lib/select-gallery/publicSelection";
import { customerSelectionSnapshotFromRows } from "./domain/selectionSnapshot";
import { readAllPersonSelectRows } from "./paging";

export async function getSharedPersonSelectImageIds(db: SupabaseClient, eventId: string) {
  const rows = await readAllPersonSelectRows((from, to) => db.from("person_select_images")
    .select("id")
    .eq("event_id", eventId)
    .order("id")
    .range(from, to));
  return rows.map((row) => String(row.id));
}

export async function getSharedPersonSelectOwnedImageIds(db: SupabaseClient, eventId: string, body: unknown) {
  return getOwnedSelectionImageIds(db, {
    table: "person_select_images",
    ownerColumn: "event_id",
    ownerId: eventId,
  }, body);
}

export function sharedDraftResponse(draft: any | null) {
  const rows = Array.isArray(draft?.items) ? draft.items : [];
  return customerSelectionSnapshotFromRows({
    revision: draft?.revision,
    rows,
    customerMemo: draft?.customer_memo,
    updatedAt: draft?.updated_at,
  });
}

export async function getLatestSharedPersonSelectSelection(
  db: SupabaseClient,
  eventId: string,
  reviewerId?: string,
) {
  let query = db.from("person_select_shared_selections").select("*").eq("event_id", eventId);
  if (reviewerId) query = query.eq("reviewer_id", reviewerId);
  const { data: selection, error } = await query.order("submitted_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!selection) return null;
  const { data: items, error: itemsError } = await db
    .from("person_select_shared_selection_items")
    .select("image_id,customer_rating,customer_color_label,memo")
    .eq("selection_id", selection.id);
  if (itemsError) throw itemsError;
  return { ...selection, items: items ?? [] };
}
