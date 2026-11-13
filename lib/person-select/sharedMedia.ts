import type { SupabaseClient } from "@supabase/supabase-js";

import { PublicSelectionRequestError } from "@/lib/select-gallery/publicSelection";
import { readAllPersonSelectRows } from "./paging";
import { signedImageUrls } from "./server";
import type { PersonSelectEvent } from "./types";

/** 브라우저에 운영 폴더·관리자 연결 정보를 노출하지 않는 공개 이벤트 응답. */
export function sharedPersonSelectEventResponse(event: PersonSelectEvent) {
  return {
    id: event.id,
    title: event.title,
    deadline_at: event.deadline_at,
    status: event.status,
    customer_view_mode: event.customer_view_mode ?? "classic",
    customer_stage: event.customer_stage ?? "select",
    delivery_retention_days: event.delivery_retention_days ?? 30,
    delivery_state: event.delivery_state ?? "none",
    delivery_approved_at: event.delivery_approved_at ?? null,
    download_available: Boolean(event.source_relative_path),
    customer_ai_results_visible: event.customer_ai_results_visible === true,
  };
}

export async function getSharedPersonSelectImages(db: SupabaseClient, eventId: string) {
  const rows = await readAllPersonSelectRows((from, to) => db.from("person_select_images")
    .select("id,original_file_name,source_rel_path,thumb_path,preview_path,width,height,sort_order")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("id")
    .range(from, to));
  return rows.map((row) => ({
    id: row.id,
    original_file_name: row.original_file_name,
    relative_path: row.source_rel_path,
    // 대량 프로젝트의 첫 진입에서 모든 Storage URL을 만들지 않는다. 현재 화면에
    // 필요한 사진만 getSharedPersonSelectImageUrls로 제한된 묶음 서명한다.
    thumbnail_url: "",
    image_url: "",
    width: row.width,
    height: row.height,
    sort_order: row.sort_order,
  }));
}

export const SHARED_PERSON_SELECT_MEDIA_BATCH_LIMIT = 72;
export type SharedPersonSelectMediaVariant = "thumbnail" | "preview" | "both";

export function parseSharedPersonSelectMediaVariant(value: unknown): SharedPersonSelectMediaVariant {
  if (value === undefined || value === null || value === "") return "both";
  if (value === "thumbnail" || value === "preview" || value === "both") return value;
  throw new PublicSelectionRequestError("사진 주소 종류가 올바르지 않습니다.");
}

/** 공개/관리자 Bridge가 현재 표시할 사진만 서명한다. event 소유관계는 서버에서 다시 확인한다. */
export async function getSharedPersonSelectImageUrls(
  db: SupabaseClient,
  eventId: string,
  imageIds: readonly string[],
  variant: SharedPersonSelectMediaVariant = "both",
) {
  const uniqueIds = [...new Set(imageIds.map((value) => value.trim()).filter(Boolean))];
  if (!uniqueIds.length || uniqueIds.length > SHARED_PERSON_SELECT_MEDIA_BATCH_LIMIT) {
    throw new PublicSelectionRequestError(`사진 주소는 한 번에 ${SHARED_PERSON_SELECT_MEDIA_BATCH_LIMIT}장까지 요청할 수 있습니다.`);
  }
  const { data, error } = await db.from("person_select_images")
    .select("id,thumb_path,preview_path")
    .eq("event_id", eventId)
    .in("id", uniqueIds);
  if (error) throw error;
  if ((data ?? []).length !== uniqueIds.length) {
    throw new PublicSelectionRequestError("이 프로젝트에 없는 사진이 포함되어 있습니다.");
  }
  const includeThumbnail = variant === "thumbnail" || variant === "both";
  const includePreview = variant === "preview" || variant === "both";
  const paths = (data ?? []).flatMap((row) => [
    ...(includeThumbnail ? [row.thumb_path] : []),
    ...(includePreview ? [row.preview_path || row.thumb_path] : []),
  ]);
  const urls = await signedImageUrls(paths, 3_600);
  return Object.fromEntries((data ?? []).map((row) => [row.id, {
    ...(includeThumbnail ? { thumbnail_url: urls.get(row.thumb_path) ?? "" } : {}),
    ...(includePreview ? { image_url: urls.get(row.preview_path || row.thumb_path) ?? "" } : {}),
  }]));
}
