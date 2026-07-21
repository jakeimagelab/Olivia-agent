"use client";

import { Sparkles } from "lucide-react";
import { C } from "@/lib/theme";

export default function OliviaToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      style={{
        display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700,
        padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer",
        background: enabled ? C.orange : C.mint, color: enabled ? "#fff" : C.muted,
      }}
      title={enabled ? "올리비아가 이 방에 참여 중입니다 — 클릭하면 끄기" : "이 방에 올리비아를 참여시킵니다"}
    >
      <Sparkles size={13} /> 올리비아 {enabled ? "ON" : "OFF"}
    </button>
  );
}
