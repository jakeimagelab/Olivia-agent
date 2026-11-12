"use client";

import type { AccuracyReport, SceneBoundaryDecision } from "@/lib/photo-classifier/hybrid-types";
import { evaluateSceneBoundaries } from "@/lib/photo-classifier/evaluation/metrics";
import type { SceneMergeCandidate } from "@/lib/photo-classifier/scene-merge-types";
import { C } from "./PhotoSortingUi";

type BridgePlanSummary = {
  sceneCount: number;
  jpgCount: number;
  reviewCount: number;
};

export function FieldSceneReviewOverview({
  bridgePlanSummary,
  fastAnalyzeMode,
  boundaryReviewCount,
  aiAnalysisPending,
  approvedCount,
  sceneCount,
  onApproveAll,
  evaluationMode,
  onEvaluationModeChange,
  files,
  groundTruthSelection,
  onGroundTruthSelectionChange,
  groundTruthBoundaries,
  onGroundTruthBoundariesChange,
  boundaryDecisions,
  accuracyReport,
  onAccuracyReportChange,
  mergeCandidates,
  dismissedCandidates,
}: {
  bridgePlanSummary: BridgePlanSummary | null;
  fastAnalyzeMode: boolean;
  boundaryReviewCount: number;
  aiAnalysisPending: boolean;
  approvedCount: number;
  sceneCount: number;
  onApproveAll: () => void;
  evaluationMode: boolean;
  onEvaluationModeChange: (value: boolean) => void;
  files: Array<{ name: string }>;
  groundTruthSelection: number;
  onGroundTruthSelectionChange: (value: number) => void;
  groundTruthBoundaries: number[];
  onGroundTruthBoundariesChange: (value: number[]) => void;
  boundaryDecisions: SceneBoundaryDecision[];
  accuracyReport: AccuracyReport | null;
  onAccuracyReportChange: (value: AccuracyReport) => void;
  mergeCandidates: SceneMergeCandidate[];
  dismissedCandidates: Set<string>;
}) {
  const activeMergeCount = mergeCandidates.filter(
    (candidate) => candidate.recommendedAction === "merge" && !dismissedCandidates.has(candidate.id),
  ).length;
  const activeSplitCount = mergeCandidates.filter(
    (candidate) => candidate.recommendedAction === "keep_split" && !dismissedCandidates.has(candidate.id),
  ).length;

  const calculateAccuracy = () => {
    onAccuracyReportChange(evaluateSceneBoundaries({
      predictedBoundaries: boundaryDecisions
        .filter((decision) => decision.decision !== "merge")
        .map((decision) => decision.boundaryIndex),
      groundTruthBoundaries,
      totalImages: files.length,
      tolerance: 1,
    }));
  };

  return (
    <>
      <div
        style={{
          padding: 14,
          background: bridgePlanSummary || fastAnalyzeMode ? "#EAF4F2" : "#ECFDF5",
          borderRadius: 10,
          fontSize: 12,
          color: bridgePlanSummary || fastAnalyzeMode ? "#155855" : "#166534",
          border: `1px solid ${bridgePlanSummary || fastAnalyzeMode ? "#B8CBD8" : "#A7F3D0"}`,
        }}
      >
        {bridgePlanSummary ? (
          <>
            <strong>Bridge 계획 적용됨</strong> · Scene {bridgePlanSummary.sceneCount}개 · JPG {bridgePlanSummary.jpgCount}장 — 원본은 아직 이동되지 않았습니다. 기존 검토 도구에서 Scene을 합치거나 나눈 뒤 폴더 정리를 실행하세요.{" "}
            {bridgePlanSummary.reviewCount > 0 ? (
              <span style={{ color: "#B45309" }}>경계 확인 {bridgePlanSummary.reviewCount}곳</span>
            ) : null}
          </>
        ) : fastAnalyzeMode ? (
          <>
            <strong>⚡ 빠른 분석 완료</strong> — 파일이 이동되지 않았습니다. 씬 이름을 확인·수정하고 <strong>폴더 정리 실행</strong>을 눌러 실제로 파일을 이동하세요.
          </>
        ) : (
          <>
            <strong>🔍 하이브리드 분류 완료</strong> — 원본은 아직 이동되지 않았습니다. 경계 이유를 검토하고 Scene을 승인한 뒤 폴더 정리를 실행하세요.{" "}
            {boundaryReviewCount > 0 ? (
              <span style={{ color: "#B45309" }}>검토 필요 {boundaryReviewCount}건</span>
            ) : null}
          </>
        )}
        {aiAnalysisPending ? <span style={{ marginLeft: 8, color: C.teal }}>AI 분석 중...</span> : null}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 11, color: C.muted }}>승인 {approvedCount}/{sceneCount}</div>
        <button
          type="button"
          onClick={onApproveAll}
          style={{
            padding: "7px 14px",
            borderRadius: 7,
            border: "none",
            background: "#37C39D",
            color: "#103E36",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          전체 승인
        </button>
      </div>

      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          background: C.surface,
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={() => onEvaluationModeChange(!evaluationMode)}
          aria-expanded={evaluationMode}
          style={{
            width: "100%",
            padding: "10px 14px",
            border: "none",
            background: "transparent",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            fontWeight: 600,
            color: C.teal,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <span>정확도 평가 모드</span>
          <span>{evaluationMode ? "접기 ▴" : "열기 ▾"}</span>
        </button>
        {evaluationMode ? (
          <div
            style={{
              padding: "12px 14px",
              borderTop: `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
              실제 Scene이 시작되는 사진을 정답 경계로 추가하세요. 자동 경계와 ±1장 허용으로 비교합니다.
            </div>
            {files.length > 1 ? (
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  value={groundTruthSelection}
                  onChange={(event) => onGroundTruthSelectionChange(Number(event.target.value))}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 30,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    fontSize: 10,
                    fontFamily: "inherit",
                  }}
                >
                  {files.slice(1).map((file, index) => (
                    <option key={`${file.name}-${index}`} value={index + 1}>
                      {file.name}부터 새 Scene
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onGroundTruthBoundariesChange(
                    Array.from(new Set([...groundTruthBoundaries, groundTruthSelection])).sort((a, b) => a - b),
                  )}
                  style={{
                    padding: "0 10px",
                    border: "none",
                    borderRadius: 6,
                    background: "#37C39D",
                    color: "#103E36",
                    fontSize: 10,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  정답 추가
                </button>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {groundTruthBoundaries.map((boundary) => (
                <button
                  key={boundary}
                  type="button"
                  onClick={() => onGroundTruthBoundariesChange(
                    groundTruthBoundaries.filter((item) => item !== boundary),
                  )}
                  style={{
                    border: "1px solid rgba(79,216,184,.30)",
                    borderRadius: 5,
                    background: "rgba(53,173,147,.12)",
                    color: "#A8F1DC",
                    fontSize: 9,
                    padding: "3px 6px",
                    cursor: "pointer",
                  }}
                >
                  {files[boundary]?.name ?? boundary} ×
                </button>
              ))}
              {groundTruthBoundaries.length === 0 ? (
                <span style={{ fontSize: 10, color: C.hint }}>정답 경계가 아직 없습니다.</span>
              ) : null}
            </div>
            <button
              type="button"
              disabled={groundTruthBoundaries.length === 0}
              onClick={calculateAccuracy}
              style={{
                alignSelf: "flex-start",
                padding: "6px 10px",
                border: `1px solid ${groundTruthBoundaries.length ? "#37C39D" : "rgba(255,255,255,.14)"}`,
                borderRadius: 6,
                background: groundTruthBoundaries.length ? "#37C39D" : "transparent",
                color: groundTruthBoundaries.length ? "#103E36" : "rgba(255,255,255,.30)",
                fontSize: 10,
                fontWeight: 500,
                cursor: groundTruthBoundaries.length ? "pointer" : "default",
                fontFamily: "inherit",
              }}
            >
              평가 계산
            </button>
            {accuracyReport ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))",
                  gap: 6,
                }}
              >
                {([
                  ["Precision", accuracyReport.boundaryPrecision],
                  ["Recall", accuracyReport.boundaryRecall],
                  ["Boundary F1", accuracyReport.boundaryF1],
                  ["Scene Purity", accuracyReport.scenePurity],
                  ["과분할률", accuracyReport.overSegmentationRate],
                  ["미분할률", accuracyReport.underSegmentationRate],
                ] as const).map(([label, value]) => (
                  <div
                    key={label}
                    style={{ padding: 8, borderRadius: 6, background: C.bg, fontSize: 9, color: C.muted }}
                  >
                    <strong style={{ display: "block", fontSize: 13, color: C.teal }}>
                      {Math.round(value * 100)}%
                    </strong>
                    {label}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {activeMergeCount > 0 || activeSplitCount > 0 ? (
        <div
          style={{
            padding: "10px 14px",
            background: C.light,
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            fontSize: 11,
            color: C.muted,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 500, color: C.txt }}>AI 씬 분석 결과</span>
          {activeMergeCount > 0 ? (
            <span
              style={{
                background: "#EAF4F2",
                color: "#155855",
                borderRadius: 5,
                padding: "2px 8px",
                fontWeight: 500,
              }}
            >
              🔗 병합 후보 {activeMergeCount}건
            </span>
          ) : null}
          {activeSplitCount > 0 ? (
            <span
              style={{
                background: "#FFEDD5",
                color: "#C2410C",
                borderRadius: 5,
                padding: "2px 8px",
                fontWeight: 500,
              }}
            >
              ✂️ 분리 유지 추천 {activeSplitCount}건
            </span>
          ) : null}
          <span style={{ color: C.hint }}>씬 사이 카드를 확인하세요</span>
        </div>
      ) : null}
    </>
  );
}
