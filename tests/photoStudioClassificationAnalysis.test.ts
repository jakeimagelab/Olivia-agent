import { describe, expect, it } from "vitest";
import {
  analyzeStudioConcepts,
  analyzeStudioGapLighting,
  analyzeStudioPeople,
  groupStudioFilesByGap,
} from "@/lib/photo-classifier/studioClassificationAnalysis";
import type { StudioPhotoFile } from "@/lib/photo-classifier/studioGrouping";

function photo(name: string, mtime: number): StudioPhotoFile {
  return {
    name,
    basename: name.replace(/\.[^.]+$/u, ""),
    handle: {} as FileSystemFileHandle,
    mtime,
    thumbUrl: null,
    brightness: 120,
    fileSize: 1_000,
    lightingStatus: "normal",
    hasGown: false,
    innerWear: "기타",
    clothingLabel: "기타",
    poseType: "Unknown",
    isFamilyProfile: false,
    confidence: 0,
    analyzed: false,
    groupKey: "",
  };
}

describe("studio classification analysis", () => {
  it("groups studio files by time gap without AI", () => {
    const result = groupStudioFilesByGap([
      photo("A.JPG", 0),
      photo("B.JPG", 10 * 60_000),
    ], 3);

    expect(result.files.map((file) => file.groupKey)).toEqual(["person_1", "person_2"]);
    expect(result.files.every((file) => file.analyzed)).toBe(true);
    expect(result.personGroups.filter((group) => !group.isEtc)).toHaveLength(2);
  });

  it("keeps normal gap groups and moves failed lighting checks to ETC", async () => {
    const result = await analyzeStudioGapLighting({
      files: [photo("A.JPG", 0), photo("B.JPG", 1_000)],
      gapMinutes: 3,
      lightingSensitivity: "medium",
      analyze: async (file) => file.name === "A.JPG"
        ? { ok: true, lightingStatus: "normal" }
        : { ok: true, lightingStatus: "etc_dark" },
    });

    expect(result.files.map((file) => file.groupKey)).toEqual(["person_1", "__ETC__"]);
    expect(result.files.every((file) => file.analyzed)).toBe(true);
    expect(result.personGroups.some((group) => group.isEtc)).toBe(true);
  });

  it("normalizes concept analysis into one studio group", async () => {
    const result = await analyzeStudioConcepts({
      files: [photo("A.JPG", 0)],
      lightingSensitivity: "medium",
      analyze: async () => ({
        ok: true,
        lightingStatus: "normal",
        hasGown: true,
        innerWear: "셔츠",
        poseType: "Standing",
        isFamilyProfile: false,
        confidence: 0.91,
      }),
    });

    expect(result.files[0]).toMatchObject({
      analyzed: true,
      groupKey: "가운_셔츠_Standing",
      clothingLabel: "가운+셔츠",
      confidence: 0.91,
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].suggestedFolderName).toContain("프로필_가운+셔츠_Standing");
  });

  it("assigns matching face features to the same person group", async () => {
    const result = await analyzeStudioPeople({
      files: [photo("A.JPG", 0), photo("B.JPG", 1_000)],
      lightingSensitivity: "medium",
      analyze: async () => ({
        ok: true,
        lightingStatus: "normal",
        gender: "female",
        ageBand: "40s",
        hairColor: "black",
        hairLength: "medium",
        hasGlasses: true,
        hasBeard: false,
        faceShape: "oval",
      }),
    });

    expect(result.files.map((file) => file.groupKey)).toEqual(["person_1", "person_1"]);
    expect(result.personGroups.filter((group) => !group.isEtc)).toHaveLength(1);
    expect(result.personGroups[0].files).toHaveLength(2);
  });
});
