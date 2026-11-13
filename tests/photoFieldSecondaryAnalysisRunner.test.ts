import { describe, expect, it, vi } from "vitest";
import { runFieldSecondaryAnalysis } from "@/lib/photo-classifier/fieldSecondaryAnalysisRunner";
import type { FieldSecondaryReportFile } from "@/lib/photo-classifier/fieldSecondaryReports";
import type { FieldScene } from "@/lib/photo-classifier/types";

function makeScene(
  sceneType: FieldScene["sceneType"],
  sceneDir: FileSystemDirectoryHandle,
): FieldScene {
  return {
    index: 1,
    folderName: "Scene01",
    editedName: "01_테스트",
    startTime: 1,
    endTime: 2,
    fileCount: 1,
    files: [{
      name: "A.JPG",
      basename: "A",
      handle: { getFile: vi.fn().mockResolvedValue({ name: "A.JPG" } as File) } as unknown as FileSystemFileHandle,
      mtime: 1,
    }],
    sceneDir,
    sceneType,
    suggestedName: null,
    aiConfidence: null,
    aiReason: null,
    subScenes: [],
    profileCount: 0,
    qualityRejectCount: 0,
    nameLoading: false,
  };
}

const reportContext = {
  fastAnalyzeMode: false,
  department: "dermatology" as const,
  departmentDisplayName: "피부과",
  gapMinutes: 3,
  departmentLogicEnabled: true,
  aiNamingEnabled: true,
  qualityAnalysisEnabled: true,
  profileClassificationEnabled: true,
  rawSelectMode: "copy" as const,
};

describe("field secondary analysis runner", () => {
  it("moves a quality reject and records excluded profile scenes", async () => {
    const removeEntry = vi.fn().mockResolvedValue(undefined);
    const sceneDir = { removeEntry } as unknown as FileSystemDirectoryHandle;
    const reasonDir = {} as FileSystemDirectoryHandle;
    const qualityDir = {
      getDirectoryHandle: vi.fn().mockResolvedValue(reasonDir),
    } as unknown as FileSystemDirectoryHandle;
    const fieldJpgBaseDir = {
      getDirectoryHandle: vi.fn().mockResolvedValue(qualityDir),
    } as unknown as FileSystemDirectoryHandle;
    const copyFile = vi.fn(async () => undefined);
    let reports: readonly FieldSecondaryReportFile[] = [];

    const result = await runFieldSecondaryAnalysis({
      scenes: [makeScene("consultation", sceneDir)],
      rootDir: {} as FileSystemDirectoryHandle,
      fieldJpgBaseDir,
      fieldRawCount: 3,
      qualityAnalysisEnabled: true,
      profileClassificationEnabled: true,
      mergeCandidates: [],
      mergeDecisions: [],
      reportContext,
      isCancelled: () => false,
      qualityAnalyzer: async () => ({ blurScore: 4, brightness: 100 }),
      portraitAnalyzer: vi.fn(),
      copyFile,
      reportWriter: async (_rootDir, files) => { reports = files; },
    });

    expect(result).toMatchObject({ total: 1, qualityRejectTotal: 1, profileTotal: 0, errors: [] });
    expect(result.scenes[0].qualityRejectCount).toBe(1);
    expect(copyFile).toHaveBeenCalledTimes(1);
    expect(removeEntry).toHaveBeenCalledWith("A.JPG");
    expect(reports.map((report) => report.name)).toEqual(["quality_report.csv", "profile_report.csv", "summary.json"]);
    expect(reports.find((report) => report.name === "profile_report.csv")?.content).toContain("consultation 장면이므로 프로필 제외");
  });

  it("moves an approved portrait to PROFILE and reports the final count", async () => {
    const removeEntry = vi.fn().mockResolvedValue(undefined);
    const sceneDir = { removeEntry } as unknown as FileSystemDirectoryHandle;
    const profileDir = {} as FileSystemDirectoryHandle;
    const rootDir = {
      getDirectoryHandle: vi.fn().mockResolvedValue(profileDir),
    } as unknown as FileSystemDirectoryHandle;
    const copyFile = vi.fn(async () => undefined);
    let reports: readonly FieldSecondaryReportFile[] = [];

    const result = await runFieldSecondaryAnalysis({
      scenes: [makeScene("profile", sceneDir)],
      rootDir,
      fieldJpgBaseDir: null,
      fieldRawCount: 0,
      qualityAnalysisEnabled: false,
      profileClassificationEnabled: true,
      mergeCandidates: [],
      mergeDecisions: [],
      reportContext: { ...reportContext, qualityAnalysisEnabled: false },
      isCancelled: () => false,
      portraitAnalyzer: async () => ({
        personCount: 1,
        facingForward: true,
        intentionalPose: true,
        isProfileCandidate: true,
        confidence: 0.94,
      }),
      copyFile,
      reportWriter: async (_reportRoot, files) => { reports = files; },
    });

    expect(result).toMatchObject({ total: 1, qualityRejectTotal: 0, profileTotal: 1, errors: [] });
    expect(result.scenes[0].profileCount).toBe(1);
    expect(rootDir.getDirectoryHandle).toHaveBeenCalledWith("PROFILE", { create: true });
    expect(removeEntry).toHaveBeenCalledWith("A.JPG");
    expect(reports.find((report) => report.name === "profile_report.csv")?.content).toContain("PROFILE/");
  });
});
