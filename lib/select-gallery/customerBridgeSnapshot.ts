import {
  applySelectionDiffsToSharedSnapshot,
  type SelectionSyncDiff,
  type SharedSelectionSyncSnapshot,
} from "@/lib/person-select/selectionSync";
import {
  customerBridgeSelectedIds,
  normalizeCustomerBridgeSelectionMarks,
} from "./customerBridge";

export function normalizeCustomerBridgeServerSnapshot(
  snapshot: SharedSelectionSyncSnapshot,
): SharedSelectionSyncSnapshot {
  const normalized = normalizeCustomerBridgeSelectionMarks({
    selectedImageIds: snapshot.selectedImageIds,
    ratings: snapshot.ratings,
    colorLabels: snapshot.colorLabels,
  });
  return {
    revision: Number(snapshot.revision ?? 0),
    selectedImageIds: [...customerBridgeSelectedIds(normalized.ratings, normalized.colorLabels)],
    ratings: normalized.ratings,
    colorLabels: normalized.colorLabels,
    imageNotes: snapshot.imageNotes ?? {},
    customerMemo: typeof snapshot.customerMemo === "string" ? snapshot.customerMemo : "",
    updatedAt: snapshot.updatedAt ?? null,
  };
}

export function resolveCustomerBridgeSnapshotState(
  snapshot: SharedSelectionSyncSnapshot,
  pending: readonly SelectionSyncDiff[],
) {
  const canonical = normalizeCustomerBridgeServerSnapshot(snapshot);
  return {
    canonical,
    displayed: applySelectionDiffsToSharedSnapshot(canonical, pending),
  };
}
