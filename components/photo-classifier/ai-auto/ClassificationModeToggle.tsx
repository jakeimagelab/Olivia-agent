"use client";

import { Settings2, Sparkles } from "lucide-react";
import { WORKSPACE_COLORS as C } from "@/components/workspace-shell/theme";

export type ClassificationUiMode = "ai-auto" | "advanced";

export default function ClassificationModeToggle({ mode, onChange }: { mode: ClassificationUiMode; onChange: (mode: ClassificationUiMode) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, borderRadius: 10, padding: 4, background: "#EDF0EE", width: "fit-content" }}>
      {([
        ["ai-auto", "AI 자동 분류", Sparkles],
        ["advanced", "고급 설정", Settings2],
      ] as const).map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "8px 14px", border: "none", borderRadius: 8,
            cursor: "pointer", fontFamily: "inherit",
            fontSize: 12.5, fontWeight: mode === value ? 600 : 500,
            background: mode === value ? C.white : "transparent",
            color: mode === value ? "#155855" : C.muted,
            boxShadow: mode === value ? "0 1px 4px rgba(21, 88, 85, .10)" : "none",
          }}
        >
          <Icon size={15} strokeWidth={2} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
