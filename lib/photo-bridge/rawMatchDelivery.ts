import {
  normalizePhotoToolFileKey,
  normalizePhotoToolSelectionKey,
} from "@/lib/photo-bridge/toolLinkage";

export type RawMatchCriteriaSource = "rating" | "color" | "both";

export type RawMatchCriteria = {
  source: RawMatchCriteriaSource;
  minRating: 1 | 2 | 3 | 4 | 5;
  colorLabels: Array<6 | 7 | 8 | 9>;
};

export const DEFAULT_RAW_MATCH_CRITERIA: RawMatchCriteria = {
  source: "rating",
  minRating: 1,
  colorLabels: [6, 7, 8, 9],
};

/** RAW 매칭 진행률을 0~100 정수로 제한한다. */
export function rawMatchProgressPercent(current: number, total: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
}

export function normalizeRawMatchCriteria(value: unknown): RawMatchCriteria {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_RAW_MATCH_CRITERIA };
  const record = value as Record<string, unknown>;
  const source: RawMatchCriteriaSource = record.source === "color" || record.source === "both"
    ? record.source
    : "rating";
  const minRating = Number.isInteger(record.minRating) && Number(record.minRating) >= 1 && Number(record.minRating) <= 5
    ? Number(record.minRating) as RawMatchCriteria["minRating"]
    : 1;
  const colorLabels = Array.isArray(record.colorLabels)
    ? [...new Set(record.colorLabels.filter((label): label is 6 | 7 | 8 | 9 => label === 6 || label === 7 || label === 8 || label === 9))]
    : [...DEFAULT_RAW_MATCH_CRITERIA.colorLabels];
  return { source, minRating, colorLabels };
}

function normalizedNumberMap(input: Readonly<Record<string, number | null | undefined>>) {
  const exact: Record<string, number> = {};
  const legacy: Record<string, number> = {};
  for (const [name, value] of Object.entries(input)) {
    const key = normalizePhotoToolSelectionKey(name);
    if (!key || typeof value !== "number" || !Number.isFinite(value)) continue;
    if (/[\\/]/u.test(name)) exact[key] = value;
    else legacy[normalizePhotoToolFileKey(name)] = value;
  }
  return { exact, legacy };
}

/** 브릿지에서 전달된 사진 중 현재 RAW 매칭 기준에 맞는 상대경로 식별자를 돌려준다. */
export function resolveRawMatchTargets(input: {
  names: readonly string[];
  ratingsByName: Readonly<Record<string, number | null | undefined>>;
  colorsByName: Readonly<Record<string, number | null | undefined>>;
  criteria: RawMatchCriteria;
}): Set<string> {
  const criteria = normalizeRawMatchCriteria(input.criteria);
  const ratings = normalizedNumberMap(input.ratingsByName);
  const colors = normalizedNumberMap(input.colorsByName);
  const enabledColors = new Set(criteria.colorLabels);
  const targets = new Set<string>();

  for (const name of input.names) {
    const key = normalizePhotoToolSelectionKey(name);
    const basename = normalizePhotoToolFileKey(name);
    if (!key || !basename) continue;
    const rating = ratings.exact[key] ?? ratings.legacy[basename] ?? 0;
    const color = colors.exact[key] ?? colors.legacy[basename] ?? 0;
    const ratingMatch = rating >= criteria.minRating;
    const colorMatch = enabledColors.has(color as 6 | 7 | 8 | 9);
    if (
      (criteria.source === "rating" && ratingMatch)
      || (criteria.source === "color" && colorMatch)
      || (criteria.source === "both" && (ratingMatch || colorMatch))
    ) targets.add(key);
  }
  return targets;
}

export function isDeliveredRoundFolder(name: string): boolean {
  return /^\d+차보정본$/u.test(name.normalize("NFC"));
}

/** 상대경로 어느 단계에든 N차보정본 폴더가 있으면 기존 전달본으로 본다. */
export function isInsideDeliveredRoundFolder(relativePath: string): boolean {
  return relativePath
    .normalize("NFC")
    .split(/[\\/]+/u)
    .some(isDeliveredRoundFolder);
}

export function nextDeliveredRoundFolderName(folderNames: Iterable<string>): string {
  let maxRound = 0;
  for (const name of folderNames) {
    const match = /^(\d+)차보정본$/u.exec(name.normalize("NFC"));
    if (match) maxRound = Math.max(maxRound, Number(match[1]));
  }
  return `${maxRound + 1}차보정본`;
}

export type DeliveredMoveCandidate = {
  name: string;
  directoryKey: string;
};

export type DeliveredMovePlanItem = DeliveredMoveCandidate & {
  kind: "jpg" | "xmp";
  basename: string;
};

/** RAW 복사가 성공한 JPG와, 같은 원본 폴더에 있는 동일 basename XMP만 이동 계획에 넣는다. */
export function buildDeliveredJpgMovePlan(input: {
  rawMatchedNames: Iterable<string>;
  jpgs: readonly DeliveredMoveCandidate[];
  sidecars: readonly DeliveredMoveCandidate[];
}): DeliveredMovePlanItem[] {
  const matched = new Set(Array.from(input.rawMatchedNames, normalizePhotoToolFileKey).filter(Boolean));
  const jpgs = input.jpgs.flatMap((file) => {
    const basename = normalizePhotoToolFileKey(file.name);
    return matched.has(basename) ? [{ ...file, kind: "jpg" as const, basename }] : [];
  });
  const sourceKeys = new Set(jpgs.map((file) => `${file.directoryKey}\0${file.basename}`));
  const sidecars = input.sidecars.flatMap((file) => {
    if (!/\.xmp$/iu.test(file.name)) return [];
    const basename = normalizePhotoToolFileKey(file.name);
    return sourceKeys.has(`${file.directoryKey}\0${basename}`)
      ? [{ ...file, kind: "xmp" as const, basename }]
      : [];
  });
  return [...jpgs, ...sidecars];
}
