import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllPersonSelectRows } from "./paging";
import { signedImageUrls } from "./server";
import type { PersonSelectEvent } from "./types";
import { PublicSelectionRequestError } from "@/lib/select-gallery/publicSelection";

export async function getSharedPersonSelectEvent(db: SupabaseClient, shareToken: string) {
  const { data, error } = await db.from("person_select_events").select("*").eq("shared_token", shareToken).maybeSingle();
  if (error) throw error;
  if (!data) throw new PublicSelectionRequestError("유효하지 않은 공유 링크입니다.", 404);
  const event = data as PersonSelectEvent;
  if (event.access_mode !== "project_shared" || event.shared_link_active === false) throw new PublicSelectionRequestError("사용할 수 없는 공유 링크입니다.", 403);
  if (event.shared_token_expires_at && new Date(event.shared_token_expires_at).getTime() <= Date.now()) throw new PublicSelectionRequestError("공유 링크가 만료되었습니다.", 410);
  if (event.status === "draft") throw new PublicSelectionRequestError("아직 사진선택이 열리지 않았습니다.", 423);
  if (event.status === "closed" || new Date(event.deadline_at).getTime() <= Date.now()) throw new PublicSelectionRequestError("사진선택이 마감되었습니다.", 423);
  return event;
}

export async function getSharedPersonSelectImages(db: SupabaseClient, eventId: string) {
  const rows = await readAllPersonSelectRows((from, to) => db.from("person_select_images")
    .select("id,original_file_name,source_rel_path,thumb_path,preview_path,width,height,sort_order")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("id")
    .range(from, to));
  const urls = await signedImageUrls(rows.flatMap((row) => [row.thumb_path, row.preview_path]));
  return rows.map((row) => ({
    id: row.id,
    original_file_name: row.original_file_name,
    relative_path: row.source_rel_path,
    thumbnail_url: urls.get(row.thumb_path) ?? "",
    image_url: urls.get(row.preview_path) ?? "",
    width: row.width,
    height: row.height,
    sort_order: row.sort_order,
  }));
}

export async function getSharedPersonSelectImageIds(db: SupabaseClient, eventId: string) {
  const rows = await readAllPersonSelectRows((from, to) => db.from("person_select_images")
    .select("id")
    .eq("event_id", eventId)
    .order("id")
    .range(from, to));
  return rows.map((row) => String(row.id));
}

export function sharedDraftResponse(draft: any | null) {
  const rows = Array.isArray(draft?.items) ? draft.items : [];
  return {
    revision: Number(draft?.revision ?? 0),
    selectedImageIds: rows.map((item: any) => item.image_id).filter(Boolean),
    ratings: Object.fromEntries(rows.filter((item: any) => item.customer_rating).map((item: any) => [item.image_id, item.customer_rating])),
    imageNotes: Object.fromEntries(rows.filter((item: any) => item.memo).map((item: any) => [item.image_id, item.memo])),
    customerMemo: typeof draft?.customer_memo === "string" ? draft.customer_memo : "",
    updatedAt: draft?.updated_at ?? null,
  };
}

export async function getLatestSharedPersonSelectSelection(db: SupabaseClient, eventId: string) {
  const { data: selection, error } = await db.from("person_select_shared_selections").select("*").eq("event_id", eventId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!selection) return null;
  const { data: items, error: itemsError } = await db.from("person_select_shared_selection_items").select("image_id,customer_rating,memo").eq("selection_id", selection.id);
  if (itemsError) throw itemsError;
  return { ...selection, items: items ?? [] };
}
