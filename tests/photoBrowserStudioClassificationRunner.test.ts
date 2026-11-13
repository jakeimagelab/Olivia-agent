import { describe, expect, it, vi } from "vitest";

import {
  runBrowserStudioClassification,
  runBrowserStudioOutput,
} from "@/lib/photo-classifier/browserStudioClassificationRunner";
import type { StudioGroup, StudioPhotoFile } from "@/lib/photo-classifier/studioGrouping";

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

describe("browser studio classification runner", () => {
  const rootDirectory = { name: "촬영" } as FileSystemDirectoryHandle;

  it("시간 간격 모드는 한 번 스캔한 파일을 인물 그룹으로 분류한다", async () => {
    const files = [photo("A.JPG", 0), photo("B.JPG", 10 * 60_000)];
    const analyzeGapLighting = vi.fn();
    const analyzePeople = vi.fn();
    const analyzeConcepts = vi.fn();
    const onFilesScanned = vi.fn();

    const result = await runBrowserStudioClassification({
      rootDirectory,
      subMode: "group",
      groupSortMode: "gap",
      gapMinutes: 3,
      lightingSensitivity: "medium",
      onFilesScanned,
      dependencies: {
        splitFiles: (async () => ({
          rawFiles: [{ name: "A.CR3", handle: {} as FileSystemFileHandle }],
          jpgFiles: [{ name: "A.JPG" }, { name: "B.JPG" }],
        })) as never,
        prepareFiles: (async () => files) as never,
        analyzeGapLighting: analyzeGapLighting as never,
        analyzePeople: analyzePeople as never,
        analyzeConcepts: analyzeConcepts as never,
      },
    });

    expect(result).toMatchObject({ rawCount: 1, total: 2, conceptGroups: [] });
    expect(result.files.map((file) => file.groupKey)).toEqual(["person_1", "person_2"]);
    expect(result.personGroups.filter((group) => !group.isEtc)).toHaveLength(2);
    expect(onFilesScanned).toHaveBeenCalledWith(files, 1);
    expect(analyzeGapLighting).not.toHaveBeenCalled();
    expect(analyzePeople).not.toHaveBeenCalled();
    expect(analyzeConcepts).not.toHaveBeenCalled();
  });

  it("콘셉트 출력은 보고서와 폴더 계획을 같은 실행기에 전달한다", async () => {
    const file = photo("A.JPG", 0);
    const group: StudioGroup = {
      key: "concept",
      clothingLabel: "셔츠",
      poseType: "Standing",
      isFamilyProfile: false,
      files: [file],
      suggestedFolderName: "01_추천",
      editedFolderName: "01_확정",
      index: 1,
      isEtc: false,
    };
    const executeOutput = vi.fn().mockResolvedValue({ completed: 1, total: 1, log: [] });

    const stats = await runBrowserStudioOutput({
      rootDirectory,
      subMode: "concept",
      personGroups: [],
      conceptGroups: [group],
      totalJpg: 1,
      totalRaw: 2,
      fileMode: "copy",
      isCancelled: () => false,
      dependencies: { executeOutput },
    });

    expect(stats).toEqual({ totalJpg: 1, totalRaw: 2, totalGroups: 1, totalEtc: 0, totalNormal: 1 });
    expect(executeOutput).toHaveBeenCalledOnce();
    expect(executeOutput.mock.calls[0][0]).toMatchObject({
      rootDirectory,
      mode: "copy",
      groups: [{ folderName: "01_확정", files: [file] }],
    });
    expect(executeOutput.mock.calls[0][0].reports.map((report: { name: string }) => report.name)).toContain("summary.json");
  });
});
