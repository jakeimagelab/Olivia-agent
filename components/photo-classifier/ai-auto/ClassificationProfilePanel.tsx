"use client";

import { Card, C } from "../PhotoSortingWorkspace";
import type { SceneWeightProfile } from "@/lib/photo-classifier/pattern-analysis";

function levelLabel(weight: number): string {
  if (weight >= 0.22) return "높음";
  if (weight >= 0.1) return "중간";
  return "낮음";
}

export default function ClassificationProfilePanel({ profile, onOpenAdvanced }: { profile: SceneWeightProfile | null; onOpenAdvanced: () => void }) {
  const rows: Array<[string, number | null]> = profile ? [
    ["인물 변화", profile.weights.personChangeScore],
    ["장소 변화", profile.weights.locationChangeScore],
    ["배경 변화", profile.weights.visualChangeScore],
    ["구도 변화", profile.weights.shotDistanceChangeScore],
  ] : [];
  return (
    <Card>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 900, color: C.teal }}>자동 분류 기준 (권장)</div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {!profile ? (
          <div style={{ fontSize: 11, color: C.hint }}>분석 전입니다.</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
              <span style={{ color: C.muted }}>시간 기준</span>
              <span style={{ fontWeight: 800, color: profile.absoluteTimeGapMinutes != null ? C.orange : C.teal }}>
                {profile.absoluteTimeGapMinutes != null ? `${profile.absoluteTimeGapMinutes}분 이상 강제 분리` : "자동"}
              </span>
            </div>
            {rows.map(([label, weight]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                <span style={{ color: C.muted }}>{label}</span>
                <span style={{ fontWeight: 800, color: C.teal }}>{levelLabel(weight ?? 0)}</span>
              </div>
            ))}
          </>
        )}
        <button
          type="button"
          onClick={onOpenAdvanced}
          style={{ marginTop: 4, padding: "9px 0", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.white, color: C.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          고급 설정 열기 →
        </button>
      </div>
    </Card>
  );
}
