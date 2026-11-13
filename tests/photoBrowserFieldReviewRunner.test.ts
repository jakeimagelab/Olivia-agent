import { describe, expect, it, vi } from "vitest";

import { runBrowserFieldReviewConfirmation } from "@/lib/photo-classifier/browserFieldReviewRunner";
import type { FieldScene } from "@/lib/photo-classifier/types";

function scene(sceneDirectory: FileSystemDirectoryHandle | null): FieldScene {
  return {
    index: 1,
    folderName: "Scene01",
    editedName: "01_상담",
    startTime: 1,
    endTime: 2,
    fileCount: 1,
    files: [{ name: "A.JPG", basename: "A", handle: {} as FileSystemFileHandle, mtime: 1 }],
    sceneDir: sceneDirectory,
    sceneType: "consultation",
    suggestedName: null,
    aiConfidence: null,
    aiReason: null,
    subScenes: [],
    profileCount: 0,
    qualityRejectCount: 0,
    nameLoading: false,
  };
}

const common = {
  rootDirectory: { name: "촬영" } as FileSystemDirectoryHandle,
  rawFiles: [],
  rawCount: 2,
  boundaryDecisions: [],
  sceneCorrections: [],
  accuracyReport: null,
  mergeCandidates: [],
  mergeDecisions: [],
  department: "dermatology" as const,
  departmentDisplayName: "피부과",
  gapMinutes: 3,
  departmentLogicEnabled: true,
  aiNamingEnabled: false,
  rawSelectMode: "copy" as const,
  isCancelled: () => false,
};

describe("browser field review runner", () => {
  it("승인 전 계획은 파일 출력을 실행하고 기본 통계를 반환한다", async () => {
    const plannedScene = scene(null);
    const jpgBaseDirectory = { name: "JPG" } as FileSystemDirectoryHandle;
    const executePlannedOutput = vi.fn().mockResolvedValue({
      scenes: [plannedScene],
      jpgBaseDirectory,
      totalFiles: 1,
      operations: [],
    });
    const runSecondaryAnalysis = vi.fn();

    const result = await runBrowserFieldReviewConfirmation({
      ...common,
      scenes: [plannedScene],
      jpgBaseDirectory: null,
      fastAnalyzeMode: false,
      qualityAnalysisEnabled: false,
      profileClassificationEnabled: false,
      dependencies: {
        executePlannedOutput,
        renameScenes: vi.fn() as never,
        runSecondaryAnalysis: runSecondaryAnalysis as never,
      },
    });

    expect(result).toMatchObject({
      outputMode: "planned",
      jpgBaseDirectory,
      stats: { totalJpg: 1, totalRaw: 2, totalScenes: 1, totalProfile: 0, totalQualityReject: 0 },
    });
    expect(executePlannedOutput).toHaveBeenCalledOnce();
    expect(runSecondaryAnalysis).not.toHaveBeenCalled();
  });

  it("기존 Scene 폴더는 이름을 확정한 뒤 선택한 2차 분석을 한 번 실행한다", async () => {
    const jpgBaseDirectory = { name: "JPG" } as FileSystemDirectoryHandle;
    const confirmedScene = scene({ name: "Scene01" } as FileSystemDirectoryHandle);
    const renamedScene = { ...confirmedScene, folderName: "01_상담" };
    const renameScenes = vi.fn().mockResolvedValue([renamedScene]);
    const runSecondaryAnalysis = vi.fn().mockResolvedValue({
      scenes: [renamedScene],
      total: 1,
      profileTotal: 1,
      qualityRejectTotal: 0,
      errors: [],
    });

    const result = await runBrowserFieldReviewConfirmation({
      ...common,
      scenes: [confirmedScene],
      jpgBaseDirectory,
      fastAnalyzeMode: false,
      qualityAnalysisEnabled: false,
      profileClassificationEnabled: true,
      dependencies: {
        executePlannedOutput: vi.fn() as never,
        renameScenes: renameScenes as never,
        runSecondaryAnalysis: runSecondaryAnalysis as never,
      },
    });

    expect(result).toMatchObject({
      outputMode: "rename",
      stats: { totalJpg: 1, totalRaw: 2, totalScenes: 1, totalProfile: 1, totalQualityReject: 0 },
    });
    expect(renameScenes).toHaveBeenCalledWith({ scenes: [confirmedScene], jpgBaseDirectory });
    expect(runSecondaryAnalysis.mock.calls[0][0]).toMatchObject({
      scenes: [renamedScene],
      fieldJpgBaseDir: jpgBaseDirectory,
      fieldRawCount: 2,
      reportContext: {
        departmentDisplayName: "피부과",
        profileClassificationEnabled: true,
      },
    });
  });
});
