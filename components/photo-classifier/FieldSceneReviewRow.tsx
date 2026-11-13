"use client";

import type { CSSProperties } from "react";
import type { FieldScene } from "@/lib/photo-classifier/types";
import { formatTime } from "@/lib/photo-classifier/workspaceFormatting";
import { C } from "./PhotoSortingUi";

export function FieldSceneReviewRow({
  scene,
  listIndex,
  sceneCount,
  splitPosition,
  onSceneFocus,
  onSceneNameChange,
  onSceneNameCommit,
  onSuggestedNameApply,
  onSplitPositionChange,
  onSplitScene,
  onMergeScenes,
  onApproveScene,
}: {
  scene: FieldScene;
  listIndex: number;
  sceneCount: number;
  splitPosition: number;
  onSceneFocus: (sceneIndex: number) => void;
  onSceneNameChange: (sceneIndex: number, value: string) => void;
  onSceneNameCommit: (scene: FieldScene) => void;
  onSuggestedNameApply: (sceneIndex: number, value: string) => void;
  onSplitPositionChange: (sceneIndex: number, value: number) => void;
  onSplitScene: (listIndex: number, offset: number) => void;
  onMergeScenes: (fromIndex: number, toIndex: number) => void;
  onApproveScene: (listIndex: number) => void;
}) {
  return (
    <>
      {scene.boundaryBefore ? <SceneBoundarySummary scene={scene} /> : null}

      <div
        onClick={() => onSceneFocus(scene.index)}
        style={{ borderBottom: `1px solid ${C.border}`, padding: "12px 20px" }}
      >
        <div
          className="pc-mobile-form-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "100px auto 1fr auto",
            gap: 12,
            alignItems: "start",
          }}
        >
          <SceneEdgePreviews scene={scene} />
          <div
            style={{
              fontSize: 10,
              color: C.hint,
              fontFamily: "monospace",
              whiteSpace: "nowrap",
            }}
          >
            {scene.fileCount}장
            <br />
            {formatTime(scene.startTime)}
            <br />
            {formatTime(scene.endTime)}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {scene.nameLoading ? (
              <div
                style={{
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  fontSize: 12,
                  color: C.hint,
                }}
              >
                AI 분석 중...
              </div>
            ) : (
              <input
                value={scene.editedName}
                onChange={(event) => onSceneNameChange(listIndex, event.target.value)}
                onBlur={() => onSceneNameCommit(scene)}
                style={{
                  width: "100%",
                  height: 34,
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "0 10px",
                  fontSize: 12,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
            )}

            {scene.suggestedName && !scene.nameLoading ? (
              <div style={{ fontSize: 10, color: C.muted }}>
                추천:{" "}
                <button
                  type="button"
                  onClick={() => onSuggestedNameApply(listIndex, scene.suggestedName ?? scene.editedName)}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    color: C.teal,
                    fontSize: 10,
                    fontFamily: "inherit",
                    fontWeight: 500,
                  }}
                >
                  {scene.suggestedName}
                </button>
                {scene.aiConfidence ? (
                  <span style={{ marginLeft: 4, color: C.hint }}>
                    {Math.round(scene.aiConfidence * 100)}%
                  </span>
                ) : null}
              </div>
            ) : null}

            {scene.sceneType && !scene.nameLoading ? (
              <div
                style={{
                  fontSize: 9,
                  background: C.light,
                  color: C.teal,
                  display: "inline-block",
                  padding: "1px 8px",
                  borderRadius: 4,
                  width: "fit-content",
                }}
              >
                {scene.sceneType}
                {scene.aiReason ? <span style={{ color: C.muted, marginLeft: 4 }}>{scene.aiReason}</span> : null}
              </div>
            ) : null}

            <SceneNamingDetails scene={scene} />

            {!scene.sceneDir && scene.files.length > 1 ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                <select
                  value={splitPosition}
                  onChange={(event) => onSplitPositionChange(scene.index, Number(event.target.value))}
                  style={{
                    minWidth: 0,
                    flex: 1,
                    height: 28,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    fontSize: 9,
                    fontFamily: "inherit",
                  }}
                >
                  {scene.files.slice(1).map((file, offset) => (
                    <option key={file.name} value={offset + 1}>
                      {file.name} 앞에서 분할
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onSplitScene(listIndex, splitPosition)}
                  style={{
                    height: 28,
                    padding: "0 8px",
                    borderRadius: 6,
                    border: `1px solid ${C.border}`,
                    background: C.surface,
                    color: C.teal,
                    fontSize: 9,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  분할
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {listIndex > 0 ? (
              <button
                type="button"
                onClick={() => onMergeScenes(listIndex - 1, listIndex)}
                style={secondaryActionStyle}
              >
                ↑ 합치기
              </button>
            ) : null}
            {listIndex < sceneCount - 1 ? (
              <button
                type="button"
                onClick={() => onMergeScenes(listIndex, listIndex + 1)}
                style={secondaryActionStyle}
              >
                ↓ 합치기
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onApproveScene(listIndex)}
              disabled={scene.approved}
              style={{
                fontSize: 9,
                padding: "4px 8px",
                borderRadius: 4,
                border: `1px solid ${scene.approved ? "rgba(79,216,184,.30)" : "#37C39D"}`,
                background: scene.approved ? "rgba(53,173,147,.12)" : "#37C39D",
                cursor: scene.approved ? "default" : "pointer",
                color: scene.approved ? "#A8F1DC" : "#103E36",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              {scene.approved ? "승인됨" : "승인"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function SceneBoundarySummary({ scene }: { scene: FieldScene }) {
  const boundary = scene.boundaryBefore;
  if (!boundary) return null;

  return (
    <div
      style={{
        margin: "8px 12px 0",
        padding: "9px 12px",
        borderRadius: 8,
        background: boundary.needsReview ? "rgba(214,188,125,.12)" : "rgba(53,173,147,.12)",
        border: `1px solid ${boundary.needsReview ? "rgba(214,188,125,.36)" : "rgba(79,216,184,.30)"}`,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 10 }}>
        <strong style={{ color: boundary.needsReview ? "#D6BC7D" : "#A8F1DC" }}>
          경계 {Math.round(boundary.score * 100)}%
        </strong>
        <span style={{ color: C.muted }}>{boundary.source}</span>
        {boundary.forced ? (
          <span
            style={{
              padding: "1px 5px",
              borderRadius: 4,
              background: "rgba(237,129,119,.14)",
              color: "#ED8177",
              fontWeight: 500,
            }}
          >
            강제 분리
          </span>
        ) : null}
        {boundary.needsReview ? (
          <span
            style={{
              padding: "1px 5px",
              borderRadius: 4,
              background: "rgba(214,188,125,.12)",
              color: "#D6BC7D",
              fontWeight: 500,
            }}
          >
            검토 필요
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6, marginTop: 3 }}>
        {boundary.reasons.join(" · ")}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
        {([
          ["인물", boundary.features.personChangeScore],
          ["장소", boundary.features.locationChangeScore],
          ["장비", boundary.features.equipmentChangeScore],
          ["의미", boundary.features.sceneTypeChangeScore],
          ["시각", boundary.features.visualChangeScore],
          ["자세", boundary.features.poseChangeScore],
        ] as const).map(([label, value]) => (
          <span
            key={label}
            style={{
              fontSize: 8,
              padding: "1px 5px",
              borderRadius: 4,
              background: "rgba(255,255,255,.06)",
              color: C.muted,
            }}
          >
            {label} {Math.round(value * 100)}
          </span>
        ))}
      </div>
    </div>
  );
}

function SceneEdgePreviews({ scene }: { scene: FieldScene }) {
  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {Array.from(new Set([0, scene.files.length - 1])).map((fileIndex, previewIndex) => (
        scene.files[fileIndex]?.thumbUrl ? (
          <img
            key={previewIndex}
            src={scene.files[fileIndex].thumbUrl ?? undefined}
            style={{ width: 44, height: 32, objectFit: "cover", borderRadius: 3 }}
            alt={previewIndex === 0 ? "Scene 시작" : "Scene 마지막"}
          />
        ) : (
          <div
            key={previewIndex}
            style={{ width: 44, height: 32, background: C.border, borderRadius: 3 }}
          />
        )
      ))}
    </div>
  );
}

function SceneNamingDetails({ scene }: { scene: FieldScene }) {
  const hasDetails = scene.aiProcedureName
    || scene.aiEquipmentName
    || scene.aiHandpieceName
    || (scene.aiNamingEvidence?.length ?? 0) > 0;
  if (!hasDetails || scene.nameLoading) return null;

  return (
    <details
      style={{
        fontSize: 9,
        color: C.muted,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: "4px 7px",
        background: C.surface,
      }}
    >
      <summary style={{ cursor: "pointer", color: C.teal, fontWeight: 500 }}>이름 분석 보기</summary>
      <div style={{ display: "grid", gap: 2, marginTop: 5, lineHeight: 1.45 }}>
        {scene.aiEquipmentName ? (
          <span>
            장비: {scene.aiEquipmentName}{scene.aiEquipmentBrand ? ` · ${scene.aiEquipmentBrand}` : ""}
          </span>
        ) : null}
        {scene.aiHandpieceName ? <span>핸드피스: {scene.aiHandpieceName}</span> : null}
        {scene.aiProcedureName ? (
          <span>
            시술: {scene.aiProcedureName}
            {scene.aiProcedureConfidence != null ? ` · ${Math.round(scene.aiProcedureConfidence * 100)}%` : ""}
          </span>
        ) : null}
        {(scene.aiNamingEvidence ?? []).map((evidence, evidenceIndex) => (
          <span key={`${evidence}-${evidenceIndex}`}>근거: {evidence}</span>
        ))}
      </div>
    </details>
  );
}

const secondaryActionStyle: CSSProperties = {
  fontSize: 9,
  padding: "4px 8px",
  borderRadius: 4,
  border: `1px solid ${C.border}`,
  background: C.surface,
  cursor: "pointer",
  color: C.muted,
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};
