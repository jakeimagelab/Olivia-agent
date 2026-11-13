import {
  customerSelectionIds,
  isCustomerRating,
  normalizeCustomerColorLabel,
  normalizeCustomerRating,
  type CustomerColorLabel,
  type CustomerRating,
} from "@/lib/person-select/customerSelection";
import type { CustomerBridgeFolderImage } from "./customerBridgeFolders";

export type CustomerBridgeRating = CustomerRating;
export type CustomerBridgeColorLabel = CustomerColorLabel;

export type CustomerBridgeSelectionState = {
  selectedIds: Set<string>;
  ratings: Record<string, CustomerBridgeRating>;
};

export type CustomerBridgeSelectionItem = {
  imageId: string;
  relativePath: string | null;
  rating: CustomerBridgeRating | null;
  colorLabel: CustomerBridgeColorLabel | null;
  memo: string;
};

export type CustomerBridgeSelectionMarks = {
  ratings: Record<string, CustomerBridgeRating>;
  colorLabels: Record<string, CustomerBridgeColorLabel>;
};

export function reconcileCustomerBridgeRecord<T>(
  current: Readonly<Record<string, T>>,
  incoming: Record<string, T>,
) {
  const currentKeys = Object.keys(current);
  const incomingKeys = Object.keys(incoming);
  if (currentKeys.length !== incomingKeys.length) return incoming;
  for (const key of incomingKeys) if (!Object.is(current[key], incoming[key])) return incoming;
  return current as Record<string, T>;
}

/** 작업 대상이 있으면 그 전체를, 없으면 포커스 사진 한 장을 별점 대상으로 삼는다. */
export function customerBridgeRatingTargets(
  activeImageIds: ReadonlySet<string>,
  focusedImageId: string | null,
) {
  if (activeImageIds.size) return new Set(activeImageIds);
  return focusedImageId ? new Set([focusedImageId]) : new Set<string>();
}

/** 고객 셀렉은 별점 1~5가 있는 사진으로만 정의한다. */
export function customerBridgeRatedIds(ratings: Readonly<Record<string, number>>) {
  return new Set(
    Object.entries(ratings)
      .filter(([, rating]) => isCustomerRating(rating))
      .map(([id]) => id),
  );
}

/** 고객 셀렉은 별점 또는 컬러 레이블이 하나라도 있는 사진의 합집합이다. */
export function customerBridgeSelectedIds(
  ratings: Readonly<Record<string, number>>,
  colorLabels: Readonly<Record<string, number>>,
) {
  return customerSelectionIds({ ratings, colorLabels });
}

/** 기존 classic 셀렉도 Bridge에서 잃지 않도록 표시 가능한 1점 셀렉으로 승계한다. */
export function normalizeCustomerBridgeSelectionMarks(input: {
  selectedImageIds?: readonly string[];
  ratings?: Readonly<Record<string, number>>;
  colorLabels?: Readonly<Record<string, number>>;
  allowedImageIds?: ReadonlySet<string>;
}): CustomerBridgeSelectionMarks {
  const allowed = input.allowedImageIds;
  const ratings = Object.fromEntries(
    Object.entries(input.ratings ?? {}).flatMap(([id, rating]) => {
      const normalized = normalizeCustomerRating(rating);
      return (!allowed || allowed.has(id)) && normalized !== null ? [[id, normalized]] : [];
    }),
  ) as Record<string, CustomerBridgeRating>;
  const colorLabels = Object.fromEntries(
    Object.entries(input.colorLabels ?? {}).flatMap(([id, colorLabel]) => {
      const normalized = normalizeCustomerColorLabel(colorLabel);
      return (!allowed || allowed.has(id)) && normalized !== null ? [[id, normalized]] : [];
    }),
  ) as Record<string, CustomerBridgeColorLabel>;

  for (const id of input.selectedImageIds ?? []) {
    if ((!allowed || allowed.has(id)) && !ratings[id] && !colorLabels[id]) ratings[id] = 1;
  }
  return { ratings, colorLabels };
}

export function applyCustomerRatings(
  current: Readonly<Record<string, CustomerBridgeRating>>,
  targetIds: ReadonlySet<string>,
  rating: 0 | CustomerBridgeRating,
) {
  const ratings = { ...current };
  for (const id of targetIds) {
    if (rating === 0) delete ratings[id];
    else ratings[id] = rating;
  }
  return ratings;
}

export function applyCustomerColorLabels(
  current: Readonly<Record<string, CustomerBridgeColorLabel>>,
  targetIds: ReadonlySet<string>,
  colorLabel: CustomerBridgeColorLabel,
) {
  const colorLabels = { ...current };
  for (const id of targetIds) colorLabels[id] = colorLabel;
  return colorLabels;
}

export function toggleCustomerColorLabels(
  current: Readonly<Record<string, CustomerBridgeColorLabel>>,
  targetIds: ReadonlySet<string>,
  colorLabel: CustomerBridgeColorLabel,
) {
  const colorLabels = { ...current };
  const shouldClear = targetIds.size > 0 && [...targetIds].every((id) => current[id] === colorLabel);
  for (const id of targetIds) {
    if (shouldClear) delete colorLabels[id];
    else colorLabels[id] = colorLabel;
  }
  return colorLabels;
}

export function resolveCustomerColorToggle(
  current: Readonly<Record<string, CustomerBridgeColorLabel>>,
  targetIds: ReadonlySet<string>,
  colorLabel: CustomerBridgeColorLabel,
) {
  const colorLabels = toggleCustomerColorLabels(current, targetIds, colorLabel);
  return {
    colorLabels,
    patches: [...targetIds].map((imageId) => ({
      imageId,
      colorLabel: colorLabels[imageId] ?? null,
    })),
  };
}

export function nextCustomerBridgeReviewZoom(current: number, deltaY: number) {
  const safeCurrent = Number.isFinite(current) ? current : 1;
  if (!deltaY) return Math.min(3, Math.max(1, safeCurrent));
  return Math.min(3, Math.max(1, Number((safeCurrent + (deltaY < 0 ? .15 : -.15)).toFixed(2))));
}

export function clearCustomerBridgeMarks<T extends number>(
  current: Readonly<Record<string, T>>,
  targetIds: ReadonlySet<string>,
) {
  const next = { ...current };
  for (const id of targetIds) delete next[id];
  return next;
}

export function customerBridgeSelectionItems<T extends CustomerBridgeFolderImage>(
  images: readonly T[],
  ratings: Readonly<Record<string, number>>,
  colorLabels: Readonly<Record<string, number>>,
  notes: Readonly<Record<string, string>>,
): CustomerBridgeSelectionItem[] {
  return images.flatMap((image) => {
    const rating = normalizeCustomerRating(ratings[image.id]);
    const colorLabel = normalizeCustomerColorLabel(colorLabels[image.id]);
    if (rating === null && colorLabel === null) return [];
    return [{
      imageId: image.id,
      relativePath: image.relative_path ?? null,
      rating,
      colorLabel,
      memo: notes[image.id] ?? "",
    }];
  });
}

export function toggleCustomerBridgeSelection(
  current: CustomerBridgeSelectionState,
  imageId: string,
): CustomerBridgeSelectionState {
  const selectedIds = new Set(current.selectedIds);
  const ratings = { ...current.ratings };
  if (selectedIds.has(imageId)) {
    selectedIds.delete(imageId);
    delete ratings[imageId];
  } else {
    selectedIds.add(imageId);
  }
  return { selectedIds, ratings };
}

export function applyCustomerBridgeRating(
  current: CustomerBridgeSelectionState,
  targetIds: ReadonlySet<string>,
  rating: 0 | CustomerBridgeRating,
): CustomerBridgeSelectionState {
  const selectedIds = new Set(current.selectedIds);
  const ratings = { ...current.ratings };
  for (const id of targetIds) {
    if (rating === 0) {
      selectedIds.delete(id);
      delete ratings[id];
    } else {
      selectedIds.add(id);
      ratings[id] = rating;
    }
  }
  return { selectedIds, ratings };
}

export function addCustomerBridgeRange(input: {
  current: ReadonlySet<string>;
  orderedIds: readonly string[];
  anchorId: string;
  targetId: string;
}) {
  const anchorIndex = input.orderedIds.indexOf(input.anchorId);
  const targetIndex = input.orderedIds.indexOf(input.targetId);
  if (anchorIndex < 0 || targetIndex < 0) return new Set(input.current);
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return new Set([...input.current, ...input.orderedIds.slice(start, end + 1)]);
}
