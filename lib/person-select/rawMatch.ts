export type PersonSelectRawMatchSource = "submitted" | "current";

export const PERSON_SELECT_RAW_OUTPUT_FOLDER = "Selected_RAW";

const PERSON_SELECT_JPG_ROOT_NAMES = new Set(["jpg", "jpg원본", "jpg전체"]);

export type PersonSelectRawMatchPathPlan = {
  sourcePath: string;
  shootingPath: string;
  outputPath: string;
  derivedFromJpgFolder: boolean;
};

function normalizedPathSegments(value: string) {
  return value.replace(/\\/g, "/").split("/").filter(Boolean);
}

function joinLikeSource(source: string, segments: readonly string[]) {
  return `${source.trim().startsWith("/") ? "/" : ""}${segments.join("/")}`;
}

/**
 * 사진선택에 저장된 JPG 폴더와 RAW를 찾을 촬영 폴더를 분리한다.
 * 실제 폴더 철자(NFD 포함)는 보존하고, 알려진 JPG 폴더 비교에만 NFC를 사용한다.
 */
export function resolvePersonSelectRawMatchPathPlan(
  sourcePath: string,
  ownerFolder = "<이름>",
): PersonSelectRawMatchPathPlan {
  const source = sourcePath.trim().replace(/\\/g, "/").replace(/\/$/, "");
  const segments = normalizedPathSegments(source);
  const rootOffset = /^root-\d+$/u.test(segments[0] ?? "") ? 1 : 0;
  const jpgRootIndex = segments.findIndex((segment, index) => (
    index >= rootOffset && PERSON_SELECT_JPG_ROOT_NAMES.has(segment.normalize("NFC").toLocaleLowerCase("ko-KR"))
  ));
  const canUseParent = jpgRootIndex > rootOffset;
  const shootingSegments = canUseParent ? segments.slice(0, jpgRootIndex) : segments;
  const shootingPath = joinLikeSource(source, shootingSegments);
  return {
    sourcePath: source,
    shootingPath,
    outputPath: [shootingPath, PERSON_SELECT_RAW_OUTPUT_FOLDER, ownerFolder].filter(Boolean).join("/"),
    derivedFromJpgFolder: canUseParent,
  };
}

export type PersonSelectRawImage = {
  id: string;
  originalFileName: string;
  sourceRelPath: string;
};

export type PersonSelectRawMatchTarget = PersonSelectRawImage & {
  ownerId: string;
  ownerName: string;
};

export type PersonSelectRawMatchTargetResult = {
  targets: PersonSelectRawMatchTarget[];
  submittedSelectedCount: number;
  currentUnsubmittedCount: number;
};

export function normalizePersonSelectRawMatchSource(value: unknown): PersonSelectRawMatchSource {
  return value === "current" ? "current" : "submitted";
}

function uniqueTargets(values: readonly PersonSelectRawMatchTarget[]): PersonSelectRawMatchTarget[] {
  const byImageId = new Map<string, PersonSelectRawMatchTarget>();
  for (const value of values) {
    if (!value.id || byImageId.has(value.id)) continue;
    byImageId.set(value.id, value);
  }
  return [...byImageId.values()];
}

export function resolveIndividualRawMatchTargets(input: {
  source?: PersonSelectRawMatchSource;
  people: readonly { id: string; displayName: string; submittedAt?: string | null }[];
  choices: readonly { personId: string; image: PersonSelectRawImage | null }[];
}): PersonSelectRawMatchTargetResult {
  const source = normalizePersonSelectRawMatchSource(input.source);
  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  const submittedIds = new Set(input.people.filter((person) => Boolean(person.submittedAt)).map((person) => person.id));
  const all = input.choices.flatMap((choice) => {
    const person = peopleById.get(choice.personId);
    if (!person || !choice.image) return [];
    return [{ ...choice.image, ownerId: person.id, ownerName: person.displayName }];
  });
  const submitted = uniqueTargets(all.filter((target) => submittedIds.has(target.ownerId)));
  const targets = source === "current" ? uniqueTargets(all) : submitted;
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
  reviewers: readonly { id: string; displayName: string; active: boolean }[];
  reviewerIds?: readonly string[];
  submittedByReviewer: ReadonlyMap<string, readonly PersonSelectRawImage[]>;
  draftByReviewer: ReadonlyMap<string, readonly PersonSelectRawImage[]>;
}): PersonSelectRawMatchTargetResult & { reviewerIds: string[]; invalidReviewerIds: string[] } {
  const source = normalizePersonSelectRawMatchSource(input.source);
  const activeReviewers = input.reviewers.filter((reviewer) => reviewer.active);
  const activeById = new Map(activeReviewers.map((reviewer) => [reviewer.id, reviewer]));
  const requestedIds = input.reviewerIds?.length ? [...new Set(input.reviewerIds)] : activeReviewers.map((reviewer) => reviewer.id);
  const invalidReviewerIds = requestedIds.filter((reviewerId) => !activeById.has(reviewerId));
  const reviewers = requestedIds.flatMap((reviewerId) => {
    const reviewer = activeById.get(reviewerId);
    return reviewer ? [reviewer] : [];
  });

  const submittedTargets = uniqueTargets(reviewers.flatMap((reviewer) => (
    input.submittedByReviewer.get(reviewer.id) ?? []
  ).map((image) => ({ ...image, ownerId: reviewer.id, ownerName: reviewer.displayName }))));

  const currentTargets = uniqueTargets(reviewers.flatMap((reviewer) => {
    const images = input.draftByReviewer.has(reviewer.id)
      ? input.draftByReviewer.get(reviewer.id) ?? []
      : input.submittedByReviewer.get(reviewer.id) ?? [];
    return images.map((image) => ({ ...image, ownerId: reviewer.id, ownerName: reviewer.displayName }));
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
