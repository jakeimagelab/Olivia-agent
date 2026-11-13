import type { PersonSelectAdminData } from "@/lib/person-select/adminData";
import {
  resolveIndividualRawMatchTargets,
  resolveSharedRawMatchTargets,
  type PersonSelectRawMatchSource,
} from "@/lib/person-select/rawMatch";

export function resolvePersonSelectAdminRawMatchModel({
  data,
  isShared,
  source,
  reviewerScope,
}: {
  data: PersonSelectAdminData | null;
  isShared: boolean;
  source: PersonSelectRawMatchSource;
  reviewerScope: string;
}) {
  const sharedReviewers = data?.shared?.reviewers ?? [];
  const sharedImageById = new Map((data?.shared?.images ?? []).map((image) => [image.id, {
    id: image.id,
    originalFileName: image.original_file_name,
    sourceRelPath: image.relative_path ?? image.original_file_name,
  }]));
  const sharedSubmittedByReviewer = new Map(sharedReviewers.map((reviewer) => [
    reviewer.id,
    (reviewer.selection?.items ?? []).flatMap((item) => {
      const image = sharedImageById.get(item.image_id);
      return image ? [{
        ...image,
        customerRating: item.customer_rating ?? null,
        customerColorLabel: item.customer_color_label ?? null,
        markSavedAt: reviewer.selection?.submitted_at ?? null,
      }] : [];
    }),
  ]));
  const sharedDraftByReviewer = new Map(sharedReviewers.flatMap((reviewer) => reviewer.draft ? [[
    reviewer.id,
    reviewer.draft.selectedImageIds.flatMap((imageId) => {
      const image = sharedImageById.get(imageId);
      return image ? [{
        ...image,
        customerRating: reviewer.draft?.ratings?.[imageId] ?? null,
        customerColorLabel: reviewer.draft?.colorLabels?.[imageId] ?? null,
        markSavedAt: reviewer.draft?.updated_at ?? null,
      }] : [];
    }),
  ] as const] : []));
  const sharedRawInput = {
    reviewers: sharedReviewers.map((reviewer) => ({
      id: reviewer.id,
      displayName: reviewer.display_name,
      active: reviewer.active,
    })),
    reviewerIds: reviewerScope === "all" ? undefined : [reviewerScope],
    submittedByReviewer: sharedSubmittedByReviewer,
    draftByReviewer: sharedDraftByReviewer,
  };
  const individualRawInput = {
    people: (data?.people ?? []).map((person) => ({
      id: person.id,
      displayName: person.display_name,
      submittedAt: person.submitted_at,
    })),
    choices: (data?.people ?? []).flatMap((person) => person.choices.map((choice) => ({
      personId: person.id,
      image: choice.person_select_images ? {
        id: choice.image_id,
        originalFileName: choice.person_select_images.original_file_name,
        sourceRelPath: choice.person_select_images.source_rel_path,
      } : null,
    }))),
  };
  const resolveForSource = (targetSource: PersonSelectRawMatchSource, allReviewers = false) => isShared
    ? resolveSharedRawMatchTargets({
        source: targetSource,
        ...sharedRawInput,
        reviewerIds: allReviewers ? undefined : sharedRawInput.reviewerIds,
      })
    : resolveIndividualRawMatchTargets({ source: targetSource, ...individualRawInput });
  const preview = resolveForSource(source);
  const submittedAll = resolveForSource("submitted", true);
  const currentAll = resolveForSource("current", true);

  return {
    preview,
    submittedAll,
    currentAll,
    hasSelection: submittedAll.targets.length > 0 || currentAll.targets.length > 0,
  };
}
