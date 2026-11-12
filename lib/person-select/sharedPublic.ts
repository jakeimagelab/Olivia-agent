import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { customerSelectionSnapshotFromRows } from "./domain/selectionSnapshot";
import { readAllPersonSelectRows } from "./paging";
import { signedImageUrls } from "./server";
import type { PersonSelectEvent } from "./types";
import { getOwnedSelectionImageIds, PublicSelectionRequestError } from "@/lib/select-gallery/publicSelection";
import { canPersonSelectReviewerFinalize } from "./reviewerPermissions";

export type SharedPersonSelectReviewer = {
  id: string;
  event_id: string;
  display_name: string;
  role_label: string;
  active: boolean;
  is_legacy: boolean;
  last_seen_at?: string | null;
  can_view_ai_results?: boolean;
  can_download_jpg?: boolean;
  can_download_raw?: boolean;
  can_finalize?: boolean;
};

export type SharedPersonSelectAccess = {
  event: PersonSelectEvent;
  reviewer: SharedPersonSelectReviewer;
  legacyToken: boolean;
};

export function sharedReviewerTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function validateSharedEvent(data: Record<string, any> | null) {
  if (!data) throw new PublicSelectionRequestError("유효하지 않은 공유 링크입니다.", 404);
  const event = data as PersonSelectEvent;
  if (event.access_mode !== "project_shared" || event.shared_link_active === false) throw new PublicSelectionRequestError("사용할 수 없는 공유 링크입니다.", 403);
  if (event.shared_token_expires_at && new Date(event.shared_token_expires_at).getTime() <= Date.now()) throw new PublicSelectionRequestError("공유 링크가 만료되었습니다.", 410);
  if (event.status === "draft") throw new PublicSelectionRequestError("아직 사진선택이 열리지 않았습니다.", 423);
  if (event.customer_stage !== "delivery" && (event.status === "closed" || new Date(event.deadline_at).getTime() <= Date.now())) throw new PublicSelectionRequestError("사진선택이 마감되었습니다.", 423);
  return event;
}

/** 검토자 전용 토큰을 우선 찾고, 기존 event 공용 토큰은 호환 검토자로 연결한다. */
export async function resolveSharedPersonSelectAccess(
  db: SupabaseClient,
  shareToken: string,
  options?: { touch?: boolean },
): Promise<SharedPersonSelectAccess> {
  const token = shareToken.trim();
  if (!token) throw new PublicSelectionRequestError("유효하지 않은 공유 링크입니다.", 404);

  const tokenHash = sharedReviewerTokenHash(token);
  const { data: tokenReviewer, error: reviewerError } = await db
    .from("person_select_shared_reviewers")
    .select("id,event_id,display_name,role_label,active,is_legacy,last_seen_at,can_view_ai_results,can_download_jpg,can_download_raw,can_finalize")
    .eq("access_token_hash", tokenHash)
    .maybeSingle();
  if (reviewerError) throw reviewerError;

  let reviewer = tokenReviewer as SharedPersonSelectReviewer | null;
  let legacyToken = false;
  let eventRow: Record<string, any> | null = null;

  if (reviewer) {
    const { data, error } = await db.from("person_select_events").select("*").eq("id", reviewer.event_id).maybeSingle();
    if (error) throw error;
    eventRow = data;
  } else {
    const { data, error } = await db.from("person_select_events").select("*").eq("shared_token", token).maybeSingle();
    if (error) throw error;
    eventRow = data;
    if (eventRow) {
      legacyToken = true;
      const { data: legacyReviewer, error: legacyError } = await db
        .from("person_select_shared_reviewers")
        .select("id,event_id,display_name,role_label,active,is_legacy,last_seen_at,can_view_ai_results,can_download_jpg,can_download_raw,can_finalize")
        .eq("event_id", eventRow.id)
        .eq("is_legacy", true)
        .maybeSingle();
      if (legacyError) throw legacyError;
      reviewer = legacyReviewer as SharedPersonSelectReviewer | null;
    }
  }

  const event = validateSharedEvent(eventRow);
  if (!reviewer || reviewer.event_id !== event.id || !reviewer.active) {
    throw new PublicSelectionRequestError("비활성화되었거나 다시 발급된 검토자 링크입니다.", 403);
  }

  reviewer = { ...reviewer, can_finalize: canPersonSelectReviewerFinalize(reviewer) };

  if (options?.touch) {
    const now = new Date().toISOString();
    const { error } = await db.from("person_select_shared_reviewers").update({ last_seen_at: now, updated_at: now }).eq("id", reviewer.id);
    if (error) throw error;
    reviewer = { ...reviewer, last_seen_at: now };
  }

  return { event, reviewer, legacyToken };
}

export async function getSharedPersonSelectEvent(db: SupabaseClient, shareToken: string) {
  return (await resolveSharedPersonSelectAccess(db, shareToken)).event;
}

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

export const SHARED_PERSON_SELECT_MEDIA_BATCH_LIMIT = 240;

/** 공개/관리자 Bridge가 현재 표시할 사진만 서명한다. event 소유관계는 서버에서 다시 확인한다. */
export async function getSharedPersonSelectImageUrls(
  db: SupabaseClient,
  eventId: string,
  imageIds: readonly string[],
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
  const urls = await signedImageUrls((data ?? []).flatMap((row) => [row.thumb_path, row.preview_path]), 3_600);
  return Object.fromEntries((data ?? []).map((row) => [row.id, {
    image_url: urls.get(row.preview_path) ?? urls.get(row.thumb_path) ?? "",
    thumbnail_url: urls.get(row.thumb_path) ?? "",
  }]));
}

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
