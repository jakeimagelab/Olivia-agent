import type { SupabaseClient } from "@supabase/supabase-js";
import { countCustomerSelection, normalizeCustomerColorLabel, normalizeCustomerRating } from "../customerSelection";
import { extraPickCount, priceOrder, requiredPickCount, selectionStatus } from "../core";
import { loadAdminDeliveryItems } from "../deliveryServer";
import { customerSelectionSnapshotFromRows } from "../domain/selectionSnapshot";
import { firstPersonSelectImageByCategory, firstPersonSelectImageByOwner } from "../matching";
import { canPersonSelectReviewerFinalize } from "../reviewerPermissions";
import { signedImageUrls } from "../server";
import type { PersonSelectCategory, PersonSelectOffer, PersonSelectOrderItem } from "../types";
import {
  loadAdminProjectBase,
  loadOpenSelectionSaveFailures,
  loadSharedAdminProjectState,
} from "./adminProjectRepository";

function rowsByKey<T>(rows: readonly T[], key: (row: T) => string | null | undefined) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    const list = grouped.get(value);
    if (list) list.push(row);
    else grouped.set(value, [row]);
  }
  return grouped;
}

export async function loadPersonSelectAdminProject(db: SupabaseClient, eventId: string) {
  const { event, people, choices, images } = await loadAdminProjectBase(db, eventId);
  if (!event) return null;

  const choiceThumbUrls = await signedImageUrls(choices.flatMap((choice) => {
    const image = choice.person_select_images as unknown as { thumb_path?: string | null } | null;
    return image?.thumb_path ? [image.thumb_path] : [];
  }));
  const choiceRows = choices.map((choice) => {
    const image = choice.person_select_images as unknown as { original_file_name: string; source_rel_path: string; thumb_path: string } | null;
    return { ...choice, person_select_images: image ? { ...image, thumb_url: choiceThumbUrls.get(image.thumb_path) ?? "" } : null };
  });

  const personCounts = new Map<string, Record<string, number>>();
  const groupCounts: Record<string, number> = {};
  for (const row of images) {
    if (row.category_key === "homeroom") {
      if (row.owner_group) groupCounts[row.owner_group] = (groupCounts[row.owner_group] ?? 0) + 1;
      continue;
    }
    if (!row.owner_person_id) continue;
    const counts = personCounts.get(row.owner_person_id) ?? {};
    counts[row.category_key] = (counts[row.category_key] ?? 0) + 1;
    personCounts.set(row.owner_person_id, counts);
  }

  const representativeImages = firstPersonSelectImageByOwner(images);
  const categoryRepresentativeImages = firstPersonSelectImageByCategory(images);
  const representativeUrls = await signedImageUrls([
    ...representativeImages.values(),
    ...categoryRepresentativeImages.values(),
  ].map((image) => image.thumb_path));
  const publicRepresentative = (image: typeof images[number]) => ({
    category_key: image.category_key,
    original_file_name: image.original_file_name,
    source_rel_path: image.source_rel_path,
    thumb_url: representativeUrls.get(image.thumb_path) ?? "",
  });

  const categories = (event.categories ?? []) as PersonSelectCategory[];
  const saveFailures = await loadOpenSelectionSaveFailures(db, eventId);
  const failureCounts = new Map<string, number>();
  for (const failure of saveFailures) {
    const key = `${failure.actor_type}:${failure.actor_id}`;
    failureCounts.set(key, (failureCounts.get(key) ?? 0) + 1);
  }
  const failureCountFor = (actorType: "person" | "reviewer", actorId: string) => failureCounts.get(`${actorType}:${actorId}`) ?? 0;

  const deliveryRows = await loadAdminDeliveryItems(db, eventId);
  const deliveriesByPerson = rowsByKey(deliveryRows, (delivery) => delivery.person_id);
  const choicesByPerson = rowsByKey(choiceRows, (choice) => choice.person_id);
  const peopleRows = people.map((person) => {
    const ownChoices = choicesByPerson.get(person.id) ?? [];
    const latest = ownChoices.map((choice) => choice.updated_at).sort().at(-1) ?? null;
    const imageCounts: Record<string, number> = { ...(personCounts.get(person.id) ?? {}) };
    imageCounts.homeroom = person.group_label ? groupCounts[person.group_label] ?? 0 : 0;
    const needCounts = Object.fromEntries(categories.map((category) => [category.key, requiredPickCount(category.pick, imageCounts[category.key] ?? 0)]));
    const personDeliveries = deliveriesByPerson.get(person.id) ?? [];
    return {
      ...person,
      choices: ownChoices,
      image_counts: imageCounts,
      need_counts: needCounts,
      representative_image: (() => {
        const image = representativeImages.get(person.id);
        return image ? publicRepresentative(image) : null;
      })(),
      representative_images: Object.fromEntries(categories.flatMap((category) => {
        const image = categoryRepresentativeImages.get(`${person.id}\u0000${category.key}`);
        return image ? [[category.key, publicRepresentative(image)]] : [];
      })),
      order: (() => {
        const chosenCounts = ownChoices.reduce<Record<string, number>>((acc, choice) => {
          acc[choice.category_key] = (acc[choice.category_key] ?? 0) + 1;
          return acc;
        }, {});
        const photoNames = Object.fromEntries(ownChoices.map((choice) => [choice.image_id, choice.person_select_images?.original_file_name ?? ""]));
        return priceOrder({
          offers: (event.offers ?? []) as PersonSelectOffer[],
          items: (person.orders ?? []) as PersonSelectOrderItem[],
          extraCount: extraPickCount(categories, chosenCounts),
          extraPrice: Number(event.extra_price) || 0,
          photoNames,
        });
      })(),
      status_label: selectionStatus({ firstSeenAt: person.first_seen_at, submittedAt: person.submitted_at, choiceCount: ownChoices.length, latestChoiceAt: latest }),
      latest_activity_at: latest || person.last_seen_at || person.first_seen_at,
      server_selected_count: countCustomerSelection(ownChoices.map(() => ({ selected: true }))),
      server_last_saved_at: latest,
      recent_save_failure_count: failureCountFor("person", person.id),
      deliveries: personDeliveries,
      delivery_count: personDeliveries.length,
      delivery_revision_count: personDeliveries.filter((delivery) => delivery.status === "revision_requested").length,
    };
  });

  const groups = Object.entries(groupCounts)
    .sort(([left], [right]) => left.localeCompare(right, "ko", { numeric: true }))
    .map(([label, image_count]) => ({ label, image_count }));

  let shared: Record<string, unknown> | null = null;
  if (event.access_mode === "project_shared") {
    const { reviewers, drafts, selections, latestByReviewer, selectedItems } = await loadSharedAdminProjectState(db, eventId);
    const draftItemsByReviewer = new Map<string, Array<Record<string, unknown>>>(drafts.map((draft) => [
      draft.reviewer_id,
      Array.isArray(draft.items) ? draft.items as Array<Record<string, unknown>> : [],
    ]));
    const imageById = new Map(images.map((image) => [image.id, image]));
    const sharedItemImageIds = [
      ...selectedItems.map((item) => item.image_id),
      ...[...draftItemsByReviewer.values()].flatMap((items) => items.map((item) => String(item.image_id ?? "")).filter(Boolean)),
    ];
    const sharedThumbUrls = await signedImageUrls([...new Set(sharedItemImageIds)].flatMap((imageId) => {
      const image = imageById.get(imageId);
      return image?.thumb_path ? [image.thumb_path] : [];
    }));
    const imageFor = (imageId: string) => {
      const image = imageById.get(imageId);
      return image ? {
        original_file_name: image.original_file_name,
        source_rel_path: image.source_rel_path,
        thumb_url: sharedThumbUrls.get(image.thumb_path) ?? "",
      } : null;
    };
    const itemsBySelection = rowsByKey(selectedItems, (item) => item.selection_id);
    const itemsFor = (selectionId: string) => (itemsBySelection.get(selectionId) ?? []).map((item) => ({
      ...item,
      image: imageFor(item.image_id),
    }));
    const draftItemsFor = (reviewerId: string) => (draftItemsByReviewer.get(reviewerId) ?? []).flatMap((item) => {
      const imageId = String(item.image_id ?? "");
      if (!imageId) return [];
      return [{
        image_id: imageId,
        customer_rating: normalizeCustomerRating(Number(item.customer_rating)),
        customer_color_label: normalizeCustomerColorLabel(Number(item.customer_color_label)),
        memo: typeof item.memo === "string" ? item.memo : "",
        image: imageFor(imageId),
      }];
    });
    const draftByReviewer = new Map(drafts.map((draft) => [draft.reviewer_id, draft]));
    const reviewerRows = reviewers.map((reviewer) => {
      const draft = draftByReviewer.get(reviewer.id);
      const selection = latestByReviewer.get(reviewer.id);
      const draftItems = draftItemsByReviewer.get(reviewer.id) ?? [];
      const snapshot = customerSelectionSnapshotFromRows({
        revision: draft?.revision,
        rows: draftItems.map((item) => ({
          ...item,
          customer_rating: Number(item.customer_rating),
          customer_color_label: Number(item.customer_color_label),
        })),
        customerMemo: draft?.customer_memo,
        updatedAt: draft?.updated_at,
      });
      return {
        ...reviewer,
        can_finalize: canPersonSelectReviewerFinalize(reviewer),
        draft: draft ? {
          ...snapshot,
          selected_count: draftItems.length,
          items: draftItemsFor(reviewer.id),
          updated_at: draft.updated_at,
        } : null,
        selection: selection ? { ...selection, items: itemsFor(selection.id) } : null,
        server_selected_count: countCustomerSelection(draftItems.map(() => ({ selected: true }))),
        server_last_saved_at: draft?.updated_at ?? null,
        recent_save_failure_count: failureCountFor("reviewer", reviewer.id),
      };
    });
    const latestSelection = selections[0] ?? null;
    shared = {
      image_count: images.length,
      images: images.map((image) => ({
        id: image.id,
        original_file_name: image.original_file_name,
        relative_path: image.source_rel_path,
        thumbnail_url: "",
        image_url: "",
        sort_order: image.sort_order,
      })),
      selection: latestSelection ? { ...latestSelection, items: itemsFor(latestSelection.id) } : null,
      reviewers: reviewerRows,
      deliveries: deliveryRows.filter((delivery) => !delivery.person_id),
    };
  }

  return {
    event,
    people: peopleRows,
    groups,
    shared,
    sync: {
      recent_failure_count: saveFailures.length,
      recent_failures: saveFailures.map((failure) => ({
        actor_type: failure.actor_type,
        actor_id: failure.actor_id,
        at: failure.occurred_at,
        error: failure.error_message,
      })),
    },
  };
}
