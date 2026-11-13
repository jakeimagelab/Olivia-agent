import { describe, expect, it } from "vitest";
import {
  buildFieldSecondaryReportFiles,
  describePortraitAssessment,
  normalizePortraitAssessment,
  resolveQualityRejectReason,
} from "@/lib/photo-classifier/fieldSecondaryReports";
import type { SceneMergeCandidate } from "@/lib/photo-classifier/scene-merge-types";

const candidate: SceneMergeCandidate = {
  id: "merge-1",
  fromFolderName: "Scene01",
  toFolderName: "Scene02",
  fromDisplayName: "상담",
  toDisplayName: "시술",
  fromSceneType: "consultation",
  toSceneType: "treatment",
  mergeScore: 0.845,
  transitionStrength: 0.2,
  recommendedAction: "merge",
  reason: "같은 장면",
  matchedSignals: ["same_room"],
  blockedSignals: [],
};

describe("field secondary analysis reports", () => {
  it("keeps the existing quality thresholds", () => {
    expect(resolveQualityRejectReason(17.9, 100)).toBe("흔들림");
    expect(resolveQualityRejectReason(18, 37.9)).toBe("조명불량");
    expect(resolveQualityRejectReason(18, 230.1)).toBe("확인필요");
    expect(resolveQualityRejectReason(18, 100)).toBe("");
  });

  it("normalizes portrait responses and explains rejection", () => {
    const assessment = normalizePortraitAssessment({
      ok: true,
      personCount: 1,
      facingForward: true,
      intentionalPose: false,
      isProfile: false,
      confidence: 0.7,
    });
    expect(assessment).toMatchObject({ personCount: 1, facingForward: true, intentionalPose: false, confidence: 0.7 });
    expect(describePortraitAssessment(assessment)).toContain("의도된 포즈 아님");
    expect(describePortraitAssessment({ ...assessment, personCount: 2 })).toContain("2명");
    expect(describePortraitAssessment({ ...assessment, isProfileCandidate: true })).toBe("프로필 조건 충족");
  });

  it("writes unresolved merge candidates as keep-split and preserves summary fields", () => {
    const files = buildFieldSecondaryReportFiles({
      qualityRows: [["A.JPG", "Scene01", "흔들림", ""]],
      profileRows: [],
      mergeCandidates: [candidate],
      mergeDecisions: [],
      summary: {
        fastAnalyzeMode: false,
        department: "dermatology",
        departmentDisplayName: "피부과",
        gapMinutes: 5,
        departmentLogicEnabled: true,
        aiNamingEnabled: true,
        qualityAnalysisEnabled: true,
        profileClassificationEnabled: true,
        rawSelectMode: "copy",
        totalJpg: 10,
        totalRaw: 10,
        totalInitialScenes: 2,
        totalFinalScenes: 2,
        totalProfile: 1,
        totalQualityReject: 1,
        createdAt: "now",
      },
    });

    expect(files.find((file) => file.name === "quality_report.csv")?.content).toContain("A.JPG");
    expect(files.find((file) => file.name === "scene_merge_report.csv")?.content).toContain('"keep_split"');
    const summary = JSON.parse(files.find((file) => file.name === "summary.json")?.content ?? "{}");
    expect(summary).toMatchObject({ totalJpg: 10, totalMergeCandidates: 1, createdAt: "now" });
  });
});
