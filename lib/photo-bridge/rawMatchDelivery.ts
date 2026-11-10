import { normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";

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
  const output: Record<string, number> = {};
  for (const [name, value] of Object.entries(input)) {
    const key = normalizePhotoToolFileKey(name);
    if (key && typeof value === "number" && Number.isFinite(value)) output[key] = value;
  }
  return output;
}

/** 브릿지에서 전달된 파일명 중 현재 RAW 매칭 기준에 맞는 basename만 돌려준다. */
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
    const key = normalizePhotoToolFileKey(name);
    if (!key) continue;
    const ratingMatch = (ratings[key] ?? 0) >= criteria.minRating;
    const colorMatch = enabledColors.has(colors[key] as 6 | 7 | 8 | 9);
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

function isNotFoundError(error: unknown) {
  return error instanceof DOMException && error.name === "NotFoundError";
}

/** 덮어쓰기 없이 복사본 크기를 확인한 뒤에만 원본을 지운다. */
export async function moveFileWithSizeVerification(input: {
  sourceHandle: FileSystemFileHandle;
  sourceDirectory: FileSystemDirectoryHandle;
  destinationDirectory: FileSystemDirectoryHandle;
  name: string;
}): Promise<{ status: "moved" | "destination_exists"; size: number }> {
  try {
    await input.destinationDirectory.getFileHandle(input.name);
    return { status: "destination_exists", size: 0 };
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  const source = await input.sourceHandle.getFile();
  const destinationHandle = await input.destinationDirectory.getFileHandle(input.name, { create: true });
  try {
    const writable = await destinationHandle.createWritable();
    await source.stream().pipeTo(writable);
    const copied = await destinationHandle.getFile();
    if (copied.size !== source.size) throw new Error(`복사본 크기가 다릅니다 (${copied.size}/${source.size})`);
    try {
      await input.sourceDirectory.removeEntry(input.name);
    } catch (error) {
      await input.destinationDirectory.removeEntry(input.name).catch(() => undefined);
      throw error;
    }
    return { status: "moved", size: source.size };
  } catch (error) {
    await input.destinationDirectory.removeEntry(input.name).catch(() => undefined);
    throw error;
  }
}
