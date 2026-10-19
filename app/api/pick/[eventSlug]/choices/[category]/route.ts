import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { eventIsLocked, validateChoiceInput } from "@/lib/person-select/core";
import { getPublicSessionContext, imageBelongsToPerson } from "@/lib/person-select/server";

export async function PUT(request: NextRequest, context: { params: Promise<{ eventSlug: string; category: string }> }) {
  const { eventSlug, category } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  if (eventIsLocked(ctx.event)) return Response.json({ ok: false, error: "선택이 마감됐어요." }, { status: 423 });
  if (!ctx.event.categories.some((item) => item.key === category)) return Response.json({ ok: false, error: "없는 항목입니다." }, { status: 400 });
  if (category === "homeroom" && !ctx.person.group_label) return Response.json({ ok: false, error: "담임 사진을 선택할 수 없습니다." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { image_id?: unknown; retouch_keys?: unknown; memo?: unknown };
  if (typeof body.image_id !== "string") return Response.json({ ok: false, error: "사진을 먼저 골라주세요." }, { status: 400 });
  const validation = validateChoiceInput({
    retouchKeys: body.retouch_keys ?? [],
    memo: body.memo ?? "",
    allowedKeys: ctx.event.retouch_options.map((item) => item.key),
    memoMax: ctx.event.memo_max,
  });
  if (validation) return Response.json({ ok: false, error: validation }, { status: 400 });
  if (!await imageBelongsToPerson({ imageId: body.image_id, categoryKey: category, eventId: ctx.event.id, personId: ctx.person.id, groupLabel: ctx.person.group_label })) {
    return Response.json({ ok: false, error: "이 사진을 선택할 권한이 없습니다." }, { status: 403 });
  }
  const db = getSupabaseAdmin();
  const { data: existing } = await db.from("person_select_choices").select("*")
    .eq("person_id", ctx.person.id).eq("category_key", category).maybeSingle();
  if (existing) {
    await db.from("person_select_choice_history").insert({
      choice_id: existing.id, person_id: existing.person_id, category_key: existing.category_key,
      image_id: existing.image_id, retouch_keys: existing.retouch_keys, memo: existing.memo, action: "save",
    });
  }
  const now = new Date().toISOString();
  const payload = {
    event_id: ctx.event.id,
    person_id: ctx.person.id,
    category_key: category,
    image_id: body.image_id,
    retouch_keys: body.retouch_keys ?? [],
    memo: body.memo ?? "",
    updated_at: now,
  };
  const { data, error } = await db.from("person_select_choices")
    .upsert(payload, { onConflict: "person_id,category_key" }).select("id,updated_at").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  await db.from("person_select_people").update({ last_seen_at: now, updated_at: now }).eq("id", ctx.person.id);
  return Response.json({ ok: true, choice: data });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ eventSlug: string; category: string }> }) {
  const { eventSlug, category } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  if (eventIsLocked(ctx.event)) return Response.json({ ok: false, error: "선택이 마감됐어요." }, { status: 423 });
  const db = getSupabaseAdmin();
  const { data: existing } = await db.from("person_select_choices").select("*")
    .eq("person_id", ctx.person.id).eq("category_key", category).maybeSingle();
  if (!existing) return Response.json({ ok: true });
  await db.from("person_select_choice_history").insert({
    choice_id: existing.id, person_id: existing.person_id, category_key: existing.category_key,
    image_id: existing.image_id, retouch_keys: existing.retouch_keys, memo: existing.memo, action: "save",
  });
  const { error } = await db.from("person_select_choices").delete().eq("id", existing.id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
