import { isCustomerColorLabel, isCustomerRating } from "./customerSelection";

export const SELECTION_SYNC_BATCH_LIMIT = 200;
export const SELECTION_SYNC_DEBOUNCE_MS = 2_000;
export const SELECTION_SYNC_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000] as const;

export type SelectionSyncField = "selected" | "rating" | "colorLabel" | "memo" | "retouchKeys";

export type SelectionSyncPatch = {
  imageId: string;
  selected?: boolean;
  rating?: number | null;
  colorLabel?: number | null;
  memo?: string;
  retouchKeys?: string[];
};

export type SelectionSyncDiff = SelectionSyncPatch & {
  clientSeq: number;
  changedAt: string;
};

export type PersistedSelectionSyncQueue = {
  version: 1;
  clientId: string;
  nextSeq: number;
  diffs: SelectionSyncDiff[];
  lastSavedAt: string | null;
};

const FIELDS: readonly SelectionSyncField[] = ["selected", "rating", "colorLabel", "memo", "retouchKeys"];

export function selectionSyncDiffField(diff: SelectionSyncDiff): SelectionSyncField | null {
  for (const field of FIELDS) if (Object.prototype.hasOwnProperty.call(diff, field)) return field;
  return null;
}

export function selectionSyncDiffKey(diff: Pick<SelectionSyncDiff, "imageId"> & Partial<Record<SelectionSyncField, unknown>>) {
  const field = selectionSyncDiffField(diff as SelectionSyncDiff);
  return field ? `${diff.imageId}:${field}` : "";
}

export function splitSelectionSyncPatches(
  patches: readonly SelectionSyncPatch[],
  startSeq: number,
  changedAt = new Date().toISOString(),
) {
  const diffs: SelectionSyncDiff[] = [];
  let nextSeq = startSeq;
  for (const patch of patches) {
    if (!patch.imageId) continue;
    for (const field of FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
      const value = patch[field];
      diffs.push({ imageId: patch.imageId, [field]: value, clientSeq: nextSeq, changedAt } as SelectionSyncDiff);
      nextSeq += 1;
    }
  }
  return { diffs, nextSeq };
}

export function compactSelectionSyncDiffs(diffs: readonly SelectionSyncDiff[]) {
  const byField = new Map<string, SelectionSyncDiff>();
  for (const diff of diffs) {
    const key = selectionSyncDiffKey(diff);
    if (!key) continue;
    const current = byField.get(key);
    if (!current || diff.clientSeq >= current.clientSeq) byField.set(key, diff);
  }
  return [...byField.values()].sort((left, right) => left.clientSeq - right.clientSeq);
}

export function pendingSelectionImageIds(diffs: readonly SelectionSyncDiff[]) {
  return new Set(diffs.map((diff) => diff.imageId));
}

export function overlaySelectionDiffs<T extends {
  selected?: boolean;
  rating?: number | null;
  colorLabel?: number | null;
  memo?: string;
  retouchKeys?: string[];
}>(base: ReadonlyMap<string, T>, diffs: readonly SelectionSyncDiff[]) {
  const next = new Map(base);
  for (const diff of compactSelectionSyncDiffs(diffs)) {
    const current = { ...(next.get(diff.imageId) ?? {}) } as T;
    const field = selectionSyncDiffField(diff);
    if (field) (current as Record<string, unknown>)[field] = diff[field];
    next.set(diff.imageId, current);
  }
  return next;
}

export function parsePersistedSelectionSyncQueue(value: string | null): PersistedSelectionSyncQueue | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PersistedSelectionSyncQueue>;
    if (parsed.version !== 1 || typeof parsed.clientId !== "string" || parsed.clientId.length < 8) return null;
    const diffs = compactSelectionSyncDiffs((Array.isArray(parsed.diffs) ? parsed.diffs : []).filter((diff): diff is SelectionSyncDiff => (
      Boolean(diff)
      && typeof diff.imageId === "string"
      && Number.isInteger(diff.clientSeq)
      && Number(diff.clientSeq) > 0
      && typeof diff.changedAt === "string"
      && selectionSyncDiffField(diff) !== null
    )));
    const maxSeq = diffs.reduce((max, diff) => Math.max(max, diff.clientSeq), 0);
    return {
      version: 1,
      clientId: parsed.clientId,
      nextSeq: Math.max(Number(parsed.nextSeq) || 1, maxSeq + 1),
      diffs,
      lastSavedAt: typeof parsed.lastSavedAt === "string" ? parsed.lastSavedAt : null,
    };
  } catch {
    return null;
  }
}

export function selectionSyncRetryDelay(attempt: number) {
  return SELECTION_SYNC_RETRY_DELAYS_MS[Math.min(Math.max(0, attempt), SELECTION_SYNC_RETRY_DELAYS_MS.length - 1)];
}

export type SharedSelectionSyncSnapshot = {
  revision: number;
  selectedImageIds: string[];
  ratings: Record<string, number>;
  colorLabels: Record<string, number>;
  imageNotes: Record<string, string>;
  customerMemo: string;
  updatedAt: string | null;
};

export function applySelectionDiffsToSharedSnapshot(
  snapshot: SharedSelectionSyncSnapshot,
  diffs: readonly SelectionSyncDiff[],
): SharedSelectionSyncSnapshot {
  const ratings = { ...snapshot.ratings };
  const colorLabels = { ...snapshot.colorLabels };
  const imageNotes = { ...snapshot.imageNotes };
  const selectedImageIds = new Set(snapshot.selectedImageIds);
  for (const diff of compactSelectionSyncDiffs(diffs)) {
    if (Object.prototype.hasOwnProperty.call(diff, "selected")) {
      if (diff.selected) selectedImageIds.add(diff.imageId);
      else selectedImageIds.delete(diff.imageId);
    }
    if (Object.prototype.hasOwnProperty.call(diff, "rating")) {
      if (diff.rating === null || diff.rating === 0) delete ratings[diff.imageId];
      else if (typeof diff.rating === "number") ratings[diff.imageId] = diff.rating;
    }
    if (Object.prototype.hasOwnProperty.call(diff, "colorLabel")) {
      if (diff.colorLabel === null || diff.colorLabel === 0) delete colorLabels[diff.imageId];
      else if (typeof diff.colorLabel === "number") colorLabels[diff.imageId] = diff.colorLabel;
    }
    if (Object.prototype.hasOwnProperty.call(diff, "memo")) {
      if (diff.memo) imageNotes[diff.imageId] = diff.memo;
      else delete imageNotes[diff.imageId];
    }
    if (Object.prototype.hasOwnProperty.call(diff, "rating") || Object.prototype.hasOwnProperty.call(diff, "colorLabel")) {
      if (ratings[diff.imageId] || colorLabels[diff.imageId]) selectedImageIds.add(diff.imageId);
      else selectedImageIds.delete(diff.imageId);
    }
  }
  return { ...snapshot, selectedImageIds: [...selectedImageIds], ratings, colorLabels, imageNotes };
}

export function parseSelectionSyncBatch(value: unknown, allowedImageIds: ReadonlySet<string>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("저장 요청 형식이 올바르지 않습니다.");
  const record = value as Record<string, unknown>;
  const clientId = typeof record.clientId === "string" ? record.clientId.trim() : "";
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(clientId)) throw new Error("저장 장치 식별자가 올바르지 않습니다.");
  if (!Array.isArray(record.diffs) || record.diffs.length > SELECTION_SYNC_BATCH_LIMIT) throw new Error(`한 번에 ${SELECTION_SYNC_BATCH_LIMIT}건까지 저장할 수 있습니다.`);
  const diffs = record.diffs.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("사진 변경 형식이 올바르지 않습니다.");
    const diff = raw as Record<string, unknown>;
    const imageId = typeof diff.imageId === "string" ? diff.imageId.trim() : "";
    if (!allowedImageIds.has(imageId)) throw new Error("이 프로젝트에 없는 사진이 포함되어 있습니다.");
    const clientSeq = Number(diff.clientSeq);
    if (!Number.isSafeInteger(clientSeq) || clientSeq < 1) throw new Error("저장 순서가 올바르지 않습니다.");
    const changedAt = typeof diff.changedAt === "string" && Number.isFinite(Date.parse(diff.changedAt)) ? diff.changedAt : "";
    if (!changedAt) throw new Error("변경 시각이 올바르지 않습니다.");
    const fields = FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(diff, field));
    if (fields.length !== 1) throw new Error("사진 변경은 한 필드씩 저장해야 합니다.");
    const field = fields[0];
    if (field === "selected" && typeof diff.selected !== "boolean") throw new Error("선택 상태가 올바르지 않습니다.");
    if (field === "rating" && diff.rating !== null && !isCustomerRating(diff.rating)) throw new Error("별점은 1점부터 5점까지만 저장할 수 있습니다.");
    if (field === "colorLabel" && diff.colorLabel !== null && !isCustomerColorLabel(diff.colorLabel)) throw new Error("컬러 셀렉은 6번부터 9번까지만 저장할 수 있습니다.");
    if (field === "memo" && (typeof diff.memo !== "string" || diff.memo.length > 1000)) throw new Error("사진별 메모는 1000자까지 적을 수 있습니다.");
    if (field === "retouchKeys" && (!Array.isArray(diff.retouchKeys) || diff.retouchKeys.some((key) => typeof key !== "string"))) throw new Error("보정 요청 형식이 올바르지 않습니다.");
    return { imageId, clientSeq, changedAt, [field]: diff[field] } as SelectionSyncDiff;
  });
  return { clientId, diffs };
}
