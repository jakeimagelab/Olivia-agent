export type CustomerBridgeRating = 1 | 2 | 3 | 4 | 5;

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

const SLASHES = /[\\/]+/g;

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

function validCustomerRating(value: number | null | undefined): value is CustomerBridgeRating {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5;
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
    if (validCustomerRating(item.rating)) ratingsByBridgeId[bridgeId] = item.rating;
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
