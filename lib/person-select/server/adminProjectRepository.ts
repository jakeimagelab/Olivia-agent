import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllPersonSelectRows } from "../paging";

const PERSON_FIELDS = "id,event_id,display_name,login_name,group_label,first_seen_at,last_seen_at,submitted_at,updated_at,orders,orders_updated_at";
const PERSON_DELIVERY_FIELDS = `${PERSON_FIELDS},delivery_state,delivery_approved_at,delivery_downloaded_at,delivery_files_purged_at,delivery_retention_extended_until`;

export function isDeliveryCompatibilityError(error: { message?: string; code?: string } | null | undefined) {
  return Boolean(error && /delivery_|schema cache|does not exist/i.test(`${error.message ?? ""} ${error.code ?? ""}`));
}

export function latestSharedSelectionByReviewer<T extends { reviewer_id: string }>(selections: readonly T[]) {
  const latest = new Map<string, T>();
  for (const selection of selections) {
    if (!latest.has(selection.reviewer_id)) latest.set(selection.reviewer_id, selection);
  }
  return latest;
}

export async function loadAdminPeople(db: SupabaseClient, eventId: string) {
  const enriched = await db.from("person_select_people")
    .select(PERSON_DELIVERY_FIELDS)
    .eq("event_id", eventId)
    .order("display_name");
  if (!enriched.error || !isDeliveryCompatibilityError(enriched.error)) return enriched;
  return db.from("person_select_people")
    .select(PERSON_FIELDS)
    .eq("event_id", eventId)
    .order("display_name");
}

export async function loadAdminProjectBase(db: SupabaseClient, eventId: string) {
  const [eventResult, peopleResult, choices, images] = await Promise.all([
    db.from("person_select_events").select("*").eq("id", eventId).single(),
    loadAdminPeople(db, eventId),
    readAllPersonSelectRows((from, to) => db.from("person_select_choices")
      .select("id,event_id,person_id,category_key,image_id,retouch_keys,memo,updated_at,person_select_images(original_file_name,source_rel_path,thumb_path)")
      .eq("event_id", eventId)
      .order("id")
      .range(from, to)),
    readAllPersonSelectRows((from, to) => db.from("person_select_images")
      .select("id,owner_person_id,owner_group,category_key,original_file_name,source_rel_path,thumb_path,preview_path,sort_order")
      .eq("event_id", eventId)
      .order("sort_order")
      .order("id")
      .range(from, to)),
  ]);
  if (eventResult.error) throw eventResult.error;
  if (peopleResult.error) throw peopleResult.error;
  return {
    event: eventResult.data,
    people: peopleResult.data ?? [],
    choices,
    images,
  };
}

export async function loadOpenSelectionSaveFailures(db: SupabaseClient, eventId: string) {
  const result = await db.from("person_select_selection_save_failures")
    .select("actor_type,actor_id,occurred_at,error_message")
    .eq("event_id", eventId)
    .is("recovered_at", null)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (!result.error) return result.data ?? [];
  if (isDeliveryCompatibilityError(result.error) || /relation .* does not exist/i.test(`${result.error.message} ${result.error.code ?? ""}`)) return [];
  throw result.error;
}

export async function loadSharedAdminProjectState(db: SupabaseClient, eventId: string) {
  const [reviewersResult, draftsResult, selectionsResult] = await Promise.all([
    db.from("person_select_shared_reviewers")
      .select("id,display_name,role_label,token_version,active,is_legacy,last_seen_at,can_view_ai_results,can_download_jpg,can_download_raw,can_finalize,created_at,updated_at")
      .eq("event_id", eventId)
      .order("is_legacy", { ascending: false })
      .order("created_at"),
    db.from("person_select_shared_drafts")
      .select("reviewer_id,revision,items,customer_memo,updated_at")
      .eq("event_id", eventId),
    db.from("person_select_shared_selections")
      .select("id,reviewer_id,submitted_at,customer_memo,revision")
      .eq("event_id", eventId)
      .order("submitted_at", { ascending: false }),
  ]);
  if (reviewersResult.error || draftsResult.error || selectionsResult.error) {
    throw reviewersResult.error ?? draftsResult.error ?? selectionsResult.error;
  }
  const reviewers = reviewersResult.data ?? [];
  const drafts = draftsResult.data ?? [];
  const selections = selectionsResult.data ?? [];
  const latestByReviewer = latestSharedSelectionByReviewer(selections);
  const latestSelectionIds = [...latestByReviewer.values()].map((selection) => selection.id);
  const selectedItemsResult = latestSelectionIds.length
    ? await db.from("person_select_shared_selection_items")
      .select("selection_id,reviewer_id,image_id,customer_rating,customer_color_label,memo")
      .in("selection_id", latestSelectionIds)
    : { data: [], error: null };
  if (selectedItemsResult.error) throw selectedItemsResult.error;
  return {
    reviewers,
    drafts,
    selections,
    latestByReviewer,
    selectedItems: selectedItemsResult.data ?? [],
  };
}
