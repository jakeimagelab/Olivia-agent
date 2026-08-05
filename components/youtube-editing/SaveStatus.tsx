"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { C } from "@/lib/theme";
import type { SaveState } from "@/lib/youtube-editing/types";

const CONFIG: Record<Exclude<SaveState, "idle">, { icon: React.ReactNode; label: string; color: string }> = {
  saving: { icon: <Loader2 size={13} />, label: "저장 중", color: C.muted },
  saved: { icon: <Check size={13} />, label: "저장됨", color: C.success },
  error: { icon: <AlertCircle size={13} />, label: "저장 실패", color: C.danger },
};

export default function SaveStatus({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const config = CONFIG[state];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: config.color }}>
      {config.icon}{config.label}
    </span>
  );
}
