"use client";

import { Eraser, Highlighter, Pen, Redo2, Trash2, Undo2 } from "lucide-react";
import { DRAW_COLORS, DRAW_WIDTHS } from "@/lib/youtube-editing/constants";
import type { DrawTool } from "@/lib/youtube-editing/types";
import { C, R } from "@/lib/theme";

export default function DrawingToolbar({
  tool, onToolChange,
  color, onColorChange,
  width, onWidthChange,
  canUndo, canRedo, onUndo, onRedo, onClear,
}: {
  tool: DrawTool; onToolChange: (tool: DrawTool) => void;
  color: string; onColorChange: (color: string) => void;
  width: number; onWidthChange: (width: number) => void;
  canUndo: boolean; canRedo: boolean;
  onUndo: () => void; onRedo: () => void; onClear: () => void;
}) {
  const toolBtn = (active: boolean): React.CSSProperties => ({
    width: 38, height: 38, borderRadius: R.sm, border: `1px solid ${active ? C.teal : C.border}`,
    background: active ? C.mint : "#fff", color: active ? C.teal : C.muted,
    display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
  });
  const iconBtn = (enabled: boolean): React.CSSProperties => ({
    width: 38, height: 38, borderRadius: R.sm, border: `1px solid ${C.border}`,
    background: "#fff", color: C.muted, display: "inline-flex", alignItems: "center", justifyContent: "center",
    cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.4, flexShrink: 0,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 0" }}>
      <button type="button" style={toolBtn(tool === "pen")} onClick={() => onToolChange("pen")} aria-label="펜"><Pen size={16} /></button>
      <button type="button" style={toolBtn(tool === "highlighter")} onClick={() => onToolChange("highlighter")} aria-label="형광펜"><Highlighter size={16} /></button>
      <button type="button" style={toolBtn(tool === "eraser")} onClick={() => onToolChange("eraser")} aria-label="지우개"><Eraser size={16} /></button>

      <div style={{ width: 1, height: 24, background: C.border, margin: "0 2px" }} />

      {DRAW_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onColorChange(c)}
          aria-label={`색상 ${c}`}
          style={{
            width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", padding: 0, flexShrink: 0,
            border: color === c ? `2px solid ${C.teal}` : "1px solid rgba(0,0,0,.12)",
          }}
        />
      ))}

      <select
        value={width}
        onChange={(e) => onWidthChange(Number(e.target.value))}
        style={{ height: 34, borderRadius: R.sm, border: `1px solid ${C.border}`, fontSize: 12, padding: "0 6px", color: C.ink, background: "#fff" }}
      >
        {DRAW_WIDTHS.map((w) => <option key={w} value={w}>{w}px</option>)}
      </select>

      <div style={{ width: 1, height: 24, background: C.border, margin: "0 2px" }} />

      <button type="button" disabled={!canUndo} onClick={onUndo} aria-label="실행 취소" style={iconBtn(canUndo)}><Undo2 size={16} /></button>
      <button type="button" disabled={!canRedo} onClick={onRedo} aria-label="다시 실행" style={iconBtn(canRedo)}><Redo2 size={16} /></button>

      <button
        type="button"
        onClick={onClear}
        style={{
          height: 34, padding: "0 12px", borderRadius: R.sm, border: `1px solid ${C.border}`,
          background: "#fff", color: C.danger, fontSize: 12, fontWeight: 700, cursor: "pointer", marginLeft: "auto", flexShrink: 0,
        }}
      >
        <Trash2 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />전체 지우기
      </button>
    </div>
  );
}
