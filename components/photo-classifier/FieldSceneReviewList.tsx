"use client";

import type { FieldScene } from "@/lib/photo-classifier/types";
import type { SceneMergeCandidate } from "@/lib/photo-classifier/scene-merge-types";
import { formatTime } from "@/lib/photo-classifier/workspaceFormatting";
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
              {scene.boundaryBefore ? (
                <div
                  style={{
                    margin: "8px 12px 0",
                    padding: "9px 12px",
                    borderRadius: 8,
                    background: scene.boundaryBefore.needsReview
                      ? "rgba(214,188,125,.12)"
                      : "rgba(53,173,147,.12)",
                    border: `1px solid ${scene.boundaryBefore.needsReview
                      ? "rgba(214,188,125,.36)"
                      : "rgba(79,216,184,.30)"}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      fontSize: 10,
                    }}
                  >
                    <strong style={{ color: scene.boundaryBefore.needsReview ? "#D6BC7D" : "#A8F1DC" }}>
                      경계 {Math.round(scene.boundaryBefore.score * 100)}%
                    </strong>
                    <span style={{ color: C.muted }}>{scene.boundaryBefore.source}</span>
                    {scene.boundaryBefore.forced ? (
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
                    {scene.boundaryBefore.needsReview ? (
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
                    {scene.boundaryBefore.reasons.join(" · ")}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                    {([
                      ["인물", scene.boundaryBefore.features.personChangeScore],
                      ["장소", scene.boundaryBefore.features.locationChangeScore],
                      ["장비", scene.boundaryBefore.features.equipmentChangeScore],
                      ["의미", scene.boundaryBefore.features.sceneTypeChangeScore],
                      ["시각", scene.boundaryBefore.features.visualChangeScore],
                      ["자세", scene.boundaryBefore.features.poseChangeScore],
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
              ) : null}

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
                    {(scene.aiProcedureName
                      || scene.aiEquipmentName
                      || scene.aiHandpieceName
                      || (scene.aiNamingEvidence?.length ?? 0) > 0) && !scene.nameLoading ? (
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
                        <summary style={{ cursor: "pointer", color: C.teal, fontWeight: 500 }}>
                          이름 분석 보기
                        </summary>
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
                              {scene.aiProcedureConfidence != null
                                ? ` · ${Math.round(scene.aiProcedureConfidence * 100)}%`
                                : ""}
                            </span>
                          ) : null}
                          {(scene.aiNamingEvidence ?? []).map((evidence, evidenceIndex) => (
                            <span key={`${evidence}-${evidenceIndex}`}>근거: {evidence}</span>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    {!scene.sceneDir && scene.files.length > 1 ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                        <select
                          value={splitPositions[scene.index] ?? 1}
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
                          onClick={() => onSplitScene(listIndex, splitPositions[scene.index] ?? 1)}
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
                    {listIndex < scenes.length - 1 ? (
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

              {candidate ? (
                <div
                  style={{
                    margin: "0 12px",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: candidate.recommendedAction === "merge"
                      ? "1.5px solid #B8CBD8"
                      : "1.5px solid #FED7AA",
                    background: candidate.recommendedAction === "merge"
                      ? "rgba(53,173,147,.12)"
                      : "rgba(214,188,125,.12)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13 }}>{candidate.recommendedAction === "merge" ? "🔗" : "✂️"}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: candidate.recommendedAction === "merge" ? "#155855" : "#C2410C",
                        }}
                      >
                        {candidate.recommendedAction === "merge" ? "병합 후보" : "분리 유지 추천"}
                      </span>
                      {candidate.recommendedAction === "merge" ? (
                        <span
                          style={{
                            fontSize: 10,
                            color: "#A8F1DC",
                            background: "rgba(53,173,147,.12)",
                            borderRadius: 4,
                            padding: "1px 6px",
                          }}
                        >
                          유사도 {Math.round(candidate.mergeScore * 100)}%
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 10,
                            color: "#D6BC7D",
                            background: "rgba(214,188,125,.12)",
                            borderRadius: 4,
                            padding: "1px 6px",
                          }}
                        >
                          전환 강도 {Math.round(candidate.transitionStrength * 100)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {nextScene ? (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "stretch",
                        background: "rgba(0,0,0,.04)",
                        borderRadius: 6,
                        padding: "6px 8px",
                      }}
                    >
                      <ScenePreview scene={scene} />
                      <div style={{ width: 1, background: "#D1D5DB", margin: "0 2px" }} />
                      <ScenePreview scene={nextScene} />
                    </div>
                  ) : null}

                  <div
                    style={{
                      fontSize: 10,
                      color: candidate.recommendedAction === "merge" ? "#155855" : "#9A3412",
                      lineHeight: 1.6,
                    }}
                  >
                    {candidate.reason}
                  </div>

                  {candidate.matchedSignals.length > 0 && candidate.recommendedAction === "merge" ? (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {candidate.matchedSignals.map((signal, signalIndex) => (
                        <span
                          key={`${signal}-${signalIndex}`}
                          style={{
                            fontSize: 9,
                            background: "#EAF4F2",
                            color: "#155855",
                            borderRadius: 4,
                            padding: "1px 6px",
                          }}
                        >
                          {signal}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {candidate.blockedSignals.length > 0 && candidate.recommendedAction === "keep_split" ? (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {candidate.blockedSignals.slice(0, 3).map((signal, signalIndex) => (
                        <span
                          key={`${signal}-${signalIndex}`}
                          style={{
                            fontSize: 9,
                            background: "#FFEDD5",
                            color: "#9A3412",
                            borderRadius: 4,
                            padding: "1px 6px",
                          }}
                        >
                          {signal}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                    {candidate.recommendedAction === "merge" ? (
                      <>
                        <CandidateActionButton
                          primary
                          onClick={() => onMergeScenes(listIndex, listIndex + 1, candidate.id)}
                        >
                          병합하기
                        </CandidateActionButton>
                        <CandidateActionButton onClick={() => onDismissCandidate(candidate.id)}>
                          분리 유지
                        </CandidateActionButton>
                      </>
                    ) : (
                      <>
                        <CandidateActionButton primary onClick={() => onDismissCandidate(candidate.id)}>
                          분리 유지
                        </CandidateActionButton>
                        <CandidateActionButton
                          onClick={() => onMergeScenes(listIndex, listIndex + 1, candidate.id)}
                        >
                          병합하기
                        </CandidateActionButton>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const secondaryActionStyle: React.CSSProperties = {
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

function ScenePreview({ scene }: { scene: FieldScene }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 8, color: "#6B7280", marginBottom: 3, fontWeight: 500 }}>
        {scene.editedName}
      </div>
      <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {scene.files.slice(0, 5).map((file, fileIndex) => (
          file.thumbUrl ? (
            <img
              key={`${file.name}-${fileIndex}`}
              src={file.thumbUrl}
              style={{ width: 44, height: 32, objectFit: "cover", borderRadius: 3, flexShrink: 0 }}
              alt=""
            />
          ) : (
            <div
              key={`${file.name}-${fileIndex}`}
              style={{ width: 44, height: 32, background: "#D1D5DB", borderRadius: 3, flexShrink: 0 }}
            />
          )
        ))}
      </div>
    </div>
  );
}

function CandidateActionButton({
  primary = false,
  onClick,
  children,
}: {
  primary?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "5px 12px",
        background: primary ? "#37C39D" : "rgba(255,255,255,.06)",
        color: primary ? "#103E36" : "#D9F6EE",
        border: primary ? "none" : "1px solid rgba(255,255,255,.18)",
        borderRadius: 6,
        fontSize: 10,
        fontWeight: primary ? 600 : 500,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}
