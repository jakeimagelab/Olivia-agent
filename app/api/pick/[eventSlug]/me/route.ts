import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signedImageUrls, getPublicSessionContext } from "@/lib/person-select/server";
import { eventIsLocked } from "@/lib/person-select/core";

export const dynamic = "force-dynamic";
export const preferredRegion = ["icn1"];

export async function GET(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  const db = getSupabaseAdmin();
  const { data: choices } = await db.from("person_select_choices")
    .select("id,category_key,image_id,retouch_keys,memo,updated_at,person_select_images(original_file_name,thumb_path)")
    .eq("person_id", ctx.person.id).eq("event_id", ctx.event.id);
  const thumbPaths = (choices ?? []).flatMap((choice) => {
    const image = choice.person_select_images as unknown as { thumb_path?: string } | null;
    return image?.thumb_path ? [image.thumb_path] : [];
  });
  const [signedThumbs, counts] = await Promise.all([
    signedImageUrls(thumbPaths, 600),
    Promise.all(ctx.event.categories.map(async (category) => {
    let query = db.from("person_select_images").select("id", { count: "exact", head: true })
      .eq("event_id", ctx.event.id).eq("category_key", category.key);
    query = category.key === "homeroom"
      ? query.eq("owner_group", ctx.person.group_label || "__none__")
      : query.eq("owner_person_id", ctx.person.id);
    const { count } = await query;
    return count ?? 0;
    })),
  ]);
  const categories = ctx.event.categories.map((category, index) => {
    const choice = (choices ?? []).find((item) => item.category_key === category.key) as Record<string, unknown> | undefined;
    const image = choice?.person_select_images as { original_file_name?: string; thumb_path?: string } | null | undefined;
    return {
      ...category,
      image_count: counts[index] ?? 0,
      choice: choice ? {
        id: choice.id,
        image_id: choice.image_id,
        original_file_name: image?.original_file_name ?? "",
        thumb_url: image?.thumb_path ? signedThumbs.get(image.thumb_path) ?? null : null,
        retouch_keys: choice.retouch_keys,
        memo: choice.memo,
        updated_at: choice.updated_at,
      } : null,
    };
  });
  await db.from("person_select_people").update({ last_seen_at: new Date().toISOString() }).eq("id", ctx.person.id);
  return Response.json({
    ok: true,
    event: {
      title: ctx.event.title,
      slug: ctx.event.slug,
      deadline_at: ctx.event.deadline_at,
      status: ctx.event.status,
      retouch_options: ctx.event.retouch_options,
      memo_max: ctx.event.memo_max,
      locked: eventIsLocked(ctx.event),
    },
    person: { display_name: ctx.person.display_name, group_label: ctx.person.group_label, submitted_at: ctx.person.submitted_at },
    categories,
  });
}
