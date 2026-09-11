"use client";

import { useOliviaDesktopStore, DESKTOP_DOCK_SAFE_AREA } from "@/lib/store/useOliviaDesktopStore";
import { resolveSnapBounds } from "./snapZones";

// 창을 화면 가장자리로 드래그하는 동안 "지금 놓으면 여기로 스냅됩니다"를 보여주는 반투명
// 미리보기(스펙 2-5) — 4개 프리셋(50/50, 70/30, 30/70, 전체)과 1:1 대응.
export function SnapZoneOverlay() {
  const dragHint = useOliviaDesktopStore((state) => state.dragHint);
  const dockHint = useOliviaDesktopStore((state) => state.dockHint);
  const width = useOliviaDesktopStore((state) => state.workspaceWidth);
  const height = useOliviaDesktopStore((state) => state.workspaceHeight);
  if ((!dragHint && !dockHint) || width <= 0 || height <= 0) return null;

  const bounds = dockHint?.bounds ?? resolveSnapBounds(dragHint!, width, height, DESKTOP_DOCK_SAFE_AREA);

  return (
    <div
      style={{
        position: "absolute",
        left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height,
        background: dockHint ? "rgba(232, 93, 44, 0.13)" : "rgba(21, 88, 85, 0.16)",
        border: `2px solid ${dockHint ? "rgba(232, 93, 44, 0.72)" : "rgba(21, 88, 85, 0.5)"}`,
        borderRadius: 14,
        zIndex: 5000,
        pointerEvents: "none",
        transition: "left 90ms, top 90ms, width 90ms, height 90ms",
      }}
    >
      {dockHint ? (
        <span style={{ position: "absolute", left: -2, top: 18, transform: "translateX(-100%)", padding: "5px 9px", borderRadius: "8px 0 0 8px", background: "#e85d2c", color: "white", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
          Olivia 연결
        </span>
      ) : null}
    </div>
  );
}
