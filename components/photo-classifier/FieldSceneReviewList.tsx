"use client";

import type { SceneMergeCandidate } from "@/lib/photo-classifier/scene-merge-types";
import type { FieldScene } from "@/lib/photo-classifier/types";
import { FieldSceneMergeCandidateCard } from "./FieldSceneMergeCandidateCard";
import { FieldSceneReviewRow } from "./FieldSceneReviewRow";
import { C, Card } from "./PhotoSortingUi";

export function FieldSceneReviewList({
  scenes,
  totalJpg,
  rawCount,
  departmentLabel,
  mergeCandidates,
  dismissedCandidates,
  splitPositions,
  onSceneFocus,
  onSceneNameChange,
  onSceneNameCommit,
  onSuggestedNameApply,
  onSplitPositionChange,
  onSplitScene,
  onMergeScenes,
  onApproveScene,
  onDismissCandidate,
}: {
  scenes: FieldScene[];
  totalJpg: number;
  rawCount: number;
  departmentLabel: string;
  mergeCandidates: SceneMergeCandidate[];
  dismissedCandidates: Set<string>;
  splitPositions: Record<number, number>;
  onSceneFocus: (sceneIndex: number) => void;
  onSceneNameChange: (sceneIndex: number, value: string) => void;
  onSceneNameCommit: (scene: FieldScene) => void;
  onSuggestedNameApply: (sceneIndex: number, value: string) => void;
  onSplitPositionChange: (sceneIndex: number, value: number) => void;
  onSplitScene: (listIndex: number, offset: number) => void;
  onMergeScenes: (fromIndex: number, toIndex: number, candidateId?: string) => void;
  onApproveScene: (listIndex: number) => void;
  onDismissCandidate: (candidateId: string) => void;
}) {
  return (
    <Card>
      <div
        style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${C.border}`,
          fontSize: 12,
          fontWeight: 600,
          color: C.teal,
        }}
      >
        씬 검토 — JPG {totalJpg}장 / RAW {rawCount}개 / {departmentLabel}
      </div>
      <div style={{ padding: "8px 0" }}>
        {scenes.map((scene, listIndex) => {
          const nextScene = scenes[listIndex + 1];
          const candidate = nextScene
            ? mergeCandidates.find(
                (item) => item.fromFolderName === scene.folderName
                  && item.toFolderName === nextScene.folderName
                  && !dismissedCandidates.has(item.id),
              )
            : undefined;

          return (
            <div key={scene.index}>
              <FieldSceneReviewRow
                scene={scene}
                listIndex={listIndex}
                sceneCount={scenes.length}
                splitPosition={splitPositions[scene.index] ?? 1}
                onSceneFocus={onSceneFocus}
                onSceneNameChange={onSceneNameChange}
                onSceneNameCommit={onSceneNameCommit}
                onSuggestedNameApply={onSuggestedNameApply}
                onSplitPositionChange={onSplitPositionChange}
                onSplitScene={onSplitScene}
                onMergeScenes={onMergeScenes}
                onApproveScene={onApproveScene}
              />
              {candidate && nextScene ? (
                <FieldSceneMergeCandidateCard
                  scene={scene}
                  nextScene={nextScene}
                  candidate={candidate}
                  onMerge={() => onMergeScenes(listIndex, listIndex + 1, candidate.id)}
                  onKeepSplit={() => onDismissCandidate(candidate.id)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
