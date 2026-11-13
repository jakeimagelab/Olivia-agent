import { describe, expect, it } from "vitest";
import {
  buildStudioConceptReportBundle,
  buildStudioPersonReportBundle,
} from "@/lib/photo-classifier/studioReports";
import type {
  PersonFeatures,
  PersonGroup,
  StudioGroup,
  StudioPhotoFile,
} from "@/lib/photo-classifier/studioGrouping";

const FEATURES: PersonFeatures = {
  gender: "female",
  ageBand: "40s",
  hairColor: "brown",
  hairLength: "long",
  hasGlasses: true,
  hasBeard: false,
  faceShape: "oval",
};

function makeFile(name: string, overrides: Partial<StudioPhotoFile> = {}): StudioPhotoFile {
  return {
    name,
    basename: name.replace(/\.[^.]+$/u, ""),
    handle: {} as FileSystemFileHandle,
    mtime: 0,
    thumbUrl: null,
    brightness: 42,
    fileSize: 100,
    lightingStatus: "normal",
    hasGown: false,
    innerWear: "셔츠",
    clothingLabel: "셔츠",
    poseType: "Standing",
    isFamilyProfile: false,
    confidence: 0.876,
    analyzed: true,
    groupKey: "group-1",
    ...overrides,
  };
}

describe("studio classification reports", () => {
  it("builds concept CSV files, summary, and stats from the same groups", () => {
    const group: StudioGroup = {
      key: "group-1",
      clothingLabel: "셔츠",
      poseType: "Standing",
      isFamilyProfile: false,
      files: [makeFile("A.JPG")],
      suggestedFolderName: "01_프로필_셔츠_Standing",
      editedFolderName: "01_프로필_셔츠_Standing",
      index: 1,
      isEtc: false,
    };
    const bundle = buildStudioConceptReportBundle([group], {
      totalJpg: 1,
      totalRaw: 1,
      rootName: "촬영",
      createdAt: "now",
    });

    expect(bundle.stats).toEqual({ totalJpg: 1, totalRaw: 1, totalGroups: 1, totalEtc: 0, totalNormal: 1 });
    expect(bundle.files.find((file) => file.name === "studio_classification_report.csv")?.content).toContain("A.JPG");
    expect(bundle.files.find((file) => file.name === "summary.json")?.content).toContain('"output_path": "분류_촬영/"');
  });

  it("builds person detail and ETC reports without losing feature values", () => {
    const person: PersonGroup = {
      id: "person-1",
      label: "인물 1",
      features: FEATURES,
      sampleThumb: "",
      files: [makeFile("P.JPG", { personFeatures: FEATURES })],
      suggestedFolderName: "01_인물1",
      editedFolderName: "01_인물1",
      index: 1,
      isEtc: false,
    };
    const etc: PersonGroup = {
      ...person,
      id: "__ETC__",
      label: "조명불량",
      files: [makeFile("DARK.JPG", { lightingStatus: "etc_dark", groupKey: "__ETC__" })],
      editedFolderName: "00_ETC_조명불량",
      index: 0,
      isEtc: true,
    };
    const bundle = buildStudioPersonReportBundle([etc, person], {
      totalJpg: 2,
      totalRaw: 2,
      rootName: "촬영",
      createdAt: "now",
    });

    expect(bundle.stats).toEqual({ totalJpg: 2, totalRaw: 2, totalGroups: 1, totalEtc: 1, totalNormal: 1 });
    expect(bundle.files.find((file) => file.name === "classification_detail.csv")?.content).toContain('"female","40s","brown","long","true"');
    expect(bundle.files.find((file) => file.name === "etc_report.csv")?.content).toContain('"DARK.JPG","etc_dark","42"');
  });
});
