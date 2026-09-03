"use client";

import { Card, C } from "../PhotoSortingWorkspace";
import type { FolderShootingPattern } from "@/lib/photo-classifier/pattern-analysis";

export default function FolderAnalysisSummary({ analyzing, pattern, fileCount }: { analyzing: boolean; pattern: FolderShootingPattern | null; fileCount: number }) {
  if (analyzing) {
    return (
      <Card>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>폴더 분석 중…</div>
          <div style={{ fontSize: 11, color: C.hint }}>시간 간격과 사진 변화를 살펴보는 중이에요.</div>
        </div>
      </Card>
    );
  }
  if (!pattern) {
    return (
      <Card>
        <div style={{ padding: 20, fontSize: 12, color: C.hint, lineHeight: 1.7 }}>
          폴더를 선택하면 AI가 먼저 분석해서 이번 촬영에 맞는 분류 기준을 추천해드려요.
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: C.teal, lineHeight: 1.5 }}>
          {pattern.recommendedSceneCountHint
            ? `AI가 약 ${pattern.recommendedSceneCountHint}개 Scene으로 분류하는 것을 추천합니다.`
            : "AI가 이번 촬영 패턴을 분석했습니다."}
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>분석: {fileCount.toLocaleString()}장 · {pattern.shootingType}</div>
        {pattern.observations.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {pattern.observations.map((observation, index) => (
              <li key={index} style={{ fontSize: 11, color: C.hint, lineHeight: 1.6 }}>{observation}</li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
