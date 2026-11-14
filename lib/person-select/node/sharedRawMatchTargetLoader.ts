import {
  resolveSharedRawMatchTargets,
  type PersonSelectRawImage,
} from "@/lib/person-select/rawMatch";
import { fetchAllRowsByIdChunks } from "@/lib/person-select/rawMatchPaging";
import {
  rawMatchImageRow,
  type LoadRawMatchTargetsInput,
  type ReviewerRow,
  type SharedDraftRow,
  type SharedImageRow,
  type SharedSelectionItemRow,
  type SharedSelectionRow,
} from "@/lib/person-select/node/rawMatchTargetRows";
import { readAllPersonSelectRows } from "@/lib/person-select/paging";

function latestSelectionRowsByReviewer(selections: readonly SharedSelectionRow[]) {
  const latest = new Map<string, SharedSelectionRow>();
  for (const selection of selections) {
    if (!latest.has(selection.reviewer_id)) latest.set(selection.reviewer_id, selection);
  }
  return latest;
}

export async function loadSharedRawMatchTargets(input: LoadRawMatchTargetsInput) {
  const [reviewers, drafts, selections] = await Promise.all([
    readAllPersonSelectRows<ReviewerRow>((from, to) => input.db
      .from("person_select_shared_reviewers")
      .select("id,display_name,active")
      .eq("event_id", input.eventId)
      .order("id")
      .range(from, to)),
    readAllPersonSelectRows<SharedDraftRow>((from, to) => input.db
      .from("person_select_shared_drafts")
      .select("reviewer_id,updated_at,items")
      .eq("event_id", input.eventId)
      .order("reviewer_id")
      .range(from, to) as unknown as PromiseLike<{ data: SharedDraftRow[] | null; error: { message?: string } | null }>),
    readAllPersonSelectRows<SharedSelectionRow>((from, to) => input.db
      .from("person_select_shared_selections")
      .select("id,reviewer_id,submitted_at")
      .eq("event_id", input.eventId)
      .order("submitted_at", { ascending: false })
      .order("id")
      .range(from, to)),
  ]);

  const latestSelectionByReviewer = latestSelectionRowsByReviewer(selections);
  const selectionIds = [...latestSelectionByReviewer.values()].map((selection) => selection.id);
  const selectionItems = selectionIds.length
    ? await fetchAllRowsByIdChunks<SharedSelectionItemRow>(selectionIds, (ids, from, to) => input.db
      .from("person_select_shared_selection_items")
      .select("selection_id,image_id,customer_rating,customer_color_label")
      .in("selection_id", [...ids])
      .order("id")
      .range(from, to))
    : [];

  const allImageIds = new Set<string>();
  for (const draft of drafts) {
    for (const item of Array.isArray(draft.items) ? draft.items : []) {
      if (item.image_id) allImageIds.add(item.image_id);
    }
  }
  for (const item of selectionItems) allImageIds.add(item.image_id);
  const images = allImageIds.size
    ? await fetchAllRowsByIdChunks<SharedImageRow>([...allImageIds], (ids, from, to) => input.db
      .from("person_select_images")
      .select("id,original_file_name,source_rel_path")
      .eq("event_id", input.eventId)
      .in("id", [...ids])
      .order("id")
      .range(from, to))
    : [];
  const imageById = new Map(images.map((image) => [image.id, rawMatchImageRow(image)]));

  const submittedByReviewer = new Map<string, PersonSelectRawImage[]>();
  for (const [reviewerId, selection] of latestSelectionByReviewer) {
    submittedByReviewer.set(reviewerId, selectionItems
      .filter((item) => item.selection_id === selection.id)
      .flatMap((item) => {
        const image = imageById.get(item.image_id);
        return image ? [{
          ...image,
          customerRating: item.customer_rating ?? null,
          customerColorLabel: item.customer_color_label ?? null,
          markSavedAt: selection.submitted_at ?? null,
        }] : [];
      }));
  }

  const draftByReviewer = new Map<string, PersonSelectRawImage[]>();
  for (const draft of drafts) {
    draftByReviewer.set(draft.reviewer_id, (Array.isArray(draft.items) ? draft.items : [])
      .flatMap((item) => {
        const image = item.image_id ? imageById.get(item.image_id) : null;
        return image ? [{
          ...image,
          customerRating: item.customer_rating ?? null,
          customerColorLabel: item.customer_color_label ?? null,
          markSavedAt: draft.updated_at ?? null,
        }] : [];
      }));
  }

  const result = resolveSharedRawMatchTargets({
    source: input.source,
    binarySelection: input.binarySelection,
    reviewers: reviewers.map((reviewer) => ({
      id: reviewer.id,
      displayName: reviewer.display_name,
      active: reviewer.active !== false,
    })),
    reviewerIds: input.reviewerIds,
    submittedByReviewer,
    draftByReviewer,
  });
  if (result.invalidReviewerIds.length) {
    throw new Error("선택한 검토자가 이 프로젝트에 없거나 접속 중지 상태입니다.");
  }
  return {
    ...result,
    targets: result.targets.map((target) => ({ ...target, ownerName: "프로젝트" })),
    submittedPeople: result.reviewerIds.filter((reviewerId) => submittedByReviewer.has(reviewerId)).length,
    notSubmitted: [] as string[],
  };
}
