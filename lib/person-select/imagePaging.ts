import { isInsideDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";
import { displayGalleryRelativePath, galleryFolderPath } from "@/lib/select-gallery/customerBridge";

export const PERSON_SELECT_IMAGE_PAGE_SIZE = 72;
export const PERSON_SELECT_IMAGE_PAGE_MAX = 120;

export type PersonSelectImageMetadataRow = {
  id: string;
  original_file_name: string;
  source_rel_path: string;
  thumb_path?: string | null;
  preview_path?: string | null;
  width?: number | null;
  height?: number | null;
  sort_order: number | null;
};

export type PersonSelectFolderManifestEntry = {
  path: string;
  name: string;
  parentPath: string;
  depth: number;
  directCount: number;
  totalCount: number;
  representativeImageId: string;
};

export type PersonSelectFolderManifest = {
  totalCount: number;
  rootPhotoCount: number;
  folders: PersonSelectFolderManifestEntry[];
};

export type PersonSelectImagePageQuery = {
  location: "all" | "folder";
  folderPath?: string;
  search?: string;
  cursor?: string | null;
  limit?: number;
};

type PersonSelectImageCursor = { sortOrder: number; id: string };

function normalizedSortOrder(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : Number.MAX_SAFE_INTEGER;
}

function compareImageOrder(
  left: Pick<PersonSelectImageMetadataRow, "sort_order" | "id">,
  right: Pick<PersonSelectImageMetadataRow, "sort_order" | "id">,
) {
  const sortDifference = normalizedSortOrder(left.sort_order) - normalizedSortOrder(right.sort_order);
  return sortDifference || left.id.localeCompare(right.id);
}

export function encodePersonSelectImageCursor(row: Pick<PersonSelectImageMetadataRow, "sort_order" | "id">) {
  return Buffer.from(JSON.stringify({
    sortOrder: normalizedSortOrder(row.sort_order),
    id: row.id,
  }), "utf8").toString("base64url");
}

export function decodePersonSelectImageCursor(value: string | null | undefined): PersonSelectImageCursor | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<PersonSelectImageCursor>;
    if (!Number.isFinite(parsed.sortOrder) || typeof parsed.id !== "string" || !parsed.id) return null;
    return { sortOrder: Number(parsed.sortOrder), id: parsed.id };
  } catch {
    return null;
  }
}

export function personSelectImageSearchTokens(value: string | null | undefined) {
  return [...new Set((value ?? "")
    .normalize("NFC")
    .split(/[\s,]+/)
    .map((token) => token.trim().toLocaleLowerCase("ko-KR"))
    .filter(Boolean)
    .slice(0, 10)
    .map((token) => token.slice(0, 80)))];
}

export function buildPersonSelectFolderManifest(
  rows: readonly Pick<PersonSelectImageMetadataRow, "id" | "source_rel_path" | "sort_order">[],
): PersonSelectFolderManifest {
  const folders = new Map<string, PersonSelectFolderManifestEntry>();
  let totalCount = 0;
  let rootPhotoCount = 0;
  const orderedRows = [...rows].sort(compareImageOrder);

  for (const row of orderedRows) {
    const relativePath = displayGalleryRelativePath(row.source_rel_path);
    if (!relativePath || isInsideDeliveredRoundFolder(relativePath)) continue;
    totalCount += 1;
    const folderPath = galleryFolderPath(relativePath);
    const parts = folderPath.split("/").filter(Boolean);
    if (!parts.length) rootPhotoCount += 1;
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
        parentPath: parts.slice(0, index).join("/"),
        depth: index,
        directCount: index === parts.length - 1 ? 1 : 0,
        totalCount: 1,
        representativeImageId: row.id,
      });
    });
  }
  return { totalCount, rootPhotoCount, folders: [...folders.values()] };
}

export function personSelectImageMatchesQuery(
  row: Pick<PersonSelectImageMetadataRow, "original_file_name" | "source_rel_path">,
  query: Pick<PersonSelectImagePageQuery, "location" | "folderPath" | "search">,
) {
  const relativePath = displayGalleryRelativePath(row.source_rel_path);
  if (!relativePath || isInsideDeliveredRoundFolder(relativePath)) return false;
  if (query.location === "folder") {
    const requestedFolder = displayGalleryRelativePath(query.folderPath);
    if (galleryFolderPath(relativePath) !== requestedFolder) return false;
  }
  const tokens = personSelectImageSearchTokens(query.search);
  if (!tokens.length) return true;
  const fileName = row.original_file_name.normalize("NFC").toLocaleLowerCase("ko-KR");
  return tokens.some((token) => fileName.includes(token));
}

export function paginatePersonSelectImageRows<T extends PersonSelectImageMetadataRow>(
  rows: readonly T[],
  query: PersonSelectImagePageQuery,
) {
  const limit = Math.min(PERSON_SELECT_IMAGE_PAGE_MAX, Math.max(1, Math.trunc(query.limit ?? PERSON_SELECT_IMAGE_PAGE_SIZE)));
  const cursor = query.cursor ? decodePersonSelectImageCursor(query.cursor) : null;
  if (query.cursor && !cursor) throw new Error("사진 페이지 위치가 올바르지 않습니다.");
  const matching = rows
    .filter((row) => personSelectImageMatchesQuery(row, query))
    .sort(compareImageOrder);
  const remaining = cursor
    ? matching.filter((row) => compareImageOrder(row, { sort_order: cursor.sortOrder, id: cursor.id }) > 0)
    : matching;
  const items = remaining.slice(0, limit);
  return {
    items,
    nextCursor: remaining.length > limit && items.length
      ? encodePersonSelectImageCursor(items[items.length - 1])
      : null,
    totalCount: matching.length,
  };
}
