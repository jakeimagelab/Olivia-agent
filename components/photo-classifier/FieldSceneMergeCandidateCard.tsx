"use client";

import type { ReactNode } from "react";
import type { SceneMergeCandidate } from "@/lib/photo-classifier/scene-merge-types";
import type { FieldScene } from "@/lib/photo-classifier/types";

export function FieldSceneMergeCandidateCard({
  scene,
  nextScene,
  candidate,
  onMerge,
  onKeepSplit,
}: {
  scene: FieldScene;
  nextScene: FieldScene;
  candidate: SceneMergeCandidate;
  onMerge: () => void;
  onKeepSplit: () => void;
}) {
  const recommendsMerge = candidate.recommendedAction === "merge";

  return (
    <div
      style={{
        margin: "0 12px",
        padding: "10px 14px",
        borderRadius: 8,
        border: recommendsMerge ? "1.5px solid #B8CBD8" : "1.5px solid #FED7AA",
        background: recommendsMerge ? "rgba(53,173,147,.12)" : "rgba(214,188,125,.12)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13 }}>{recommendsMerge ? "🔗" : "✂️"}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: recommendsMerge ? "#155855" : "#C2410C",
            }}
          >
            {recommendsMerge ? "병합 후보" : "분리 유지 추천"}
          </span>
          {recommendsMerge ? (
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

      <div
        style={{
          fontSize: 10,
          color: recommendsMerge ? "#155855" : "#9A3412",
          lineHeight: 1.6,
        }}
      >
        {candidate.reason}
      </div>

      {candidate.matchedSignals.length > 0 && recommendsMerge ? (
        <SignalList signals={candidate.matchedSignals} tone="merge" />
      ) : null}

      {candidate.blockedSignals.length > 0 && !recommendsMerge ? (
        <SignalList signals={candidate.blockedSignals.slice(0, 3)} tone="split" />
      ) : null}

      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        {recommendsMerge ? (
          <>
            <CandidateActionButton primary onClick={onMerge}>병합하기</CandidateActionButton>
            <CandidateActionButton onClick={onKeepSplit}>분리 유지</CandidateActionButton>
          </>
        ) : (
          <>
            <CandidateActionButton primary onClick={onKeepSplit}>분리 유지</CandidateActionButton>
            <CandidateActionButton onClick={onMerge}>병합하기</CandidateActionButton>
          </>
        )}
      </div>
    </div>
  );
}

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

function SignalList({ signals, tone }: { signals: string[]; tone: "merge" | "split" }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {signals.map((signal, signalIndex) => (
        <span
          key={`${signal}-${signalIndex}`}
          style={{
            fontSize: 9,
            background: tone === "merge" ? "#EAF4F2" : "#FFEDD5",
            color: tone === "merge" ? "#155855" : "#9A3412",
            borderRadius: 4,
            padding: "1px 6px",
          }}
        >
          {signal}
        </span>
      ))}
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
  children: ReactNode;
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
