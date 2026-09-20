export type PhotoSelectRejectReason = "ok" | "pending" | "blur" | "dark" | "overexposed";

export type PhotoSelectRuleOptions = {
  qualityFilter: boolean;
  blurThreshold: number;
  darkThreshold: number;
  overexpThreshold: number;
  dupRemoval: boolean;
  dupThreshold: number;
};

export const PHOTO_SELECT_DEFAULT_OPTIONS: PhotoSelectRuleOptions = {
  qualityFilter: true,
  blurThreshold: 18,
  darkThreshold: 38,
  overexpThreshold: 230,
  dupRemoval: true,
  dupThreshold: 95,
};

export function photoRejectReason(
  input: { blurScore: number; brightness: number },
  options: Pick<PhotoSelectRuleOptions, "qualityFilter" | "blurThreshold" | "darkThreshold" | "overexpThreshold">,
): PhotoSelectRejectReason {
  if (!options.qualityFilter) return "ok";
  if (input.blurScore < options.blurThreshold) return "blur";
  if (input.brightness < options.darkThreshold) return "dark";
  if (input.brightness > options.overexpThreshold) return "overexposed";
  return "ok";
}

export function photoHashDistance(left: string, right: string): number {
  let distance = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance + Math.abs(left.length - right.length);
}

export type DuplicateCandidate = {
  hash: string | null;
  blurScore: number | null;
  rejectReason: PhotoSelectRejectReason;
  dupGroupId: string | null;
  isDupRep: boolean;
};

/** Browser와 Mac Studio Worker가 공유하는 기존 average-hash 중복 대표컷 규칙. */
export function applyPhotoDuplicates<T extends DuplicateCandidate>(files: T[], thresholdPct: number): T[] {
  const maxDistance = Math.round(64 * (1 - thresholdPct / 100));
  const result = files.map((file) => ({ ...file, dupGroupId: null, isDupRep: false })) as T[];
  let groupId = 0;

  for (let index = 0; index < result.length; index += 1) {
    if (!result[index].hash || result[index].dupGroupId !== null || result[index].rejectReason !== "ok") continue;
    const group = [index];
    for (let candidateIndex = index + 1; candidateIndex < result.length; candidateIndex += 1) {
      if (!result[candidateIndex].hash || result[candidateIndex].dupGroupId !== null || result[candidateIndex].rejectReason !== "ok") continue;
      if (photoHashDistance(result[index].hash!, result[candidateIndex].hash!) <= maxDistance) group.push(candidateIndex);
    }
    if (group.length < 2) continue;
    const name = `g${++groupId}`;
    let representative = group[0];
    for (const candidateIndex of group) {
      if ((result[candidateIndex].blurScore ?? 0) > (result[representative].blurScore ?? 0)) representative = candidateIndex;
    }
    for (const candidateIndex of group) {
      result[candidateIndex].dupGroupId = name;
      result[candidateIndex].isDupRep = candidateIndex === representative;
    }
  }
  return result;
}
