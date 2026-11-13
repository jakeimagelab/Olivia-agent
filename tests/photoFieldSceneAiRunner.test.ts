import { describe, expect, it, vi } from "vitest";
import { runFieldSceneAiAnalysis } from "@/lib/photo-classifier/fieldSceneAiRunner";
import type { FieldScene } from "@/lib/photo-classifier/types";

function scene(index: number): FieldScene {
  return {
    index,
    folderName: `Scene${String(index).padStart(2, "0")}`,
    editedName: `Scene${String(index).padStart(2, "0")}`,
    startTime: index,
    endTime: index,
    fileCount: 0,
    files: [],
    sceneDir: null,
    sceneType: null,
    suggestedName: null,
    aiConfidence: null,
    aiReason: null,
    subScenes: [],
    profileCount: 0,
    qualityRejectCount: 0,
    nameLoading: true,
  };
}

describe("field scene AI runner", () => {
  it("applies scene responses, marks dermatology transitions, and builds merge candidates", async () => {
    const onProgress = vi.fn();
    const result = await runFieldSceneAiAnalysis({
      scenes: [scene(1), scene(2)],
      department: "dermatology",
      departmentLogicEnabled: true,
      aiNamingEnabled: false,
      onProgress,
      analyze: async (_scene, _department, index) => index === 0
        ? {
            ok: true,
            sceneType: "consultation",
            suggestedFolderName: "상담",
            patientPosture: "seated",
            confidence: 0.9,
          }
        : {
            ok: true,
            sceneType: "treatment",
            suggestedFolderName: "시술",
            patientPosture: "lying_down",
            confidence: 0.85,
          },
    });

    expect(result.errors).toEqual([]);
    expect(result.scenes[0].editedName).toBe("01_상담");
    expect(result.scenes[1].editedName).toBe("02_시술");
    expect(result.scenes[1].aiReason).toContain("2차 분리 후보");
    expect(result.mergeCandidates).not.toBeNull();
    expect(onProgress).toHaveBeenCalledTimes(3);
  });

  it("recovers an individual scene failure without leaving its loading state active", async () => {
    const result = await runFieldSceneAiAnalysis({
      scenes: [scene(1)],
      department: "general",
      departmentLogicEnabled: false,
      aiNamingEnabled: true,
      analyze: async () => { throw new Error("temporary AI failure"); },
    });

    expect(result.scenes[0].nameLoading).toBe(false);
    expect(result.mergeCandidates).toBeNull();
    expect(result.errors).toEqual([{ index: 0, message: "temporary AI failure" }]);
  });
});
