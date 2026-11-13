import { describe, expect, it } from "vitest";

import {
  assignStudioPersonGroups,
  buildPersonFeatureTags,
  buildPersonGroups,
  buildStudioGroups,
  calculateStudioEtcSizeThreshold,
  computeClothingLabel,
  computeGroupKey,
  createStudioFolderName,
  groupStudioPhotosByTimeGap,
  normalizePersonFeatures,
  personMatchScore,
  type PersonFeatures,
  type StudioPhotoFile,
} from "@/lib/photo-classifier/studioGrouping";

const BASE_FEATURES: PersonFeatures = {
  gender: "female",
  ageBand: "30s",
  hairColor: "black",
  hairLength: "long",
  hasGlasses: false,
  hasBeard: false,
  faceShape: "oval",
};

function makePhoto(name: string, groupKey: string, overrides: Partial<StudioPhotoFile> = {}): StudioPhotoFile {
  return {
    name,
    basename: name.replace(/\.[^.]+$/u, ""),
    handle: {} as FileSystemFileHandle,
    mtime: 0,
    thumbUrl: null,
    brightness: null,
    fileSize: 1,
    lightingStatus: groupKey === "__ETC__" ? "etc_dark" : "normal",
    hasGown: false,
    innerWear: "셔츠",
    clothingLabel: "셔츠",
    poseType: "Standing",
    isFamilyProfile: false,
    confidence: 1,
    analyzed: true,
    groupKey,
    ...overrides,
  };
}

describe("studio photo grouping", () => {
  it("builds the shared person feature tags used by edit and review views", () => {
    expect(buildPersonFeatureTags({
      ...BASE_FEATURES,
      ageBand: "40s",
      hairColor: "brown",
      hasGlasses: true,
    }, { includeHairLength: true })).toEqual(["여성", "40대", "갈색머리", "장발", "안경"]);

    expect(buildPersonFeatureTags({
      ...BASE_FEATURES,
      gender: "unknown",
      ageBand: "unknown",
      hairColor: "unknown",
      hairLength: "unknown",
    })).toEqual([]);
  });

  it("keeps the established clothing and folder naming rules", () => {
    expect(computeClothingLabel(true, "스크럽", false)).toBe("가운+스크럽");
    expect(computeClothingLabel(false, "셔츠", true)).toBe("가족프로필");
    expect(computeGroupKey(false, "셔츠", "Sitting", false)).toBe("노가운_셔츠_Sitting");
    expect(createStudioFolderName(2, "가운 / 셔츠", "Standing", false)).toBe("02_프로필_가운셔츠_Standing");
  });

  it("preserves first-seen group order and places ETC first", () => {
    const groups = buildStudioGroups([
      makePhoto("B.JPG", "group-b", { clothingLabel: "스크럽" }),
      makePhoto("A.JPG", "group-a"),
      makePhoto("D.JPG", "group-b", { clothingLabel: "스크럽" }),
      makePhoto("C.JPG", "__ETC__"),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["__ETC__", "group-b", "group-a"]);
    expect(groups[1]?.files.map((file) => file.name)).toEqual(["B.JPG", "D.JPG"]);
  });

  it("scores matching people and rejects strong identity conflicts", () => {
    expect(personMatchScore(BASE_FEATURES, { ...BASE_FEATURES })).toBeGreaterThanOrEqual(0.62);
    expect(personMatchScore(BASE_FEATURES, { ...BASE_FEATURES, gender: "male" })).toBe(0);
    expect(personMatchScore(BASE_FEATURES, { ...BASE_FEATURES, hasGlasses: true })).toBe(0);
  });

  it("builds person groups while excluding pending files", () => {
    const groups = buildPersonGroups([
      makePhoto("A.JPG", "person-a", { personFeatures: BASE_FEATURES, thumbUrl: "a-thumb" }),
      makePhoto("B.JPG", "PENDING"),
      makePhoto("C.JPG", "__ETC__"),
    ]);

    expect(groups.map((group) => group.id)).toEqual(["__ETC__", "person-a"]);
    expect(groups[1]).toMatchObject({ sampleThumb: "a-thumb", editedFolderName: "01_인물1" });
  });

  it("groups studio photos by time gap and file-size ETC threshold", () => {
    const files = [
      makePhoto("A.JPG", "PENDING", { mtime: 0, fileSize: 100 }),
      makePhoto("B.JPG", "PENDING", { mtime: 30_000, fileSize: 10 }),
      makePhoto("C.JPG", "PENDING", { mtime: 180_000, fileSize: 110 }),
    ];

    expect(calculateStudioEtcSizeThreshold(files)).toBe(35);
    expect(groupStudioPhotosByTimeGap(files, 1, { markAnalyzed: true }).map((file) => ({
      key: file.groupKey,
      status: file.lightingStatus,
      analyzed: file.analyzed,
    }))).toEqual([
      { key: "person_1", status: "normal", analyzed: true },
      { key: "__ETC__", status: "etc_dark", analyzed: true },
      { key: "person_2", status: "normal", analyzed: true },
    ]);
  });

  it("normalizes AI person features and assigns matching identities", () => {
    const features = normalizePersonFeatures({
      gender: "female",
      ageBand: "30s",
      hairColor: "black",
      hairLength: "long",
      hasGlasses: false,
      hasBeard: false,
      faceShape: "oval",
    });
    const grouped = assignStudioPersonGroups([
      makePhoto("A.JPG", "PENDING", { personFeatures: features }),
      makePhoto("B.JPG", "PENDING", { personFeatures: { ...features } }),
      makePhoto("C.JPG", "PENDING", { personFeatures: { ...features, gender: "male" } }),
    ]);

    expect(grouped.map((file) => file.groupKey)).toEqual(["person_1", "person_1", "person_2"]);
    expect(normalizePersonFeatures({ gender: "invalid" }).gender).toBe("unknown");
  });
});
