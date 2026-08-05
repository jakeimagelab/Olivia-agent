"use client";

import { Scissors, Trash2 } from "lucide-react";
import { C, R } from "@/lib/theme";
import type { Segment } from "@/lib/youtube-editing/types";

export default function CurrentSegmentHeader({
  segment,
  index,
  total,
  onTextChange,
  onSplit,
  onDelete,
}: {
  segment: Segment;
  index: number;
  total: number;
  onTextChange: (text: string) => void;
  onSplit: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.hint }}>
          {String(index + 1).padStart(2, "0")} / {total}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={onSplit}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 10px",
              borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
            }}
          >
            <Scissors size={12} />문장 분리
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="문장 삭제"
            style={{
              width: 32, height: 32, borderRadius: R.sm, border: `1px solid ${C.border}`,
              background: "#fff", color: C.danger, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <textarea
        value={segment.scriptText}
        onChange={(e) => onTextChange(e.target.value)}
        rows={2}
        placeholder="이 장면의 대사를 입력하세요."
        style={{
          width: "100%", resize: "vertical", boxSizing: "border-box", border: "none", outline: "none",
          fontSize: 22, fontWeight: 800, color: C.ink, lineHeight: 1.5, fontFamily: "inherit", background: "transparent", padding: 0,
        }}
      />
    </div>
  );
}
