import {
  customerSelectionIds,
  normalizeCustomerColorLabel,
  normalizeCustomerRating,
  type CustomerColorLabel,
  type CustomerRating,
} from "../customerSelection";

export type CustomerSelectionSnapshot = {
  revision: number;
  selectedImageIds: string[];
  ratings: Record<string, number>;
  colorLabels: Record<string, number>;
  imageNotes: Record<string, string>;
  customerMemo: string;
  updatedAt: string | null;
};

export type CustomerSelectionSnapshotDiff = {
  imageId: string;
  selected?: boolean;
  rating?: number | null;
  colorLabel?: number | null;
  memo?: string;
};

type CustomerSelectionSnapshotInput = {
  revision?: unknown;
  selectedImageIds?: Iterable<string>;
  ratings?: Readonly<Record<string, unknown>>;
  colorLabels?: Readonly<Record<string, unknown>>;
  imageNotes?: Readonly<Record<string, unknown>>;
  customerMemo?: unknown;
  updatedAt?: unknown;
};

function isAllowed(imageId: string, allowedImageIds?: ReadonlySet<string>) {
  return Boolean(imageId) && (!allowedImageIds || allowedImageIds.has(imageId));
}

export function normalizeCustomerSelectionSnapshot(
  input: CustomerSelectionSnapshotInput,
  allowedImageIds?: ReadonlySet<string>,
): CustomerSelectionSnapshot {
  const ratings = Object.fromEntries(Object.entries(input.ratings ?? {}).flatMap(([imageId, value]) => {
    const rating = normalizeCustomerRating(value);
    return isAllowed(imageId, allowedImageIds) && rating !== null ? [[imageId, rating]] : [];
  })) as Record<string, CustomerRating>;
  const colorLabels = Object.fromEntries(Object.entries(input.colorLabels ?? {}).flatMap(([imageId, value]) => {
    const colorLabel = normalizeCustomerColorLabel(value);
    return isAllowed(imageId, allowedImageIds) && colorLabel !== null ? [[imageId, colorLabel]] : [];
  })) as Record<string, CustomerColorLabel>;
  const imageNotes = Object.fromEntries(Object.entries(input.imageNotes ?? {}).flatMap(([imageId, value]) => (
    isAllowed(imageId, allowedImageIds) && typeof value === "string" && value
      ? [[imageId, value]]
      : []
  )));
  const selectedImageIds = customerSelectionIds({
    selectedImageIds: [...(input.selectedImageIds ?? [])].filter((imageId) => isAllowed(imageId, allowedImageIds)),
    ratings,
    colorLabels,
  });
  const revision = Number(input.revision ?? 0);
  return {
    revision: Number.isInteger(revision) && revision >= 0 ? revision : 0,
    selectedImageIds: [...selectedImageIds],
    ratings,
    colorLabels,
    imageNotes,
    customerMemo: typeof input.customerMemo === "string" ? input.customerMemo : "",
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
  };
}

export function customerSelectionSnapshotFromRows(input: {
  revision?: unknown;
  rows?: readonly Record<string, unknown>[] | null;
  customerMemo?: unknown;
  updatedAt?: unknown;
  allowedImageIds?: ReadonlySet<string>;
}): CustomerSelectionSnapshot {
  const selectedImageIds: string[] = [];
  const ratings: Record<string, unknown> = {};
  const colorLabels: Record<string, unknown> = {};
  const imageNotes: Record<string, unknown> = {};
  for (const row of input.rows ?? []) {
    const imageId = typeof row.image_id === "string" ? row.image_id : "";
    if (!imageId) continue;
    selectedImageIds.push(imageId);
    ratings[imageId] = row.customer_rating;
    colorLabels[imageId] = row.customer_color_label;
    imageNotes[imageId] = row.memo;
  }
  return normalizeCustomerSelectionSnapshot({
    revision: input.revision,
    selectedImageIds,
    ratings,
    colorLabels,
    imageNotes,
    customerMemo: input.customerMemo,
    updatedAt: input.updatedAt,
  }, input.allowedImageIds);
}

export function applyCustomerSelectionSnapshotDiffs(
  snapshot: CustomerSelectionSnapshot,
  diffs: readonly CustomerSelectionSnapshotDiff[],
): CustomerSelectionSnapshot {
  const ratings = { ...snapshot.ratings };
  const colorLabels = { ...snapshot.colorLabels };
  const imageNotes = { ...snapshot.imageNotes };
  const selectedImageIds = new Set(snapshot.selectedImageIds);

  for (const diff of diffs) {
    if (Object.prototype.hasOwnProperty.call(diff, "selected")) {
      if (diff.selected) selectedImageIds.add(diff.imageId);
      else selectedImageIds.delete(diff.imageId);
    }
    if (Object.prototype.hasOwnProperty.call(diff, "rating")) {
      const rating = normalizeCustomerRating(diff.rating);
      if (rating === null) delete ratings[diff.imageId];
      else ratings[diff.imageId] = rating;
    }
    if (Object.prototype.hasOwnProperty.call(diff, "colorLabel")) {
      const colorLabel = normalizeCustomerColorLabel(diff.colorLabel);
      if (colorLabel === null) delete colorLabels[diff.imageId];
      else colorLabels[diff.imageId] = colorLabel;
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
