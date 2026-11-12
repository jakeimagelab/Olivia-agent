import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";

export type PersonSelectClientImageQuery = {
  location: "all" | "folder";
  folderPath?: string;
  search?: string;
};

export type PersonSelectClientImagePage = {
  items: CustomerBridgeImage[];
  nextCursor: string | null;
  totalCount: number;
};

export type PersonSelectClientImagePageState = {
  initialized: boolean;
  loading: boolean;
  nextCursor: string | null;
  totalCount: number;
  error: string;
};

function normalizedQueryPart(value: string | null | undefined) {
  return (value ?? "").normalize("NFC").trim();
}

export function personSelectClientImageQueryKey(query: PersonSelectClientImageQuery) {
  return [query.location, normalizedQueryPart(query.folderPath), normalizedQueryPart(query.search)].join("\u001f");
}

export function personSelectClientImagePageUrl({
  baseUrl,
  query,
  cursor,
  limit = 120,
}: {
  baseUrl: string;
  query: PersonSelectClientImageQuery;
  cursor?: string | null;
  limit?: number;
}) {
  const params = new URLSearchParams({
    location: query.location,
    limit: String(Math.max(1, Math.trunc(limit))),
  });
  const folderPath = normalizedQueryPart(query.folderPath);
  const search = normalizedQueryPart(query.search);
  if (query.location === "folder") params.set("folder", folderPath);
  if (search) params.set("search", search);
  if (cursor) params.set("cursor", cursor);
  return `${baseUrl}?${params.toString()}`;
}

function imageSortValue(image: CustomerBridgeImage) {
  return Number.isFinite(image.sort_order) ? Number(image.sort_order) : Number.MAX_SAFE_INTEGER;
}

export function mergePersonSelectClientImages(
  current: readonly CustomerBridgeImage[],
  incoming: readonly CustomerBridgeImage[],
) {
  const byId = new Map(current.map((image) => [image.id, image]));
  for (const image of incoming) byId.set(image.id, { ...byId.get(image.id), ...image });
  return [...byId.values()].sort((left, right) => (
    imageSortValue(left) - imageSortValue(right)
    || left.id.localeCompare(right.id)
  ));
}

export function completedPersonSelectClientImagePageState(page: PersonSelectClientImagePage): PersonSelectClientImagePageState {
  return {
    initialized: true,
    loading: false,
    nextCursor: page.nextCursor,
    totalCount: page.totalCount,
    error: "",
  };
}
