"use client";

import { C } from "../PhotoSortingWorkspace";

export type ClassificationUiMode = "ai-auto" | "advanced";

export default function ClassificationModeToggle({ mode, onChange }: { mode: ClassificationUiMode; onChange: (mode: ClassificationUiMode) => void }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 9, color: "rgba(255,255,255,.58)", fontSize: 12 }}>
      <span>분류 방식</span>
      <select
        value={mode}
        onChange={(event) => onChange(event.target.value as ClassificationUiMode)}
        style={{ minHeight: 36, border: "1px solid rgba(255,255,255,.18)", borderRadius: 8, padding: "0 28px 0 10px", background: "#fff", color: C.teal, font: "inherit", fontSize: 12.5, fontWeight: 600 }}
      >
        <option value="ai-auto">AI 자동 분류</option>
        <option value="advanced">고급 설정</option>
      </select>
    </label>
  );
}
