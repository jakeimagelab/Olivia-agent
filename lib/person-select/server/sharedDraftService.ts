import type { SupabaseClient } from "@supabase/supabase-js";
import { applySelectionDiffsToSharedSnapshot, type SelectionSyncBatch, type SharedSelectionSyncSnapshot } from "../selectionSync";
import { selectionSyncFunctionMissing } from "../selectionSyncServer";
import { sharedDraftResponse } from "../sharedPublic";
import type { PublicSelectionDraftInput } from "@/lib/select-gallery/publicSelection";

type SharedDraftScope = {
  eventId: string;
  reviewerId: string;
};

export type SharedDraftSaveResult =
  | { ok: true; draft: SharedSelectionSyncSnapshot }
  | { ok: false; conflict: true; draft: SharedSelectionSyncSnapshot };

function firstRpcRow(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function storedItemsFromSnapshot(snapshot: SharedSelectionSyncSnapshot) {
  return snapshot.selectedImageIds.map((imageId) => ({
    image_id: imageId,
    customer_rating: snapshot.ratings[imageId] ?? null,
    customer_color_label: snapshot.colorLabels[imageId] ?? null,
    memo: snapshot.imageNotes[imageId] ?? "",
  }));
}

function isDraftRevisionConflict(error: { message?: string | null; code?: string | null } | null | undefined) {
  return /draft_revision_conflict|40001|PT409/i.test(`${error?.message ?? ""} ${error?.code ?? ""}`);
}

export async function loadSharedDraftSnapshot(
  db: SupabaseClient,
  scope: SharedDraftScope,
) {
  const { data, error } = await db.from("person_select_shared_drafts")
    .select("*")
    .eq("event_id", scope.eventId)
    .eq("reviewer_id", scope.reviewerId)
    .maybeSingle();
  if (error) throw error;
  return sharedDraftResponse(data) as SharedSelectionSyncSnapshot;
}

export async function saveSharedCustomerMemo(
  db: SupabaseClient,
  scope: SharedDraftScope,
  customerMemo: string,
) {
  const { data, error } = await db.rpc("save_person_select_shared_customer_memo", {
    p_event_id: scope.eventId,
    p_reviewer_id: scope.reviewerId,
    p_customer_memo: customerMemo,
  });
  if (!error) return sharedDraftResponse(firstRpcRow(data)) as SharedSelectionSyncSnapshot;
  if (!selectionSyncFunctionMissing(error)) throw error;

  const current = await loadSharedDraftSnapshot(db, scope);
  const { data: fallbackData, error: fallbackError } = await db.rpc("save_person_select_shared_draft_v2", {
    p_event_id: scope.eventId,
    p_reviewer_id: scope.reviewerId,
    p_expected_revision: current.revision,
    p_items: storedItemsFromSnapshot(current),
    p_customer_memo: customerMemo,
  });
  if (fallbackError) throw fallbackError;
  return sharedDraftResponse(firstRpcRow(fallbackData)) as SharedSelectionSyncSnapshot;
}

export async function saveSharedSelectionDiffs(
  db: SupabaseClient,
  scope: SharedDraftScope,
  batch: SelectionSyncBatch,
): Promise<SharedDraftSaveResult> {
  const { data, error } = await db.rpc("save_person_select_shared_item_diffs", {
    p_event_id: scope.eventId,
    p_reviewer_id: scope.reviewerId,
    p_client_id: batch.clientId,
    p_diffs: batch.diffs,
  });
  if (!error) return { ok: true, draft: sharedDraftResponse(firstRpcRow(data)) as SharedSelectionSyncSnapshot };
  if (!selectionSyncFunctionMissing(error)) throw error;

  const current = await loadSharedDraftSnapshot(db, scope);
  const merged = applySelectionDiffsToSharedSnapshot(current, batch.diffs);
  const { data: fallbackData, error: fallbackError } = await db.rpc("save_person_select_shared_draft_v2", {
    p_event_id: scope.eventId,
    p_reviewer_id: scope.reviewerId,
    p_expected_revision: current.revision,
    p_items: storedItemsFromSnapshot(merged),
    p_customer_memo: current.customerMemo,
  });
  if (fallbackError) {
    if (isDraftRevisionConflict(fallbackError)) {
      return { ok: false, conflict: true, draft: await loadSharedDraftSnapshot(db, scope) };
    }
    throw fallbackError;
  }
  return { ok: true, draft: sharedDraftResponse(firstRpcRow(fallbackData)) as SharedSelectionSyncSnapshot };
}

export async function saveSharedFullDraft(
  db: SupabaseClient,
  scope: SharedDraftScope,
  input: PublicSelectionDraftInput,
): Promise<SharedDraftSaveResult> {
  const { data, error } = await db.rpc("save_person_select_shared_draft_v2", {
    p_event_id: scope.eventId,
    p_reviewer_id: scope.reviewerId,
    p_expected_revision: input.revision,
    p_items: input.items.map((item) => ({
      image_id: item.imageId,
      customer_rating: item.rating,
      customer_color_label: item.colorLabel,
      memo: item.memo,
    })),
    p_customer_memo: input.customerMemo,
  });
  if (error) {
    if (isDraftRevisionConflict(error)) {
      return { ok: false, conflict: true, draft: await loadSharedDraftSnapshot(db, scope) };
    }
    throw error;
  }
  return { ok: true, draft: sharedDraftResponse(firstRpcRow(data)) as SharedSelectionSyncSnapshot };
}
