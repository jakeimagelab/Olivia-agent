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

export type PersonSelectRawMatchPathPlan = {
  sourcePath: string;
  shootingPath: string;
  outputPath: string;
  derivedFromJpgFolder: boolean;
};

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
