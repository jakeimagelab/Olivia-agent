export type StudioLightingStatus = "normal" | "etc_dark" | "etc_black" | "etc_test";
export type StudioPoseType = "Standing" | "Sitting" | "Unknown";
export type StudioInnerWear = "셔츠" | "넥타이셔츠" | "스크럽" | "블라우스" | "탑" | "기타";
export type LightingSensitivity = "loose" | "medium" | "strict";

export interface StudioOptions {
  lightingSensitivity: LightingSensitivity;
}

export interface PersonFeatures {
  gender: "male" | "female" | "unknown";
  ageBand: "20s" | "30s" | "40s" | "50s" | "60s+" | "unknown";
  hairColor: "black" | "brown" | "blonde" | "white_gray" | "other" | "unknown";
  hairLength: "short" | "medium" | "long" | "bald" | "unknown";
  hasGlasses: boolean;
  hasBeard: boolean;
  faceShape: "oval" | "round" | "square" | "heart" | "unknown";
}

export interface StudioPhotoFile {
  name: string;
  basename: string;
  handle: FileSystemFileHandle;
  mtime: number;
  thumbUrl: string | null;
  brightness: number | null;
  fileSize: number;
  lightingStatus: StudioLightingStatus;
  hasGown: boolean;
  innerWear: StudioInnerWear;
  clothingLabel: string;
  poseType: StudioPoseType;
  isFamilyProfile: boolean;
  confidence: number;
  analyzed: boolean;
  groupKey: string;
  personFeatures?: PersonFeatures;
}

export interface StudioGroup {
  key: string;
  clothingLabel: string;
  poseType: StudioPoseType;
  isFamilyProfile: boolean;
  files: StudioPhotoFile[];
  suggestedFolderName: string;
  editedFolderName: string;
  index: number;
  isEtc: boolean;
}

export interface StudioStats {
  totalJpg: number;
  totalRaw: number;
  totalGroups: number;
  totalEtc: number;
  totalNormal: number;
}

export type StudioSubMode = "concept" | "group";
export type StudioGroupSortMode = "gap" | "gap_ai" | "ai";

export interface PersonGroup {
  id: string;
  label: string;
  features: PersonFeatures;
  sampleThumb: string;
  files: StudioPhotoFile[];
  suggestedFolderName: string;
  editedFolderName: string;
  index: number;
  isEtc: boolean;
}

export const STUDIO_LIGHTING_SENSITIVITY: Record<LightingSensitivity, string> = {
  loose: "느슨함 — 거의 시꺼먼 컷만 ETC",
  medium: "보통 — 얼굴이 명확히 어두운 컷 ETC (권장)",
  strict: "강함 — 얼굴 밝기가 조금만 낮아도 ETC",
};

const PERSON_FEATURE_LABELS: Record<string, string> = {
  male: "남성",
  female: "여성",
  "20s": "20대",
  "30s": "30대",
  "40s": "40대",
  "50s": "50대",
  "60s+": "60대+",
  black: "검정",
  brown: "갈색",
  blonde: "금발",
  white_gray: "흰/회색",
  other: "기타",
  short: "단발",
  medium: "중간",
  long: "장발",
  bald: "민머리",
};

const BLANK_PERSON_FEATURES: PersonFeatures = {
  gender: "unknown",
  ageBand: "unknown",
  hairColor: "unknown",
  hairLength: "unknown",
  hasGlasses: false,
  hasBeard: false,
  faceShape: "unknown",
};

export function buildPersonFeatureTags(
  features: PersonFeatures,
  options: { includeHairLength?: boolean } = {},
) {
  const tags: string[] = [];
  if (features.gender !== "unknown") tags.push(PERSON_FEATURE_LABELS[features.gender]);
  if (features.ageBand !== "unknown") tags.push(PERSON_FEATURE_LABELS[features.ageBand]);
  if (features.hairColor !== "unknown") tags.push(`${PERSON_FEATURE_LABELS[features.hairColor]}머리`);
  if (options.includeHairLength && features.hairLength !== "unknown") {
    tags.push(PERSON_FEATURE_LABELS[features.hairLength]);
  }
  if (features.hasGlasses) tags.push("안경");
  return tags;
}

export function calculateStudioEtcSizeThreshold(files: StudioPhotoFile[]) {
  const sizes = files.map((file) => file.fileSize).sort((first, second) => first - second);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0;
  return median * 0.35;
}

export function groupStudioPhotosByTimeGap(
  files: StudioPhotoFile[],
  gapMinutes: number,
  options: { markAnalyzed?: boolean } = {},
) {
  const etcThreshold = calculateStudioEtcSizeThreshold(files);
  const gapMs = gapMinutes * 60 * 1000;
  let personCount = 0;
  return files.map((file, index) => {
    if (index === 0 || file.mtime - files[index - 1].mtime > gapMs) personCount += 1;
    const isSizeEtc = file.fileSize < etcThreshold;
    return {
      ...file,
      analyzed: options.markAnalyzed ?? file.analyzed,
      groupKey: isSizeEtc ? "__ETC__" : `person_${personCount}`,
      lightingStatus: (isSizeEtc ? "etc_dark" : "normal") as StudioLightingStatus,
    };
  });
}

export function normalizePersonFeatures(input: Record<string, unknown>): PersonFeatures {
  const genders = ["male", "female"];
  const ageBands = ["20s", "30s", "40s", "50s", "60s+"];
  const hairColors = ["black", "brown", "blonde", "white_gray", "other"];
  const hairLengths = ["short", "medium", "long", "bald"];
  const faceShapes = ["oval", "round", "square", "heart"];
  return {
    gender: genders.includes(String(input.gender)) ? input.gender as PersonFeatures["gender"] : "unknown",
    ageBand: ageBands.includes(String(input.ageBand)) ? input.ageBand as PersonFeatures["ageBand"] : "unknown",
    hairColor: hairColors.includes(String(input.hairColor)) ? input.hairColor as PersonFeatures["hairColor"] : "unknown",
    hairLength: hairLengths.includes(String(input.hairLength)) ? input.hairLength as PersonFeatures["hairLength"] : "unknown",
    hasGlasses: input.hasGlasses === true,
    hasBeard: input.hasBeard === true,
    faceShape: faceShapes.includes(String(input.faceShape)) ? input.faceShape as PersonFeatures["faceShape"] : "unknown",
  };
}

export function assignStudioPersonGroups(files: StudioPhotoFile[], minimumScore = 0.62) {
  const knownPersons: Array<{ id: string; features: PersonFeatures; scoreSum: number; count: number }> = [];
  let personCount = 0;
  return files.map((file) => {
    if (file.groupKey === "__ETC__") return file;
    if (!file.personFeatures) return { ...file, groupKey: "__ETC__" };

    let bestScore = 0;
    let bestId: string | null = null;
    let bestIndex = -1;
    knownPersons.forEach((person, index) => {
      const score = personMatchScore(file.personFeatures!, person.features);
      if (score > bestScore) {
        bestScore = score;
        bestId = person.id;
        bestIndex = index;
      }
    });
    if (bestScore >= minimumScore && bestId !== null) {
      const person = knownPersons[bestIndex];
      person.scoreSum += bestScore;
      person.count += 1;
      return { ...file, groupKey: bestId };
    }

    personCount += 1;
    const id = `person_${personCount}`;
    knownPersons.push({ id, features: file.personFeatures, scoreSum: 1, count: 1 });
    return { ...file, groupKey: id };
  });
}

export function computeClothingLabel(
  hasGown: boolean,
  innerWear: StudioInnerWear,
  isFamilyProfile: boolean,
) {
  if (isFamilyProfile) return "가족프로필";
  return hasGown ? `가운+${innerWear}` : innerWear;
}

export function computeGroupKey(
  hasGown: boolean,
  innerWear: StudioInnerWear,
  poseType: StudioPoseType,
  isFamilyProfile: boolean,
) {
  if (isFamilyProfile) return `가족프로필_${poseType}`;
  return `${hasGown ? "가운" : "노가운"}_${innerWear}_${poseType}`;
}

export function createStudioFolderName(
  index: number,
  clothingLabel: string,
  poseType: StudioPoseType,
  isFamilyProfile: boolean,
) {
  const prefix = String(index).padStart(2, "0");
  const type = isFamilyProfile ? "가족프로필" : "프로필";
  const clean = clothingLabel.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, "");
  return poseType === "Unknown" ? `${prefix}_${type}_${clean}` : `${prefix}_${type}_${clean}_${poseType}`;
}

export function buildStudioGroups(files: StudioPhotoFile[]) {
  const etcFiles = files.filter((file) => file.groupKey === "__ETC__");
  const normalFiles = files.filter((file) => file.groupKey !== "__ETC__");
  const groupMap = new Map<string, StudioPhotoFile[]>();
  const keyOrder: string[] = [];
  for (const file of normalFiles) {
    if (!groupMap.has(file.groupKey)) {
      groupMap.set(file.groupKey, []);
      keyOrder.push(file.groupKey);
    }
    groupMap.get(file.groupKey)?.push(file);
  }
  const groups: StudioGroup[] = [];
  let index = 1;
  for (const key of keyOrder) {
    const groupFiles = groupMap.get(key);
    const first = groupFiles?.[0];
    if (!groupFiles || !first) continue;
    const isFamily = groupFiles.some((file) => file.isFamilyProfile);
    const folderName = createStudioFolderName(index, first.clothingLabel, first.poseType, isFamily);
    groups.push({
      key,
      clothingLabel: first.clothingLabel,
      poseType: first.poseType,
      isFamilyProfile: isFamily,
      files: groupFiles,
      suggestedFolderName: folderName,
      editedFolderName: folderName,
      index,
      isEtc: false,
    });
    index += 1;
  }
  if (etcFiles.length > 0) {
    groups.unshift({
      key: "__ETC__",
      clothingLabel: "조명불량",
      poseType: "Unknown",
      isFamilyProfile: false,
      files: etcFiles,
      suggestedFolderName: "00_ETC_조명불량",
      editedFolderName: "00_ETC_조명불량",
      index: 0,
      isEtc: true,
    });
  }
  return groups;
}

export function personMatchScore(a: PersonFeatures, b: PersonFeatures) {
  if (a.gender !== "unknown" && b.gender !== "unknown" && a.gender !== b.gender) return 0;
  let score = (a.gender === "unknown" || b.gender === "unknown") ? 0.15 : 0.35;

  if (a.hasGlasses !== b.hasGlasses) return 0;
  score += 0.20;

  const ageBands = ["20s", "30s", "40s", "50s", "60s+", "unknown"];
  const ageDiff = Math.abs(ageBands.indexOf(a.ageBand) - ageBands.indexOf(b.ageBand));
  if (a.ageBand === "unknown" || b.ageBand === "unknown") score += 0.08;
  else if (ageDiff === 0) score += 0.18;
  else if (ageDiff === 1) score += 0.09;
  else return 0;

  if (a.hairColor !== "unknown" && b.hairColor !== "unknown") {
    if (a.hairColor === b.hairColor) score += 0.13;
    else {
      const closeColors: Record<string, string[]> = {
        black: ["brown"],
        brown: ["black", "blonde"],
        blonde: ["brown"],
        white_gray: [],
        other: [],
      };
      if ((closeColors[a.hairColor] ?? []).includes(b.hairColor)) score += 0.06;
      else score -= 0.08;
    }
  } else {
    score += 0.05;
  }

  const hairLengths = ["bald", "short", "medium", "long", "unknown"];
  const hairDiff = Math.abs(hairLengths.indexOf(a.hairLength) - hairLengths.indexOf(b.hairLength));
  if (a.hairLength === "unknown" || b.hairLength === "unknown") score += 0.03;
  else if (hairDiff === 0) score += 0.08;
  else if (hairDiff === 1) score += 0.03;
  else score -= 0.05;

  score += a.hasBeard === b.hasBeard ? 0.04 : -0.04;
  if (a.faceShape !== "unknown" && b.faceShape !== "unknown") {
    score += a.faceShape === b.faceShape ? 0.02 : -0.01;
  }
  return score;
}

export function buildPersonGroups(files: StudioPhotoFile[]) {
  const etcFiles = files.filter((file) => file.groupKey === "__ETC__");
  const normalFiles = files.filter((file) => file.groupKey !== "__ETC__" && file.groupKey !== "PENDING");
  const keyOrder: string[] = [];
  const groupMap = new Map<string, StudioPhotoFile[]>();
  for (const file of normalFiles) {
    if (!groupMap.has(file.groupKey)) {
      groupMap.set(file.groupKey, []);
      keyOrder.push(file.groupKey);
    }
    groupMap.get(file.groupKey)?.push(file);
  }
  const groups: PersonGroup[] = [];
  let index = 1;
  for (const key of keyOrder) {
    const groupFiles = groupMap.get(key);
    const first = groupFiles?.[0];
    if (!groupFiles || !first) continue;
    const folderName = `${String(index).padStart(2, "0")}_인물${index}`;
    groups.push({
      id: key,
      label: `인물 ${index}`,
      features: first.personFeatures ?? BLANK_PERSON_FEATURES,
      sampleThumb: first.thumbUrl ?? "",
      files: groupFiles,
      suggestedFolderName: folderName,
      editedFolderName: folderName,
      index,
      isEtc: false,
    });
    index += 1;
  }
  if (etcFiles.length > 0) {
    groups.unshift({
      id: "__ETC__",
      label: "조명불량",
      features: BLANK_PERSON_FEATURES,
      sampleThumb: etcFiles[0]?.thumbUrl ?? "",
      files: etcFiles,
      suggestedFolderName: "00_ETC_조명불량",
      editedFolderName: "00_ETC_조명불량",
      index: 0,
      isEtc: true,
    });
  }
  return groups;
}
