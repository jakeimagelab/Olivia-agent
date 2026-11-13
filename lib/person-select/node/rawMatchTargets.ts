import type { getSupabaseAdmin } from "@/lib/supabase";
import {
  resolveIndividualRawMatchTargets,
  resolveSharedRawMatchTargets,
  type PersonSelectRawImage,
  type PersonSelectRawMatchSource,
} from "@/lib/person-select/rawMatch";
import { fetchAllRowsByIdChunks } from "@/lib/person-select/rawMatchPaging";

type RawMatchDb = ReturnType<typeof getSupabaseAdmin>;

type ChoiceRow = {
  person_id: string;
  image_id: string;
  updated_at?: string | null;
  person_select_images: {
    id: string;
    original_file_name: string;
    source_rel_path: string;
  } | null;
};

type SharedDraftItem = {
  image_id?: string;
  customer_rating?: number | null;
  customer_color_label?: number | null;
};

type SharedDraftRow = {
  reviewer_id: string;
  updated_at?: string | null;
  items: SharedDraftItem[] | null;
};

type SharedSelectionRow = {
  id: string;
  reviewer_id: string;
  submitted_at?: string | null;
};

type SharedSelectionItemRow = {
  selection_id: string;
  image_id: string;
  customer_rating?: number | null;
  customer_color_label?: number | null;
};

type SharedImageRow = {
  id: string;
  original_file_name: string;
  source_rel_path: string;
};

function imageRow(
  value: SharedImageRow,
  marks: Partial<PersonSelectRawImage> = {},
): PersonSelectRawImage {
  return {
    id: value.id,
    originalFileName: value.original_file_name,
    sourceRelPath: value.source_rel_path,
    ...marks,
  };
}

export async function loadPersonSelectRawMatchTargets(input: {
  db: RawMatchDb;
  eventId: string;
  accessMode: string;
  binarySelection?: boolean;
  source: PersonSelectRawMatchSource;
  reviewerIds?: string[];
}) {
  if (input.accessMode !== "project_shared") {
    const [
      { data: people, error: peopleError },
      { data: choices, error: choiceError },
    ] = await Promise.all([
      input.db
        .from("person_select_people")
        .select("id,display_name,submitted_at")
        .eq("event_id", input.eventId),
      input.db
        .from("person_select_choices")
        .select("person_id,image_id,updated_at,person_select_images(id,original_file_name,source_rel_path)")
        .eq("event_id", input.eventId),
    ]);
    if (peopleError) throw peopleError;
    if (choiceError) throw choiceError;
    const result = resolveIndividualRawMatchTargets({
      source: input.source,
      people: (people ?? []).map((person) => ({
        id: person.id,
        displayName: person.display_name,
        submittedAt: person.submitted_at,
      })),
      choices: ((choices ?? []) as unknown as ChoiceRow[]).map((choice) => ({
        personId: choice.person_id,
        image: choice.person_select_images
          ? imageRow(choice.person_select_images, { markSavedAt: choice.updated_at ?? null })
          : null,
      })),
    });
    return {
      ...result,
      reviewerIds: [] as string[],
      submittedPeople: (people ?? []).filter((person) => Boolean(person.submitted_at)).length,
      notSubmitted: (people ?? [])
        .filter((person) => !person.submitted_at)
        .map((person) => String(person.display_name)),
    };
  }

  const [
    { data: reviewers, error: reviewersError },
    { data: drafts, error: draftsError },
    { data: selections, error: selectionsError },
  ] = await Promise.all([
    input.db
      .from("person_select_shared_reviewers")
      .select("id,display_name,active")
      .eq("event_id", input.eventId),
    input.db
      .from("person_select_shared_drafts")
      .select("reviewer_id,updated_at,items")
      .eq("event_id", input.eventId),
    input.db
      .from("person_select_shared_selections")
      .select("id,reviewer_id,submitted_at")
      .eq("event_id", input.eventId)
      .order("submitted_at", { ascending: false }),
  ]);
  if (reviewersError) throw reviewersError;
  if (draftsError) throw draftsError;
  if (selectionsError) throw selectionsError;

  const latestSelectionByReviewer = new Map<string, SharedSelectionRow>();
  for (const selection of (selections ?? []) as SharedSelectionRow[]) {
    if (!latestSelectionByReviewer.has(selection.reviewer_id)) {
      latestSelectionByReviewer.set(selection.reviewer_id, selection);
    }
  }
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
  for (const draft of (drafts ?? []) as SharedDraftRow[]) {
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
  const imageById = new Map(images.map((image) => [image.id, imageRow(image)]));

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
  for (const draft of (drafts ?? []) as SharedDraftRow[]) {
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
    reviewers: (reviewers ?? []).map((reviewer) => ({
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
