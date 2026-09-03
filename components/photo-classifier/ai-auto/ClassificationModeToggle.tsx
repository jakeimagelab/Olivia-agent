"use client";

import { C } from "../PhotoSortingWorkspace";

export type ClassificationUiMode = "ai-auto" | "advanced";

export default function ClassificationModeToggle({ mode, onChange }: { mode: ClassificationUiMode; onChange: (mode: ClassificationUiMode) => void }) {
  return (
    <div style={{ display: "flex", border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", width: "fit-content" }}>
      {([["ai-auto", "✨ AI 자동 분류"], ["advanced", "⚙️ 고급 설정"]] as const).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          style={{
            padding: "10px 18px", border: "none", cursor: "pointer", fontFamily: "inherit",
            fontSize: 12.5, fontWeight: mode === value ? 900 : 700,
            background: mode === value ? C.teal : C.white,
            color: mode === value ? "#fff" : C.muted,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
