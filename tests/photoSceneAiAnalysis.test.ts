import { describe, expect, it } from "vitest";
import {
  applySceneAiResponse,
  buildSceneAnalysisSampleIndices,
  isDermatologyStrongTransition,
  markDermatologyTransitionCandidates,
  type SceneAiTransitionResult,
} from "@/lib/photo-classifier/sceneAiAnalysis";
import type { FieldScene } from "@/lib/photo-classifier/types";

function scene(index: number, editedName = `Scene${index}`): FieldScene {
  return {
    index,
    folderName: `Scene${index}`,
    editedName,
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

describe("scene AI analysis rules", () => {
  it("chooses six unique sample positions within bounds", () => {
    expect(buildSceneAnalysisSampleIndices(1)).toEqual([0]);
    expect(buildSceneAnalysisSampleIndices(10)).toEqual([0, 1, 5, 6, 8, 9]);
    expect(buildSceneAnalysisSampleIndices(0)).toEqual([]);
  });

  it("applies dermatology base naming and preserves analysis details", () => {
    const result = applySceneAiResponse(scene(2), {
      ok: true,
      sceneType: "treatment",
      suggestedFolderName: "시술",
      confidence: 0.91,
      reason: "장비 확인",
      equipmentName: "레이저",
      namingEvidence: ["장비", 2],
    }, {
      department: "dermatology",
      departmentLogicEnabled: true,
      aiNamingEnabled: false,
    });

    expect(result.scene).toMatchObject({
      editedName: "02_시술",
      suggestedName: "02_시술",
      sceneType: "treatment",
      aiEquipmentName: "레이저",
      aiNamingEvidence: ["장비", "2"],
      nameLoading: false,
    });
    expect(result.transition?.confidence).toBe(0.91);
  });

  it("does not rename a general scene when naming is disabled", () => {
    const result = applySceneAiResponse(scene(1, "기존 이름"), {
      ok: true,
      suggestedFolderName: "추천 이름",
    }, {
      department: "general",
      departmentLogicEnabled: true,
      aiNamingEnabled: false,
    });

    expect(result.scene.editedName).toBe("기존 이름");
    expect(result.scene.suggestedName).toBeNull();
  });

  it("marks only confident strong dermatology transitions", () => {
    const previous: SceneAiTransitionResult = { sceneType: "doctor_consultation", confidence: 0.9 };
    const current: SceneAiTransitionResult = { sceneType: "device_treatment", confidence: 0.8 };
    expect(isDermatologyStrongTransition(previous, current)).toBe(true);

    const marked = markDermatologyTransitionCandidates(
      [scene(1, "상담"), { ...scene(2, "시술"), aiReason: "레이저" }],
      new Map([[0, previous], [1, current]]),
    );
    expect(marked[1].aiReason).toContain("이전 씬(상담)");

    const lowConfidence = markDermatologyTransitionCandidates(
      [scene(1), scene(2)],
      new Map([[0, previous], [1, { ...current, confidence: 0.71 }]]),
    );
    expect(lowConfidence[1].aiReason).toBeNull();
  });
});
