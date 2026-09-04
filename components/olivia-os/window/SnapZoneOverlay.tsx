"use client";

import { useOliviaDesktopStore, DESKTOP_TOPBAR_HEIGHT, DESKTOP_DOCK_SAFE_AREA } from "@/lib/store/useOliviaDesktopStore";
import { resolveSnapBounds } from "./snapZones";

// 창을 화면 가장자리로 드래그하는 동안 "지금 놓으면 여기로 스냅됩니다"를 보여주는 반투명
// 미리보기(스펙 2-5) — 4개 프리셋(50/50, 70/30, 30/70, 전체)과 1:1 대응.
export function SnapZoneOverlay() {
  const dragHint = useOliviaDesktopStore((state) => state.dragHint);
  if (!dragHint || typeof window === "undefined") return null;

  const bounds = resolveSnapBounds(dragHint, window.innerWidth, window.innerHeight, DESKTOP_TOPBAR_HEIGHT, DESKTOP_DOCK_SAFE_AREA);

  return (
    <div
      style={{
        position: "fixed",
        left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height,
        background: "rgba(21, 88, 85, 0.16)",
        border: "2px solid rgba(21, 88, 85, 0.5)",
        borderRadius: 14,
        zIndex: 20000,
        pointerEvents: "none",
        transition: "left 90ms, top 90ms, width 90ms, height 90ms",
      }}
    />
  );
}
