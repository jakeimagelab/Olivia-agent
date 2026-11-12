import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveExtraMax, pickLimit, validateChoiceInput } from "../core";
import type { SelectionSyncBatch, SelectionSyncDiff } from "../selectionSync";
import { markPersonSelectionAsDraft, selectionSyncFunctionMissing } from "../selectionSyncServer";
import type { PersonSelectEvent, PersonSelectOrderItem, PersonSelectPerson } from "../types";
import { PublicSelectionRequestError } from "@/lib/select-gallery/publicSelection";

export type PersonChoiceSnapshot = {
  items: Array<{
    imageId: string;
    categoryKey: string;
    selected: true;
    memo: string;
    retouchKeys: string[];
    updatedAt: string;
  }>;
  updatedAt: string | null;
};

async function dropOrdersForRemovedPhotos(
  db: SupabaseClient,
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

export async function loadPersonChoiceSnapshot(
  db: SupabaseClient,
  eventId: string,
  personId: string,
): Promise<PersonChoiceSnapshot> {
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
    updatedAt: (data ?? []).reduce<string | null>((latest, item) => (
      !latest || String(item.updated_at) > latest ? String(item.updated_at) : latest
    ), null),
  };
}

async function fallbackSave(input: {
  db: SupabaseClient;
  event: PersonSelectEvent;
  person: PersonSelectPerson;
  diffs: SelectionSyncDiff[];
}): Promise<PersonChoiceSnapshot> {
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
  for (const diff of [...input.diffs].sort((left, right) => left.clientSeq - right.clientSeq)) {
    const image = imageById.get(diff.imageId)!;
    const current = selected.get(diff.imageId);
    if (Object.prototype.hasOwnProperty.call(diff, "selected")) {
      if (diff.selected) {
        selected.set(diff.imageId, current ?? {
          id: "",
          image_id: diff.imageId,
          category_key: image.category_key,
          memo: "",
          retouch_keys: [],
          updated_at: diff.changedAt,
        });
      } else selected.delete(diff.imageId);
    }
    const next = selected.get(diff.imageId);
    if (next && Object.prototype.hasOwnProperty.call(diff, "memo")) next.memo = diff.memo ?? "";
    if (next && Object.prototype.hasOwnProperty.call(diff, "retouchKeys")) next.retouch_keys = diff.retouchKeys ?? [];
  }
  const extraMax = effectiveExtraMax(input.event);
  for (const category of input.event.categories) {
    const count = [...selected.values()].filter((choice) => choice.category_key === category.key).length;
    if (count > pickLimit(category.pick, extraMax)) {
      throw new PublicSelectionRequestError(`${category.key} 선택 장수를 확인해 주세요.`, 409);
    }
  }

  const selectedIds = new Set(selected.keys());
  const removed = (choices ?? []).filter((choice) => !selectedIds.has(String(choice.image_id)));
  if (removed.length) {
    const { error } = await input.db.from("person_select_choices").delete().in("id", removed.map((choice) => choice.id));
    if (error) throw error;
  }
  for (const choice of selected.values()) {
    const validation = validateChoiceInput({
      retouchKeys: choice.retouch_keys,
      memo: choice.memo,
      allowedKeys: input.event.retouch_options.map((item) => item.key),
      memoMax: input.event.memo_max,
    });
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
  const saved = await loadPersonChoiceSnapshot(input.db, input.event.id, input.person.id);
  return { ...saved, updatedAt: new Date().toISOString() };
}

export async function savePersonChoiceDiffs(
  db: SupabaseClient,
  event: PersonSelectEvent,
  person: PersonSelectPerson,
  batch: SelectionSyncBatch,
) {
  const { data, error } = await db.rpc("save_person_select_person_item_diffs", {
    p_event_id: event.id,
    p_person_id: person.id,
    p_client_id: batch.clientId,
    p_diffs: batch.diffs,
  });
  let snapshot: unknown = data;
  if (error) {
    if (!selectionSyncFunctionMissing(error)) throw error;
    snapshot = await fallbackSave({ db, event, person, diffs: batch.diffs });
  }

  if (batch.diffs.length) await markPersonSelectionAsDraft(db, event.id, person.id);
  if (batch.diffs.some((diff) => diff.selected === false)) {
    await dropOrdersForRemovedPhotos(db, event.id, person.id, person.orders);
  }
  return snapshot;
}
