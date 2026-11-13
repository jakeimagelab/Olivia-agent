import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PublicSelectionRequestError } from "@/lib/select-gallery/publicSelection";
import { canPersonSelectReviewerFinalize } from "./reviewerPermissions";
import type { PersonSelectEvent } from "./types";

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
