import { isCustomerSelection } from "@/lib/person-select/customerSelection";
import {
  normalizePersonSelectRawMatchSource,
  personSelectRawTargetFromImage,
  uniquePersonSelectRawTargets,
} from "@/lib/person-select/rawMatchMarks";
import type {
  PersonSelectRawImage,
  PersonSelectRawMatchSource,
  PersonSelectRawMatchTargetResult,
} from "@/lib/person-select/rawMatchTypes";

export function resolveIndividualRawMatchTargets(input: {
  source?: PersonSelectRawMatchSource;
  people: readonly { id: string; displayName: string; submittedAt?: string | null }[];
  choices: readonly { personId: string; image: PersonSelectRawImage | null }[];
}): PersonSelectRawMatchTargetResult {
  const source = normalizePersonSelectRawMatchSource(input.source);
  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  const submittedIds = new Set(
    input.people.filter((person) => Boolean(person.submittedAt)).map((person) => person.id),
  );
  const all = input.choices.flatMap((choice) => {
    const person = peopleById.get(choice.personId);
    if (!person || !choice.image) return [];
    return [personSelectRawTargetFromImage(choice.image, person.id, person.displayName)];
  });
  const submitted = uniquePersonSelectRawTargets(all.filter((target) => submittedIds.has(target.ownerId)));
  const targets = source === "current" ? uniquePersonSelectRawTargets(all) : submitted;
  const submittedImageIds = new Set(submitted.map((target) => target.id));
  const submittedSelectedCount = targets.filter((target) => submittedImageIds.has(target.id)).length;
  return {
    targets,
    submittedSelectedCount,
    currentUnsubmittedCount: targets.length - submittedSelectedCount,
  };
}

export function resolveSharedRawMatchTargets(input: {
  source?: PersonSelectRawMatchSource;
  binarySelection?: boolean;
  reviewers: readonly { id: string; displayName: string; active: boolean }[];
  reviewerIds?: readonly string[];
  submittedByReviewer: ReadonlyMap<string, readonly PersonSelectRawImage[]>;
  draftByReviewer: ReadonlyMap<string, readonly PersonSelectRawImage[]>;
}): PersonSelectRawMatchTargetResult & { reviewerIds: string[]; invalidReviewerIds: string[] } {
  const source = normalizePersonSelectRawMatchSource(input.source);
  const activeReviewers = input.reviewers.filter((reviewer) => reviewer.active);
  const activeById = new Map(activeReviewers.map((reviewer) => [reviewer.id, reviewer]));
  const requestedIds = input.reviewerIds?.length
    ? [...new Set(input.reviewerIds)]
    : activeReviewers.map((reviewer) => reviewer.id);
  const invalidReviewerIds = requestedIds.filter((reviewerId) => !activeById.has(reviewerId));
  const reviewers = requestedIds.flatMap((reviewerId) => {
    const reviewer = activeById.get(reviewerId);
    return reviewer ? [reviewer] : [];
  });

  const submittedTargets = uniquePersonSelectRawTargets(reviewers.flatMap((reviewer) => (
    input.submittedByReviewer.get(reviewer.id) ?? []
  ).filter((image) => isCustomerSelection({
    selected: true,
    rating: image.customerRating,
    colorLabel: image.customerColorLabel,
  })).map((image) => personSelectRawTargetFromImage(
    image,
    reviewer.id,
    reviewer.displayName,
    input.binarySelection,
  ))));

  const currentTargets = uniquePersonSelectRawTargets(reviewers.flatMap((reviewer) => {
    const images = input.draftByReviewer.has(reviewer.id)
      ? input.draftByReviewer.get(reviewer.id) ?? []
      : input.submittedByReviewer.get(reviewer.id) ?? [];
    return images
      .filter((image) => isCustomerSelection({
        selected: true,
        rating: image.customerRating,
        colorLabel: image.customerColorLabel,
      }))
      .map((image) => personSelectRawTargetFromImage(
        image,
        reviewer.id,
        reviewer.displayName,
        input.binarySelection,
      ));
  }));

  const targets = source === "current" ? currentTargets : submittedTargets;
  const submittedImageIds = new Set(submittedTargets.map((target) => target.id));
  const submittedSelectedCount = targets.filter((target) => submittedImageIds.has(target.id)).length;
  return {
    targets,
    reviewerIds: reviewers.map((reviewer) => reviewer.id),
    invalidReviewerIds,
    submittedSelectedCount,
    currentUnsubmittedCount: targets.length - submittedSelectedCount,
  };
}
