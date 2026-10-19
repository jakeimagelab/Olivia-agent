import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPublicSessionContext, signedImageUrls } from "@/lib/person-select/server";

export const dynamic = "force-dynamic";
export const preferredRegion = ["icn1"];

export async function GET(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  const category = request.nextUrl.searchParams.get("category") || "";
  if (!ctx.event.categories.some((item) => item.key === category)) return Response.json({ ok: false, error: "없는 항목입니다." }, { status: 400 });
  let query = getSupabaseAdmin().from("person_select_images")
    .select("id,original_file_name,thumb_path,preview_path,width,height,sort_order")
    .eq("event_id", ctx.event.id).eq("category_key", category).order("sort_order").order("original_file_name");
  query = category === "homeroom"
    ? query.eq("owner_group", ctx.person.group_label || "__none__")
    : query.eq("owner_person_id", ctx.person.id);
  const { data, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const rows = data ?? [];
  const signedUrls = await signedImageUrls(rows.flatMap((image) => [image.thumb_path, image.preview_path]), 600);
  const images = rows.map((image) => ({
    id: image.id,
    original_file_name: image.original_file_name,
    thumb_url: signedUrls.get(image.thumb_path) ?? "",
    preview_url: signedUrls.get(image.preview_path) ?? "",
    width: image.width,
    height: image.height,
  }));
  return Response.json({ ok: true, images });
}
