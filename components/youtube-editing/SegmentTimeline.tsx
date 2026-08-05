"use client";

import { FileImage, User } from "lucide-react";
import { C, R } from "@/lib/theme";
import type { Segment } from "@/lib/youtube-editing/types";

export default function SegmentTimeline({
  segments,
  selectedId,
  onSelect,
}: {
  segments: Segment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!segments.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, overflowX: "auto", padding: "4px 2px 8px" }}>
      <div style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: C.ink, paddingRight: 4 }}>
        전체 장면 미리보기 <span style={{ color: C.hint, fontWeight: 700 }}>(총 {segments.length}장면)</span>
      </div>
      {segments.map((segment, index) => {
        const active = segment.id === selectedId;
        return (
          <button
            key={segment.id}
            type="button"
            onClick={() => onSelect(segment.id)}
            style={{
              flexShrink: 0, width: 92, textAlign: "left", cursor: "pointer",
              border: `1.5px solid ${active ? "#2563EB" : C.border}`, borderRadius: R.md,
              background: active ? "#EEF3FF" : "#fff", padding: 8,
            }}
          >
            <div style={{
              width: "100%", height: 44, borderRadius: 6, background: segment.visual.enabled ? C.mint : "#F1EFEA",
              display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6,
            }}>
              {segment.visual.enabled ? <FileImage size={16} color={C.sage} /> : <User size={16} color={C.hint} />}
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: active ? "#2563EB" : C.ink }}>{String(index + 1).padStart(2, "0")}</div>
            <div style={{ fontSize: 9.5, color: C.hint }}>~{segment.estimatedDurationSec ?? "-"}초</div>
          </button>
        );
      })}
    </div>
  );
}
