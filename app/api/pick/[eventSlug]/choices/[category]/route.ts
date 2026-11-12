import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { effectiveExtraMax, eventIsLocked, pickLimit, validateChoiceInput } from "@/lib/person-select/core";
import { getPublicSessionContext, imageBelongsToPerson } from "@/lib/person-select/server";

export const preferredRegion = ["icn1"];

type ChoiceRow = { id: string; person_id: string; category_key: string; image_id: string; retouch_keys: unknown; memo: string };

/** 고른 사진에서 빠진 사진으로 신청한 액자 같은 주문은 함께 지운다. */
async function dropOrdersForRemovedPhotos(personId: string, eventId: string, orders: { image_id: string | null }[] | undefined) {
  if (!orders?.some((item) => item.image_id)) return;
  const db = getSupabaseAdmin();
  const { data } = await db.from("person_select_choices").select("image_id").eq("person_id", personId).eq("event_id", eventId);
  const chosen = new Set((data ?? []).map((row) => row.image_id as string));
  const kept = orders.filter((item) => !item.image_id || chosen.has(item.image_id));
  if (kept.length !== orders.length) await db.from("person_select_people").update({ orders: kept, orders_updated_at: new Date().toISOString() }).eq("id", personId);
}

function historyRow(choice: ChoiceRow, action: "save") {
  return { choice_id: choice.id, person_id: choice.person_id, category_key: choice.category_key, image_id: choice.image_id, retouch_keys: choice.retouch_keys, memo: choice.memo, action };
}

/**
 * 사진 한 장을 고르거나, 이미 고른 사진의 보정 요청·메모를 저장한다.
 * 항목의 수량(pick)까지 고를 수 있고, 수량이 1장이면 다른 사진을 고를 때 앞의 선택을 바꾼다.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ eventSlug: string; category: string }> }) {
  const { eventSlug, category } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  if (eventIsLocked(ctx.event)) return Response.json({ ok: false, error: "선택이 마감됐어요." }, { status: 423 });
  const categoryConfig = ctx.event.categories.find((item) => item.key === category);
  if (!categoryConfig) return Response.json({ ok: false, error: "없는 항목입니다." }, { status: 400 });
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
  const { data: rows, error: readError } = await db.from("person_select_choices").select("*")
    .eq("person_id", ctx.person.id).eq("category_key", category);
  if (readError) return Response.json({ ok: false, error: readError.message }, { status: 500 });
  const existing = (rows ?? []) as ChoiceRow[];
  const same = existing.find((row) => row.image_id === body.image_id);
  const now = new Date().toISOString();
  const values = { retouch_keys: body.retouch_keys ?? [], memo: body.memo ?? "", updated_at: now };

  let saved: { id: string; updated_at: string } | null = null;
  if (same) {
    await db.from("person_select_choice_history").insert(historyRow(same, "save"));
    const { data, error } = await db.from("person_select_choices").update(values).eq("id", same.id).select("id,updated_at").single();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    saved = data;
  } else {
    // 기본 장수 + (추가 보정을 받는 행사라면) 추가로 고를 수 있는 장수까지
    const limit = pickLimit(categoryConfig.pick, effectiveExtraMax(ctx.event));
    if (existing.length >= limit) {
      if (limit !== 1) return Response.json({ ok: false, error: `${categoryConfig.label}은 ${limit}장까지 고를 수 있어요. 다른 사진을 먼저 빼주세요.` }, { status: 409 });
      // 1장만 고르는 항목은 예전처럼 새로 고른 사진으로 바꾼다.
      const previous = existing[0];
      await db.from("person_select_choice_history").insert(historyRow(previous, "save"));
      const { data, error } = await db.from("person_select_choices").update({ image_id: body.image_id, ...values }).eq("id", previous.id).select("id,updated_at").single();
      if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
      saved = data;
      await dropOrdersForRemovedPhotos(ctx.person.id, ctx.event.id, ctx.person.orders);
    } else {
      const { data, error } = await db.from("person_select_choices")
        .insert({ event_id: ctx.event.id, person_id: ctx.person.id, category_key: category, image_id: body.image_id, ...values })
        .select("id,updated_at").single();
      if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
      saved = data;
    }
  }
  await db.from("person_select_people").update({ submitted_at: null, last_seen_at: now, updated_at: now }).eq("id", ctx.person.id);
  return Response.json({ ok: true, choice: saved });
}

/** ?image_id= 로 사진 한 장의 선택을 뺀다. image_id가 없으면 그 항목의 선택을 모두 뺀다. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ eventSlug: string; category: string }> }) {
  const { eventSlug, category } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  if (eventIsLocked(ctx.event)) return Response.json({ ok: false, error: "선택이 마감됐어요." }, { status: 423 });
  const imageId = request.nextUrl.searchParams.get("image_id");
  const db = getSupabaseAdmin();
  let query = db.from("person_select_choices").select("*").eq("person_id", ctx.person.id).eq("category_key", category);
  if (imageId) query = query.eq("image_id", imageId);
  const { data: rows } = await query;
  const existing = (rows ?? []) as ChoiceRow[];
  if (!existing.length) return Response.json({ ok: true });
  await db.from("person_select_choice_history").insert(existing.map((row) => historyRow(row, "save")));
  const { error } = await db.from("person_select_choices").delete().in("id", existing.map((row) => row.id));
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  await dropOrdersForRemovedPhotos(ctx.person.id, ctx.event.id, ctx.person.orders);
  const now = new Date().toISOString();
  await db.from("person_select_people").update({ submitted_at: null, last_seen_at: now, updated_at: now }).eq("id", ctx.person.id);
  return Response.json({ ok: true });
}
