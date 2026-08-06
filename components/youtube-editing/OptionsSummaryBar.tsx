"use client";

import { ChevronDown, ChevronUp, Sliders } from "lucide-react";
import { C, R } from "@/lib/theme";
import type { Segment } from "@/lib/youtube-editing/types";

function summaryText(segment: Segment): string {
  const camera = segment.camera.length
    ? segment.camera.length > 1 ? `${segment.camera[0]} 외 ${segment.camera.length - 1}` : segment.camera[0]
    : "카메라 없음";
  const visual = segment.visual.enabled ? segment.visual.type : "자료 없음";
  return [camera, segment.caption.type, visual, segment.soundEffect, segment.transition, segment.template].join("  ·  ");
}

// 카메라/자막/자료화면/효과음/전환/템플릿 6개 카드는 기본으로 접어두고 한 줄 요약만 보여준다 —
// 손글씨 캔버스가 화면의 핵심이라 이 옵션 영역이 상시 큰 자리를 차지하면 안 된다.
export default function OptionsSummaryBar({
  segment,
  expanded,
  onToggle,
}: {
  segment: Segment;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 10px",
        borderRadius: R.sm, border: `1px solid ${expanded ? C.teal : C.border}`, background: expanded ? C.mint : "#fff",
        color: C.ink, cursor: "pointer", textAlign: "left",
      }}
    >
      <Sliders size={13} color={C.teal} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11.5, color: C.muted, fontWeight: 600 }}>
        {summaryText(segment)}
      </span>
      {expanded ? <ChevronUp size={14} color={C.muted} /> : <ChevronDown size={14} color={C.muted} />}
    </button>
  );
}
