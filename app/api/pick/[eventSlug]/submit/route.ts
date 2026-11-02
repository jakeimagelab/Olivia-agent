import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { effectiveExtraMax, eventIsLocked, findPickShortage, pickShortageMessage } from "@/lib/person-select/core";
import { getPublicSessionContext } from "@/lib/person-select/server";

export const preferredRegion = ["icn1"];

export async function POST(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  if (eventIsLocked(ctx.event)) return Response.json({ ok: false, error: "선택이 마감됐어요." }, { status: 423 });
  const db = getSupabaseAdmin();
  const counts: Record<string, number> = {};
  await Promise.all(ctx.event.categories.map(async (category) => {
    let query = db.from("person_select_images").select("id", { count: "exact", head: true })
      .eq("event_id", ctx.event.id).eq("category_key", category.key);
    query = category.key === "homeroom" ? query.eq("owner_group", ctx.person.group_label || "__none__") : query.eq("owner_person_id", ctx.person.id);
    counts[category.key] = (await query).count ?? 0;
  }));
  const { data: choices } = await db.from("person_select_choices").select("id,category_key,image_id,retouch_keys,memo")
    .eq("person_id", ctx.person.id).eq("event_id", ctx.event.id);
  const chosenCounts = (choices ?? []).reduce<Record<string, number>>((acc, item) => { acc[item.category_key] = (acc[item.category_key] ?? 0) + 1; return acc; }, {});
  const shortage = findPickShortage({ categories: ctx.event.categories, groupLabel: ctx.person.group_label, imageCounts: counts, chosenCounts, extraMax: effectiveExtraMax(ctx.event) });
  if (shortage) return Response.json({ ok: false, error: pickShortageMessage(shortage) }, { status: 400 });
  const now = new Date().toISOString();
  await db.from("person_select_people").update({ submitted_at: now, last_seen_at: now, updated_at: now }).eq("id", ctx.person.id);
  if ((choices ?? []).length) {
    await db.from("person_select_choice_history").insert((choices ?? []).map((choice) => ({
      choice_id: choice.id, person_id: ctx.person.id, category_key: choice.category_key,
      image_id: choice.image_id, retouch_keys: choice.retouch_keys, memo: choice.memo, action: "submit",
    })));
  }
  return Response.json({ ok: true, submitted_at: now });
}
