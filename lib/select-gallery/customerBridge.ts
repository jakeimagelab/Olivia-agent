import {
  customerSelectionIds,
  isCustomerRating,
  normalizeCustomerColorLabel,
  normalizeCustomerRating,
  type CustomerColorLabel,
  type CustomerRating,
} from "@/lib/person-select/customerSelection";
import type { CustomerBridgeFolderManifest } from "./customerBridgeTypes";

export type CustomerBridgeRating = CustomerRating;
export type CustomerBridgeColorLabel = CustomerColorLabel;

export type CustomerBridgeSelectionState = {
  selectedIds: Set<string>;
  ratings: Record<string, CustomerBridgeRating>;
};

export type CustomerSelectionComparisonFilter =
  | "all"
  | "admin"
  | "customer"
  | "common"
  | "admin-only"
  | "customer-only";

export type BridgeMatchFile = {
  id: string;
  name: string;
  relativeDirectory?: string | null;
  galleryImageId?: string | null;
};

export type CustomerSelectionMatchItem = {
  imageId: string;
  fileName: string;
  relativePath?: string | null;
  rating?: number | null;
  memo?: string | null;
};

export type CustomerSelectionMatchResult = {
  matchedBridgeIds: Set<string>;
  bridgeIdByImageId: Record<string, string>;
  ratingsByBridgeId: Record<string, CustomerBridgeRating>;
  notesByBridgeId: Record<string, string>;
  missing: CustomerSelectionMatchItem[];
  ambiguous: Array<CustomerSelectionMatchItem & { candidateIds: string[] }>;
};

export type CustomerBridgeFolderImage = {
  id: string;
  relative_path?: string | null;
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

export type CustomerBridgeFolder = {
  path: string;
  name: string;
  directCount: number;
  totalCount: number;
  representativeImageId: string | null;
};

export type CustomerBridgeFolderView<T extends CustomerBridgeFolderImage> = {
  currentPath: string;
  breadcrumbs: Array<{ name: string; path: string }>;
  folders: CustomerBridgeFolder[];
  images: T[];
};

export type CustomerBridgeFolderTreeItem = CustomerBridgeFolder & {
  depth: number;
};

const SLASHES = /[\\/]+/g;

/** 화면 표시에 쓸 상대경로. 대소문자와 폴더 이름은 보존하고 탈출 조각만 제거한다. */
export function displayGalleryRelativePath(value: string | null | undefined) {
  if (!value) return "";
  return value
    .normalize("NFC")
    .replace(SLASHES, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

export function galleryFolderPath(value: string | null | undefined) {
  const parts = displayGalleryRelativePath(value).split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

/**
 * 업로드 때 보존한 source_rel_path를 그대로 폴더 브라우저로 만든다.
 * 폴더 순서는 사진의 sort_order 순서에서 처음 등장한 순서를 유지한다.
 */
export function customerBridgeFolderView<T extends CustomerBridgeFolderImage>(
  images: readonly T[],
  requestedPath: string | null | undefined,
  manifest?: CustomerBridgeFolderManifest | null,
): CustomerBridgeFolderView<T> {
  const currentPath = displayGalleryRelativePath(requestedPath);
  const currentParts = currentPath.split("/").filter(Boolean);
  if (manifest) {
    return {
      currentPath,
      breadcrumbs: currentParts.map((name, index) => ({
        name,
        path: currentParts.slice(0, index + 1).join("/"),
      })),
      folders: manifest.folders
        .filter((folder) => displayGalleryRelativePath(folder.parentPath) === currentPath)
        .map(({ path, name, directCount, totalCount, representativeImageId }) => ({
          path,
          name,
          directCount,
          totalCount,
          representativeImageId,
        })),
      images: images.filter((image) => galleryFolderPath(image.relative_path) === currentPath),
    };
  }
  const folders = new Map<string, CustomerBridgeFolder>();
  const directImages: T[] = [];

  for (const image of images) {
    const folderPath = galleryFolderPath(image.relative_path);
    const folderParts = folderPath.split("/").filter(Boolean);
    const isInside = currentParts.every((part, index) => folderParts[index] === part);
    if (!isInside) continue;

    if (folderParts.length === currentParts.length) {
      directImages.push(image);
      continue;
    }

    const childParts = folderParts.slice(0, currentParts.length + 1);
    const childPath = childParts.join("/");
    const existing = folders.get(childPath);
    if (existing) {
      existing.totalCount += 1;
      if (folderParts.length === currentParts.length + 1) existing.directCount += 1;
    } else {
      folders.set(childPath, {
        path: childPath,
        name: childParts.at(-1) ?? childPath,
        directCount: folderParts.length === currentParts.length + 1 ? 1 : 0,
        totalCount: 1,
        representativeImageId: image.id,
      });
    }
  }

  const breadcrumbs = currentParts.map((name, index) => ({
    name,
    path: currentParts.slice(0, index + 1).join("/"),
  }));
  return { currentPath, breadcrumbs, folders: [...folders.values()], images: directImages };
}

/** 관리자 Bridge의 왼쪽 탐색 패널처럼 전체 폴더를 한 번에 보여 주는 평면 트리. */
export function customerBridgeFolderTree<T extends CustomerBridgeFolderImage>(
  images: readonly T[],
  manifest?: CustomerBridgeFolderManifest | null,
): CustomerBridgeFolderTreeItem[] {
  if (manifest) return manifest.folders.map((folder) => ({ ...folder }));
  const folders = new Map<string, CustomerBridgeFolderTreeItem>();
  for (const image of images) {
    const parts = galleryFolderPath(image.relative_path).split("/").filter(Boolean);
    parts.forEach((name, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const existing = folders.get(path);
      if (existing) {
        existing.totalCount += 1;
        if (index === parts.length - 1) existing.directCount += 1;
        return;
      }
      folders.set(path, {
        path,
        name,
        depth: index,
        directCount: index === parts.length - 1 ? 1 : 0,
        totalCount: 1,
        representativeImageId: image.id,
      });
    });
  }
  return [...folders.values()];
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
export function customerBridgeRatedIds(
  ratings: Readonly<Record<string, number>>,
) {
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

/**
 * 기존 classic 셀렉은 선택 여부만 저장되어 별점·컬러가 없을 수 있다.
 * Bridge로 화면 방식을 바꿔도 그 선택을 잃지 않도록 표시 가능한 1점 셀렉으로 승계한다.
 */
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

/** 작업 대상의 고객 별점만 변경한다. 마우스 작업 대상 집합은 건드리지 않는다. */
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

/** 작업 대상에 6–9 컬러 셀렉을 적용한다. 해제는 0 키만 사용한다. */
export function applyCustomerColorLabels(
  current: Readonly<Record<string, CustomerBridgeColorLabel>>,
  targetIds: ReadonlySet<string>,
  colorLabel: CustomerBridgeColorLabel,
) {
  const colorLabels = { ...current };
  for (const id of targetIds) colorLabels[id] = colorLabel;
  return colorLabels;
}

/** 같은 6–9 컬러를 다시 누르면 대상의 컬러만 해제하고, 다른 컬러면 일괄 적용한다. */
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

/** 리뷰 휠 확대율은 화면 맞춤 100%에서 300%까지만 유지한다. */
export function nextCustomerBridgeReviewZoom(current: number, deltaY: number) {
  const safeCurrent = Number.isFinite(current) ? current : 1;
  if (!deltaY) return Math.min(3, Math.max(1, safeCurrent));
  return Math.min(3, Math.max(1, Number((safeCurrent + (deltaY < 0 ? .15 : -.15)).toFixed(2))));
}

/** 0 키는 작업 대상의 별점과 컬러를 함께 지운다. */
export function clearCustomerBridgeMarks<T extends number>(
  current: Readonly<Record<string, T>>,
  targetIds: ReadonlySet<string>,
) {
  const next = { ...current };
  for (const id of targetIds) delete next[id];
  return next;
}

/** 저장·제출에는 고객 별점 또는 컬러 셀렉이 있는 사진만 원래 사진 순서대로 포함한다. */
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

export function normalizeGalleryRelativePath(value: string | null | undefined) {
  if (!value) return "";
  const parts = value
    .normalize("NFC")
    .replace(SLASHES, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");
  return parts.join("/").toLocaleLowerCase("en-US");
}

export function bridgeFileRelativePath(file: BridgeMatchFile) {
  return normalizeGalleryRelativePath(
    file.relativeDirectory ? `${file.relativeDirectory}/${file.name}` : file.name,
  );
}

export function galleryFileLeaf(value: string | null | undefined) {
  const normalized = normalizeGalleryRelativePath(value);
  return normalized.split("/").at(-1) ?? "";
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

export function matchesCustomerSelectionComparison(input: {
  id: string;
  filter: CustomerSelectionComparisonFilter;
  adminIds: ReadonlySet<string>;
  customerIds: ReadonlySet<string>;
}) {
  const admin = input.adminIds.has(input.id);
  const customer = input.customerIds.has(input.id);
  if (input.filter === "admin") return admin;
  if (input.filter === "customer") return customer;
  if (input.filter === "common") return admin && customer;
  if (input.filter === "admin-only") return admin && !customer;
  if (input.filter === "customer-only") return customer && !admin;
  return true;
}

export function customerSelectionComparisonCounts(
  orderedIds: readonly string[],
  adminIds: ReadonlySet<string>,
  customerIds: ReadonlySet<string>,
) {
  const counts: Record<CustomerSelectionComparisonFilter, number> = {
    all: orderedIds.length,
    admin: 0,
    customer: 0,
    common: 0,
    "admin-only": 0,
    "customer-only": 0,
  };
  for (const id of orderedIds) {
    const admin = adminIds.has(id);
    const customer = customerIds.has(id);
    if (admin) counts.admin += 1;
    if (customer) counts.customer += 1;
    if (admin && customer) counts.common += 1;
    if (admin && !customer) counts["admin-only"] += 1;
    if (customer && !admin) counts["customer-only"] += 1;
  }
  return counts;
}

/**
 * 고객 제출을 현재 Bridge 폴더에 연결한다.
 * ID → 정확한 상대경로 → 폴더 내 유일한 파일명 순으로만 매칭한다.
 */
export function matchCustomerSelectionToBridgeFiles(
  items: readonly CustomerSelectionMatchItem[],
  bridgeFiles: readonly BridgeMatchFile[],
): CustomerSelectionMatchResult {
  const byGalleryImageId = new Map<string, BridgeMatchFile[]>();
  const byRelativePath = new Map<string, BridgeMatchFile[]>();
  const byLeaf = new Map<string, BridgeMatchFile[]>();

  const push = (map: Map<string, BridgeMatchFile[]>, key: string, file: BridgeMatchFile) => {
    if (!key) return;
    const entries = map.get(key) ?? [];
    entries.push(file);
    map.set(key, entries);
  };

  for (const file of bridgeFiles) {
    if (file.galleryImageId) push(byGalleryImageId, file.galleryImageId, file);
    push(byRelativePath, bridgeFileRelativePath(file), file);
    push(byLeaf, galleryFileLeaf(file.name), file);
  }

  const matchedBridgeIds = new Set<string>();
  const bridgeIdByImageId: Record<string, string> = {};
  const ratingsByBridgeId: Record<string, CustomerBridgeRating> = {};
  const notesByBridgeId: Record<string, string> = {};
  const missing: CustomerSelectionMatchItem[] = [];
  const ambiguous: Array<CustomerSelectionMatchItem & { candidateIds: string[] }> = [];

  for (const item of items) {
    let candidates = byGalleryImageId.get(item.imageId) ?? [];
    if (!candidates.length && item.relativePath) {
      candidates = byRelativePath.get(normalizeGalleryRelativePath(item.relativePath)) ?? [];
    }
    if (!candidates.length) candidates = byLeaf.get(galleryFileLeaf(item.fileName)) ?? [];

    if (candidates.length === 0) {
      missing.push(item);
      continue;
    }
    if (candidates.length > 1) {
      ambiguous.push({ ...item, candidateIds: candidates.map((file) => file.id) });
      continue;
    }

    const bridgeId = candidates[0].id;
    matchedBridgeIds.add(bridgeId);
    bridgeIdByImageId[item.imageId] = bridgeId;
    if (isCustomerRating(item.rating)) ratingsByBridgeId[bridgeId] = item.rating;
    if (item.memo) notesByBridgeId[bridgeId] = item.memo;
  }

  return {
    matchedBridgeIds,
    bridgeIdByImageId,
    ratingsByBridgeId,
    notesByBridgeId,
    missing,
    ambiguous,
  };
}
