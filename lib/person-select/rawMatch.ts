export type PersonSelectRawMatchSource = "submitted" | "current";
export type PersonSelectRawMatchMode = "copy" | "mark";

export const PERSON_SELECT_RAW_LABEL_NAMES = {
  6: "Select",
  7: "Second",
  8: "Approved",
  9: "Review",
} as const;

export type PersonSelectRawColorLabel = keyof typeof PERSON_SELECT_RAW_LABEL_NAMES;
export type PersonSelectRawLabelNames = Record<PersonSelectRawColorLabel, string>;

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
  customerRating?: number | null;
  customerColorLabel?: number | null;
  markSavedAt?: string | null;
};

export type PersonSelectRawMatchTarget = PersonSelectRawImage & {
  ownerId: string;
  ownerName: string;
  customerRating: number | null;
  customerColorLabel: PersonSelectRawColorLabel | null;
  markSavedAt: string | null;
  markConflict: boolean;
};

export type PersonSelectRawMatchTargetResult = {
  targets: PersonSelectRawMatchTarget[];
  submittedSelectedCount: number;
  currentUnsubmittedCount: number;
};

export function normalizePersonSelectRawMatchSource(value: unknown): PersonSelectRawMatchSource {
  return value === "current" ? "current" : "submitted";
}

export function normalizePersonSelectRawMatchMode(value: unknown): PersonSelectRawMatchMode {
  return value === "mark" ? "mark" : "copy";
}

export function normalizePersonSelectRawLabelNames(value: unknown): PersonSelectRawLabelNames {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(([6, 7, 8, 9] as const).map((label) => {
    const configured = record[String(label)];
    return [label, typeof configured === "string" && configured.trim()
      ? configured.trim().slice(0, 80)
      : PERSON_SELECT_RAW_LABEL_NAMES[label]];
  })) as PersonSelectRawLabelNames;
}

function validRating(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : null;
}

function validColor(value: unknown): PersonSelectRawColorLabel | null {
  return value === 6 || value === 7 || value === 8 || value === 9 ? value : null;
}

function targetFromImage(image: PersonSelectRawImage, ownerId: string, ownerName: string): PersonSelectRawMatchTarget {
  return {
    ...image,
    ownerId,
    ownerName,
    customerRating: validRating(image.customerRating),
    customerColorLabel: validColor(image.customerColorLabel),
    markSavedAt: image.markSavedAt ?? null,
    markConflict: false,
  };
}

function uniqueTargets(values: readonly PersonSelectRawMatchTarget[]): PersonSelectRawMatchTarget[] {
  const byImageId = new Map<string, PersonSelectRawMatchTarget>();
  for (const value of values) {
    if (!value.id) continue;
    const previous = byImageId.get(value.id);
    if (!previous) {
      byImageId.set(value.id, value);
      continue;
    }
    const ratings = [previous.customerRating, value.customerRating].filter((rating): rating is number => rating !== null);
    const previousColorAt = previous.markSavedAt ? Date.parse(previous.markSavedAt) : 0;
    const nextColorAt = value.markSavedAt ? Date.parse(value.markSavedAt) : 0;
    const colorFromValue = value.customerColorLabel !== null && nextColorAt >= previousColorAt;
    byImageId.set(value.id, {
      ...previous,
      customerRating: ratings.length ? Math.max(...ratings) : null,
      customerColorLabel: colorFromValue ? value.customerColorLabel : previous.customerColorLabel,
      markSavedAt: colorFromValue ? value.markSavedAt : previous.markSavedAt,
      markConflict: previous.markConflict
        || (previous.customerRating !== null && value.customerRating !== null && previous.customerRating !== value.customerRating)
        || (previous.customerColorLabel !== null && value.customerColorLabel !== null && previous.customerColorLabel !== value.customerColorLabel),
    });
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
    return [targetFromImage({ ...choice.image, customerRating: choice.image.customerRating ?? 1 }, person.id, person.displayName)];
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
  ).map((image) => targetFromImage(image, reviewer.id, reviewer.displayName))));

  const currentTargets = uniqueTargets(reviewers.flatMap((reviewer) => {
    const images = input.draftByReviewer.has(reviewer.id)
      ? input.draftByReviewer.get(reviewer.id) ?? []
      : input.submittedByReviewer.get(reviewer.id) ?? [];
    return images.map((image) => targetFromImage(image, reviewer.id, reviewer.displayName));
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
