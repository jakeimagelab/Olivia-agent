import { NextRequest } from "next/server";
import { effectiveExtraMax, eventIsLocked, pickLimit, validateChoiceInput } from "@/lib/person-select/core";
import { getPublicSessionContext } from "@/lib/person-select/server";
import { parseSelectionSyncBatch, type SelectionSyncDiff } from "@/lib/person-select/selectionSync";
import { markPersonSelectionAsDraft, recordSelectionSaveFailure, selectionSyncFunctionMissing } from "@/lib/person-select/selectionSyncServer";
import type { PersonSelectOrderItem } from "@/lib/person-select/types";
import { enforcePublicSelectionRateLimit, getOwnedSelectionImageIds, PublicSelectionRequestError, publicSelectionErrorResponse, readPublicSelectionJson } from "@/lib/select-gallery/publicSelection";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const preferredRegion = ["icn1"];

async function dropOrdersForRemovedPhotos(
  db: ReturnType<typeof getSupabaseAdmin>,
  eventId: string,
  personId: string,
  orders: PersonSelectOrderItem[] | undefined,
) {
  if (!orders?.some((item) => item.image_id)) return;
  const { data, error } = await db.from("person_select_choices")
    .select("image_id")
    .eq("event_id", eventId)
    .eq("person_id", personId);
  if (error) throw error;
  const chosen = new Set((data ?? []).map((row) => String(row.image_id)));
  const kept = orders.filter((item) => !item.image_id || chosen.has(item.image_id));
  if (kept.length === orders.length) return;
  const { error: updateError } = await db.from("person_select_people")
    .update({ orders: kept, orders_updated_at: new Date().toISOString() })
    .eq("id", personId)
    .eq("event_id", eventId);
  if (updateError) throw updateError;
}

async function getPersonChoiceSnapshot(db: ReturnType<typeof getSupabaseAdmin>, eventId: string, personId: string) {
  const { data, error } = await db.from("person_select_choices")
    .select("image_id,category_key,memo,retouch_keys,updated_at")
    .eq("event_id", eventId)
    .eq("person_id", personId);
  if (error) throw error;
  return {
    items: (data ?? []).map((item) => ({
      imageId: item.image_id,
      categoryKey: item.category_key,
      selected: true,
      memo: item.memo,
      retouchKeys: item.retouch_keys,
      updatedAt: item.updated_at,
    })),
    updatedAt: (data ?? []).reduce<string | null>((latest, item) => !latest || String(item.updated_at) > latest ? String(item.updated_at) : latest, null),
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  const db = getSupabaseAdmin();
  try {
    await enforcePublicSelectionRateLimit({ db, request, token: `${ctx.event.id}:${ctx.person.id}`, action: "person-choice-sync-read", limit: 120, identityOnly: true });
    return Response.json({ ok: true, snapshot: await getPersonChoiceSnapshot(db, ctx.event.id, ctx.person.id) });
  } catch (error) { return publicSelectionErrorResponse(error); }
}

async function fallbackSave(input: {
  db: ReturnType<typeof getSupabaseAdmin>;
  event: { id: string; categories: Array<{ key: string; pick: number }>; retouch_options: Array<{ key: string }>; memo_max: number; extra_price?: number | null; extra_max?: number | null };
  person: { id: string; group_label: string | null };
  diffs: SelectionSyncDiff[];
}) {
  const imageIds = [...new Set(input.diffs.map((diff) => diff.imageId))];
  const [{ data: images, error: imageError }, { data: choices, error: choiceError }] = await Promise.all([
    input.db.from("person_select_images").select("id,category_key,owner_person_id,owner_group").eq("event_id", input.event.id).in("id", imageIds),
    input.db.from("person_select_choices").select("id,image_id,category_key,memo,retouch_keys,updated_at").eq("event_id", input.event.id).eq("person_id", input.person.id),
  ]);
  if (imageError || choiceError) throw imageError ?? choiceError;
  const imageById = new Map((images ?? []).map((image) => [String(image.id), image]));
  if (imageById.size !== imageIds.length || [...imageById.values()].some((image) => (
    image.category_key === "homeroom"
      ? !input.person.group_label || image.owner_group !== input.person.group_label
      : image.owner_person_id !== input.person.id
  ))) throw new PublicSelectionRequestError("이 사진을 선택할 권한이 없습니다.", 403);

  const selected = new Map((choices ?? []).map((choice) => [String(choice.image_id), { ...choice }]));
  for (const diff of input.diffs.sort((a, b) => a.clientSeq - b.clientSeq)) {
    const image = imageById.get(diff.imageId)!;
    const current = selected.get(diff.imageId);
    if (Object.prototype.hasOwnProperty.call(diff, "selected")) {
      if (diff.selected) selected.set(diff.imageId, current ?? { id: "", image_id: diff.imageId, category_key: image.category_key, memo: "", retouch_keys: [], updated_at: diff.changedAt });
      else selected.delete(diff.imageId);
    }
    const next = selected.get(diff.imageId);
    if (next && Object.prototype.hasOwnProperty.call(diff, "memo")) next.memo = diff.memo ?? "";
    if (next && Object.prototype.hasOwnProperty.call(diff, "retouchKeys")) next.retouch_keys = diff.retouchKeys ?? [];
  }
  const extraMax = effectiveExtraMax(input.event);
  for (const category of input.event.categories) {
    const count = [...selected.values()].filter((choice) => choice.category_key === category.key).length;
    if (count > pickLimit(category.pick, extraMax)) throw new PublicSelectionRequestError(`${category.key} 선택 장수를 확인해 주세요.`, 409);
  }

  const selectedIds = new Set(selected.keys());
  const removed = (choices ?? []).filter((choice) => !selectedIds.has(String(choice.image_id)));
  if (removed.length) {
    const { error } = await input.db.from("person_select_choices").delete().in("id", removed.map((choice) => choice.id));
    if (error) throw error;
  }
  for (const choice of selected.values()) {
    const validation = validateChoiceInput({ retouchKeys: choice.retouch_keys, memo: choice.memo, allowedKeys: input.event.retouch_options.map((item) => item.key), memoMax: input.event.memo_max });
    if (validation) throw new PublicSelectionRequestError(validation);
    const { error } = await input.db.from("person_select_choices").upsert({
      event_id: input.event.id,
      person_id: input.person.id,
      category_key: choice.category_key,
      image_id: choice.image_id,
      memo: choice.memo,
      retouch_keys: choice.retouch_keys,
      updated_at: new Date().toISOString(),
    }, { onConflict: "person_id,image_id" });
    if (error) throw error;
  }
  const { data: saved, error: savedError } = await input.db.from("person_select_choices")
    .select("image_id,category_key,memo,retouch_keys,updated_at").eq("event_id", input.event.id).eq("person_id", input.person.id);
  if (savedError) throw savedError;
  return { items: (saved ?? []).map((item) => ({ imageId: item.image_id, categoryKey: item.category_key, selected: true, memo: item.memo, retouchKeys: item.retouch_keys, updatedAt: item.updated_at })), updatedAt: new Date().toISOString() };
}

export async function PUT(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  if (eventIsLocked(ctx.event)) return Response.json({ ok: false, error: "선택이 마감됐어요." }, { status: 423 });
  const db = getSupabaseAdmin();
  try {
    await enforcePublicSelectionRateLimit({ db, request, token: `${ctx.event.id}:${ctx.person.id}`, action: "person-choice-batch", limit: 60, identityOnly: true });
    const body = await readPublicSelectionJson(request);
    const owned = await getOwnedSelectionImageIds(db, { table: "person_select_images", ownerColumn: "event_id", ownerId: ctx.event.id }, body);
    let parsed: ReturnType<typeof parseSelectionSyncBatch>;
    try { parsed = parseSelectionSyncBatch(body, owned); }
    catch (error) { throw new PublicSelectionRequestError(error instanceof Error ? error.message : "저장 요청 형식이 올바르지 않습니다."); }
    for (const diff of parsed.diffs) {
      if (Object.prototype.hasOwnProperty.call(diff, "memo") || Object.prototype.hasOwnProperty.call(diff, "retouchKeys")) {
        const validation = validateChoiceInput({
          retouchKeys: diff.retouchKeys ?? [],
          memo: diff.memo ?? "",
          allowedKeys: ctx.event.retouch_options.map((item) => item.key),
          memoMax: ctx.event.memo_max,
        });
        if (validation) throw new PublicSelectionRequestError(validation);
      }
    }
    const { data, error } = await db.rpc("save_person_select_person_item_diffs", {
      p_event_id: ctx.event.id,
      p_person_id: ctx.person.id,
      p_client_id: parsed.clientId,
      p_diffs: parsed.diffs,
    });
    if (!error) {
      if (parsed.diffs.length) await markPersonSelectionAsDraft(db, ctx.event.id, ctx.person.id);
      if (parsed.diffs.some((diff) => diff.selected === false)) {
        await dropOrdersForRemovedPhotos(db, ctx.event.id, ctx.person.id, ctx.person.orders);
      }
      return Response.json({ ok: true, snapshot: data });
    }
    if (!selectionSyncFunctionMissing(error)) throw error;
    const snapshot = await fallbackSave({ db, event: ctx.event, person: ctx.person, diffs: parsed.diffs });
    if (parsed.diffs.length) await markPersonSelectionAsDraft(db, ctx.event.id, ctx.person.id);
    if (parsed.diffs.some((diff) => diff.selected === false)) {
      await dropOrdersForRemovedPhotos(db, ctx.event.id, ctx.person.id, ctx.person.orders);
    }
    return Response.json({ ok: true, snapshot });
  } catch (error) {
    await recordSelectionSaveFailure({ db, eventId: ctx.event.id, actorType: "person", actorId: ctx.person.id, error, stage: "person_choice_batch" });
    return publicSelectionErrorResponse(error);
  }
}
