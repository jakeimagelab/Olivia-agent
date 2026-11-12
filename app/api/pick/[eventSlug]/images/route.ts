import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPublicSessionContext, signedImageUrls } from "@/lib/person-select/server";
import {
  decodePersonSelectImageCursor,
  encodePersonSelectImageCursor,
  PERSON_SELECT_IMAGE_PAGE_MAX,
  PERSON_SELECT_IMAGE_PAGE_SIZE,
} from "@/lib/person-select/imagePaging";

export const dynamic = "force-dynamic";
export const preferredRegion = ["icn1"];

export async function GET(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  const category = request.nextUrl.searchParams.get("category") || "";
  if (!ctx.event.categories.some((item) => item.key === category)) return Response.json({ ok: false, error: "없는 항목입니다." }, { status: 400 });
  const requestedVariant = request.nextUrl.searchParams.get("variant");
  const variant = requestedVariant === "thumbnail" || requestedVariant === "preview" ? requestedVariant : "both";
  const requestedImageIds = [...new Set(request.nextUrl.searchParams.getAll("imageId").map((value) => value.trim()).filter(Boolean))];
  if (requestedImageIds.length > 8) return Response.json({ ok: false, error: "미리보기는 한 번에 8장까지 요청할 수 있습니다." }, { status: 400 });
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const paged = requestedImageIds.length === 0 && rawLimit !== null;
  const parsedLimit = Number(rawLimit ?? PERSON_SELECT_IMAGE_PAGE_SIZE);
  if (paged && (!Number.isFinite(parsedLimit) || parsedLimit < 1)) {
    return Response.json({ ok: false, error: "사진 페이지 크기가 올바르지 않습니다." }, { status: 400 });
  }
  const limit = Math.min(PERSON_SELECT_IMAGE_PAGE_MAX, Math.max(1, Math.trunc(parsedLimit)));
  const rawCursor = request.nextUrl.searchParams.get("cursor");
  const cursor = rawCursor ? decodePersonSelectImageCursor(rawCursor) : null;
  if (rawCursor && !cursor) return Response.json({ ok: false, error: "사진 페이지 위치가 올바르지 않습니다." }, { status: 400 });
  let query = getSupabaseAdmin().from("person_select_images")
    .select("id,original_file_name,thumb_path,preview_path,width,height,sort_order")
    .eq("event_id", ctx.event.id).eq("category_key", category);
  query = category === "homeroom"
    ? query.eq("owner_group", ctx.person.group_label || "__none__")
    : query.eq("owner_person_id", ctx.person.id);
  if (requestedImageIds.length) query = query.in("id", requestedImageIds);
  if (paged && cursor) query = query.or(`sort_order.gt.${cursor.sortOrder},and(sort_order.eq.${cursor.sortOrder},id.gt.${cursor.id})`);
  query = query.order("sort_order", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
  if (paged) query = query.limit(limit + 1);
  const { data, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const queriedRows = data ?? [];
  const hasMore = paged && queriedRows.length > limit;
  const rows = paged ? queriedRows.slice(0, limit) : queriedRows;
  const includeThumbnail = variant === "thumbnail" || variant === "both";
  const includePreview = variant === "preview" || variant === "both";
  const signedUrls = await signedImageUrls(rows.flatMap((image) => [
    ...(includeThumbnail ? [image.thumb_path] : []),
    ...(includePreview ? [image.preview_path] : []),
  ]), 600);
  const images = rows.map((image) => ({
    id: image.id,
    original_file_name: image.original_file_name,
    thumb_url: includeThumbnail ? signedUrls.get(image.thumb_path) ?? "" : "",
    preview_url: includePreview ? signedUrls.get(image.preview_path) ?? "" : "",
    width: image.width,
    height: image.height,
    sort_order: image.sort_order,
  }));
  const nextCursor = hasMore && rows.length ? encodePersonSelectImageCursor(rows[rows.length - 1]) : null;
  return Response.json({ ok: true, images, nextCursor }, { headers: { "Cache-Control": "private, max-age=300" } });
}
