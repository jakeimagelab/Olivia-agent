"use client";

import type { AccuracyReport, SceneBoundaryDecision } from "@/lib/photo-classifier/hybrid-types";
import type { SceneMergeCandidate } from "@/lib/photo-classifier/scene-merge-types";
import type { FieldScene } from "@/lib/photo-classifier/types";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { FieldSceneReviewList } from "./FieldSceneReviewList";
import { FieldSceneReviewOverview } from "./FieldSceneReviewOverview";
import { Btn } from "./PhotoSortingUi";

type BridgePlanSummary = {
  sceneCount: number;
  jpgCount: number;
  reviewCount: number;
};

export function FieldSceneReviewStep({
  scenes,
  rawCount,
  departmentLabel,
  bridgePlanSummary,
  fastAnalyzeMode,
  boundaryDecisions,
  aiAnalysisEnabled,
  evaluationMode,
  onEvaluationModeChange,
  groundTruthSelection,
  onGroundTruthSelectionChange,
  groundTruthBoundaries,
  onGroundTruthBoundariesChange,
  accuracyReport,
  onAccuracyReportChange,
  mergeCandidates,
  dismissedCandidates,
  splitPositions,
  onApproveAll,
  onSceneNameChange,
  onSceneNameCommit,
  onSuggestedNameApply,
  onSplitPositionChange,
  onSplitScene,
  onMergeScenes,
  onApproveScene,
  onDismissCandidate,
  onBack,
  onConfirm,
}: {
  scenes: FieldScene[];
  rawCount: number;
  departmentLabel: string;
  bridgePlanSummary: BridgePlanSummary | null;
  fastAnalyzeMode: boolean;
  boundaryDecisions: SceneBoundaryDecision[];
  aiAnalysisEnabled: boolean;
  evaluationMode: boolean;
  onEvaluationModeChange: (value: boolean) => void;
  groundTruthSelection: number;
  onGroundTruthSelectionChange: (value: number) => void;
  groundTruthBoundaries: number[];
  onGroundTruthBoundariesChange: (value: number[]) => void;
  accuracyReport: AccuracyReport | null;
  onAccuracyReportChange: (value: AccuracyReport) => void;
  mergeCandidates: SceneMergeCandidate[];
  dismissedCandidates: Set<string>;
  splitPositions: Record<number, number>;
  onApproveAll: () => void;
  onSceneNameChange: (sceneIndex: number, value: string) => void;
  onSceneNameCommit: (scene: FieldScene) => void;
  onSuggestedNameApply: (sceneIndex: number, value: string) => void;
  onSplitPositionChange: (sceneIndex: number, value: number) => void;
  onSplitScene: (sceneIndex: number, offset: number) => void;
  onMergeScenes: (fromIndex: number, toIndex: number, candidateId?: string) => void;
  onApproveScene: (sceneIndex: number) => void;
  onDismissCandidate: (candidateId: string) => void;
  onBack: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const allLoaded = scenes.every((scene) => !scene.nameLoading);
  const allApproved = scenes.length > 0 && scenes.every((scene) => scene.approved);
  const boundaryReviewCount = boundaryDecisions.filter((decision) => decision.needsReview).length;
  const totalJpg = scenes.reduce((sum, scene) => sum + scene.fileCount, 0);
  const allFieldFiles = scenes.flatMap((scene) => scene.files);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 860 }}>
      <FieldSceneReviewOverview
        bridgePlanSummary={bridgePlanSummary}
        fastAnalyzeMode={fastAnalyzeMode}
        boundaryReviewCount={boundaryReviewCount}
        aiAnalysisPending={aiAnalysisEnabled && !allLoaded}
        approvedCount={scenes.filter((scene) => scene.approved).length}
        sceneCount={scenes.length}
        onApproveAll={onApproveAll}
        evaluationMode={evaluationMode}
        onEvaluationModeChange={onEvaluationModeChange}
        files={allFieldFiles}
        groundTruthSelection={groundTruthSelection}
        onGroundTruthSelectionChange={onGroundTruthSelectionChange}
        groundTruthBoundaries={groundTruthBoundaries}
        onGroundTruthBoundariesChange={onGroundTruthBoundariesChange}
        boundaryDecisions={boundaryDecisions}
        accuracyReport={accuracyReport}
        onAccuracyReportChange={onAccuracyReportChange}
        mergeCandidates={mergeCandidates}
        dismissedCandidates={dismissedCandidates}
      />

      <FieldSceneReviewList
        scenes={scenes}
        totalJpg={totalJpg}
        rawCount={rawCount}
        departmentLabel={departmentLabel}
        mergeCandidates={mergeCandidates}
        dismissedCandidates={dismissedCandidates}
        splitPositions={splitPositions}
        onSceneFocus={(sceneIndex) => useOliviaContextStore.getState().setSelection("photo_scene", String(sceneIndex))}
        onSceneNameChange={onSceneNameChange}
        onSceneNameCommit={onSceneNameCommit}
        onSuggestedNameApply={onSuggestedNameApply}
        onSplitPositionChange={onSplitPositionChange}
        onSplitScene={onSplitScene}
        onMergeScenes={onMergeScenes}
        onApproveScene={onApproveScene}
        onDismissCandidate={onDismissCandidate}
      />

      <div className="ps-btn-row">
        <Btn variant="secondary" onClick={onBack}>← 처음으로</Btn>
        <Btn onClick={() => void onConfirm()} disabled={!allLoaded || !allApproved}>
          {!allLoaded ? "AI 분석 중..." : !allApproved ? "Scene 승인 필요" : "승인 결과로 폴더 정리"}
        </Btn>
      </div>
    </div>
  );
}
