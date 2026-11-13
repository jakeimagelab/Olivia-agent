import type { MedicalDepartment } from "./types";
import type { MergeDecision, SceneMergeCandidate } from "./scene-merge-types";
import { makeCSV } from "./workspaceFormatting";

export type PortraitAssessment = {
  personCount: number;
  facingForward: boolean;
  intentionalPose: boolean;
  isProfileCandidate: boolean;
  confidence: number;
};

export type FieldSecondaryReportFile = {
  name: string;
  content: string;
};

type FieldSecondarySummary = {
  fastAnalyzeMode: boolean;
  department: MedicalDepartment;
  departmentDisplayName: string;
  gapMinutes: number;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  rawSelectMode: "move" | "copy";
  totalJpg: number;
  totalRaw: number;
  totalInitialScenes: number;
  totalFinalScenes: number;
  totalProfile: number;
  totalQualityReject: number;
  createdAt?: string;
};

export function resolveQualityRejectReason(blurScore: number, brightness: number): string {
  if (blurScore < 18) return "흔들림";
  if (brightness < 38) return "조명불량";
  if (brightness > 230) return "확인필요";
  return "";
}

export function normalizePortraitAssessment(response: unknown): PortraitAssessment {
  const data = response && typeof response === "object" ? response as Record<string, unknown> : {};
  if (data.ok !== true) {
    return { personCount: 0, facingForward: false, intentionalPose: false, isProfileCandidate: false, confidence: 0 };
  }
  return {
    personCount: typeof data.personCount === "number" ? data.personCount : 0,
    facingForward: data.facingForward === true,
    intentionalPose: data.intentionalPose === true,
    isProfileCandidate: data.isProfile === true,
    confidence: typeof data.confidence === "number" ? data.confidence : 0,
  };
}

export function describePortraitAssessment(assessment: PortraitAssessment): string {
  if (assessment.isProfileCandidate) return "프로필 조건 충족";
  if (assessment.personCount !== 1) return `인원수 불일치(${assessment.personCount}명) — 1인이 아님`;
  return `정면 응시·의도된 포즈 아님 (facingForward:${assessment.facingForward}, intentionalPose:${assessment.intentionalPose})`;
}

export function buildFieldSecondaryReportFiles({
  qualityRows,
  profileRows,
  mergeCandidates,
  mergeDecisions,
  summary,
}: {
  qualityRows: string[][];
  profileRows: string[][];
  mergeCandidates: SceneMergeCandidate[];
  mergeDecisions: MergeDecision[];
  summary: FieldSecondarySummary;
}): FieldSecondaryReportFile[] {
  const files: FieldSecondaryReportFile[] = [];
  if (qualityRows.length > 0) {
    files.push({
      name: "quality_report.csv",
      content: makeCSV(["file_name", "scene", "reason", "note"], qualityRows),
    });
  }
  if (profileRows.length > 0) {
    files.push({
      name: "profile_report.csv",
      content: makeCSV([
        "file_name", "original_scene", "profile_confidence", "is_profile",
        "main_person_count", "has_patient", "is_looking_at_camera", "has_intentional_pose",
        "has_tool", "has_medical_device", "has_handpiece", "has_syringe",
        "has_consultation_object", "is_consultation", "is_treatment", "is_procedure",
        "reason", "moved_to",
      ], profileRows),
    });
  }
  if (mergeCandidates.length > 0) {
    const decisions = [...mergeDecisions];
    for (const candidate of mergeCandidates) {
      if (decisions.some((decision) => decision.candidateId === candidate.id)) continue;
      decisions.push({
        candidateId: candidate.id,
        userAction: "keep_split",
        fromFolderName: candidate.fromFolderName,
        toFolderName: candidate.toFolderName,
        fromSceneType: candidate.fromSceneType,
        toSceneType: candidate.toSceneType,
        mergeScore: candidate.mergeScore,
        matchedSignals: candidate.matchedSignals,
        blockedSignals: candidate.blockedSignals,
        recommendedAction: candidate.recommendedAction,
      });
    }
    files.push({
      name: "scene_merge_report.csv",
      content: makeCSV([
        "candidate_id", "from_scene", "to_scene", "from_scene_type", "to_scene_type",
        "merge_score", "recommended_action", "user_action", "matched_signals", "blocked_signals",
      ], decisions.map((decision) => [
        decision.candidateId,
        decision.fromFolderName,
        decision.toFolderName,
        decision.fromSceneType,
        decision.toSceneType,
        decision.mergeScore.toFixed(2),
        decision.recommendedAction,
        decision.userAction,
        decision.matchedSignals.join("|"),
        decision.blockedSignals.join("|"),
      ])),
    });
  }

  files.push({
    name: "summary.json",
    content: JSON.stringify({
      mode: "field",
      fastAnalyzeMode: summary.fastAnalyzeMode,
      classificationMode: summary.fastAnalyzeMode ? "fast" : "precise",
      rawInitialMoveEnabled: false,
      exifMode: summary.fastAnalyzeMode ? "fast" : "precise",
      thumbnailMode: "lazy",
      profileStrictMode: true,
      dermatologySecondPassEnhanced: summary.department === "dermatology",
      department: summary.department,
      departmentDisplayName: summary.departmentDisplayName,
      gapMinutes: summary.gapMinutes,
      timeGapBuildsCandidatesOnly: !summary.fastAnalyzeMode,
      departmentLogicEnabled: summary.departmentLogicEnabled,
      aiNamingEnabled: summary.aiNamingEnabled,
      qualityAnalysisEnabled: summary.qualityAnalysisEnabled,
      profileClassificationEnabled: summary.profileClassificationEnabled,
      rawSelectMode: summary.rawSelectMode,
      strongTransitionDetectionEnabled: true,
      mergeCandidateEnabled: true,
      reviewRequiredBeforeMove: true,
      totalJpg: summary.totalJpg,
      totalRaw: summary.totalRaw,
      totalInitialScenes: summary.totalInitialScenes,
      totalMergeCandidates: mergeCandidates.filter((candidate) => candidate.recommendedAction === "merge").length,
      totalKeepSplitRecommendations: mergeCandidates.filter((candidate) => candidate.recommendedAction === "keep_split").length,
      totalFinalScenes: summary.totalFinalScenes,
      totalProfile: summary.totalProfile,
      totalQualityReject: summary.totalQualityReject,
      createdAt: summary.createdAt ?? new Date().toISOString(),
    }, null, 2),
  });
  return files;
}
