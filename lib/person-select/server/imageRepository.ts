import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPersonSelectFolderManifest,
  decodePersonSelectImageCursor,
  encodePersonSelectImageCursor,
  PERSON_SELECT_IMAGE_PAGE_MAX,
  PERSON_SELECT_IMAGE_PAGE_SIZE,
  personSelectImageSearchTokens,
  type PersonSelectImagePageQuery,
} from "../imagePaging";
import { readAllPersonSelectRows } from "../paging";
import { displayGalleryRelativePath } from "@/lib/select-gallery/customerBridge";
import { PublicSelectionRequestError } from "@/lib/select-gallery/publicSelection";

const IMAGE_METADATA_SELECT = "id,original_file_name,source_rel_path,thumb_path,preview_path,width,height,sort_order";
const DELIVERED_FOLDER_LIKE = "%차보정본/%";

export function parsePersonSelectImagePageQuery(searchParams: URLSearchParams): PersonSelectImagePageQuery {
  const location = searchParams.get("location") ?? "all";
  if (location !== "all" && location !== "folder") {
    throw new PublicSelectionRequestError("사진 위치가 올바르지 않습니다.");
  }
  const rawFolderPath = searchParams.get("folder") ?? "";
  const folderPath = displayGalleryRelativePath(rawFolderPath);
  if (rawFolderPath && folderPath !== rawFolderPath.normalize("NFC").replace(/[\\/]+/g, "/").replace(/^\/+|\/+$/g, "")) {
    throw new PublicSelectionRequestError("사진 폴더 경로가 올바르지 않습니다.");
  }
  const rawLimit = Number(searchParams.get("limit") ?? PERSON_SELECT_IMAGE_PAGE_SIZE);
  if (!Number.isFinite(rawLimit) || rawLimit < 1) throw new PublicSelectionRequestError("사진 페이지 크기가 올바르지 않습니다.");
  const cursor = searchParams.get("cursor");
  if (cursor && !decodePersonSelectImageCursor(cursor)) throw new PublicSelectionRequestError("사진 페이지 위치가 올바르지 않습니다.");
  return {
    location,
    folderPath,
    search: searchParams.get("search") ?? "",
    cursor,
    limit: Math.min(PERSON_SELECT_IMAGE_PAGE_MAX, Math.trunc(rawLimit)),
  };
}

export async function loadPersonSelectFolderManifest(db: SupabaseClient, eventId: string) {
  const rows = await readAllPersonSelectRows((from, to) => db.from("person_select_images")
    .select("id,source_rel_path,sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to));
  return buildPersonSelectFolderManifest(rows);
}

function searchFilterExpression(value: string | undefined) {
  return personSelectImageSearchTokens(value)
    .map((token) => token.replace(/[^\p{L}\p{N}_.-]+/gu, ""))
    .filter(Boolean)
    .map((token) => `original_file_name.ilike.*${token}*`)
    .join(",");
}

export async function loadPersonSelectImagePage(
  db: SupabaseClient,
  eventId: string,
  input: PersonSelectImagePageQuery,
) {
  const limit = Math.min(PERSON_SELECT_IMAGE_PAGE_MAX, Math.max(1, Math.trunc(input.limit ?? PERSON_SELECT_IMAGE_PAGE_SIZE)));
  const cursor = input.cursor ? decodePersonSelectImageCursor(input.cursor) : null;
  if (input.cursor && !cursor) throw new PublicSelectionRequestError("사진 페이지 위치가 올바르지 않습니다.");
  const folderPath = displayGalleryRelativePath(input.folderPath);
  const searchExpression = searchFilterExpression(input.search);

  let pageQuery = db.from("person_select_images")
    .select(IMAGE_METADATA_SELECT)
    .eq("event_id", eventId)
    .not("source_rel_path", "like", DELIVERED_FOLDER_LIKE);
  let countQuery = db.from("person_select_images")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .not("source_rel_path", "like", DELIVERED_FOLDER_LIKE);

  if (input.location === "folder") {
    if (folderPath) {
      pageQuery = pageQuery.like("source_rel_path", `${folderPath}/%`).not("source_rel_path", "like", `${folderPath}/%/%`);
      countQuery = countQuery.like("source_rel_path", `${folderPath}/%`).not("source_rel_path", "like", `${folderPath}/%/%`);
    } else {
      pageQuery = pageQuery.not("source_rel_path", "like", "%/%");
      countQuery = countQuery.not("source_rel_path", "like", "%/%");
    }
  }
  if (searchExpression) {
    pageQuery = pageQuery.or(searchExpression);
    countQuery = countQuery.or(searchExpression);
  }
  if (cursor) {
    pageQuery = pageQuery.or(`sort_order.gt.${cursor.sortOrder},and(sort_order.eq.${cursor.sortOrder},id.gt.${cursor.id})`);
  }

  const [pageResult, countResult] = await Promise.all([
    pageQuery
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(limit + 1),
    countQuery,
  ]);
  if (pageResult.error) throw pageResult.error;
  if (countResult.error) throw countResult.error;
  const rows = pageResult.data ?? [];
  const hasMore = rows.length > limit;
  const visibleRows = rows.slice(0, limit);
  return {
    items: visibleRows.map((row) => ({
      id: row.id,
      original_file_name: row.original_file_name,
      relative_path: row.source_rel_path,
      thumbnail_url: "",
      image_url: "",
      width: row.width,
      height: row.height,
      sort_order: row.sort_order,
    })),
    nextCursor: hasMore && visibleRows.length ? encodePersonSelectImageCursor(visibleRows[visibleRows.length - 1]) : null,
    totalCount: countResult.count ?? visibleRows.length,
  };
}
