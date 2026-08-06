"use client";

import { Eraser, Highlighter, Image as ImageIcon, Lasso, Pen, Printer, Redo2, Shapes, Stethoscope, Trash2, Type, Undo2 } from "lucide-react";
import { DRAW_COLORS, DRAW_WIDTHS } from "@/lib/youtube-editing/constants";
import type { DrawTool } from "@/lib/youtube-editing/types";
import { C, R } from "@/lib/theme";

const DRAW_MODE_TOOLS: { key: DrawTool; label: string; icon: React.ReactNode }[] = [
  { key: "pen", label: "펜", icon: <Pen size={16} /> },
  { key: "highlighter", label: "형광펜", icon: <Highlighter size={16} /> },
  { key: "eraser", label: "지우개", icon: <Eraser size={16} /> },
  { key: "lasso", label: "올가미", icon: <Lasso size={16} /> },
];

export default function DrawingToolbar({
  tool, onToolChange,
  color, onColorChange,
  width, onWidthChange,
  canUndo, canRedo, onUndo, onRedo, onClear,
  onInsertShape, onInsertText, onInsertImage,
  onOpenPosePopup, posePopupOpen,
  onExportPdf,
}: {
  tool: DrawTool; onToolChange: (tool: DrawTool) => void;
  color: string; onColorChange: (color: string) => void;
  width: number; onWidthChange: (width: number) => void;
  canUndo: boolean; canRedo: boolean;
  onUndo: () => void; onRedo: () => void; onClear: () => void;
  onInsertShape: () => void; onInsertText: () => void; onInsertImage: () => void;
  onOpenPosePopup: () => void; posePopupOpen: boolean;
  onExportPdf: () => void;
}) {
  const toolBtn = (active: boolean): React.CSSProperties => ({
    width: 40, height: 40, borderRadius: R.sm, border: `1px solid ${active ? C.teal : C.border}`,
    background: active ? C.mint : "#fff", color: active ? C.teal : C.muted,
    display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
    cursor: "pointer", flexShrink: 0, fontSize: 8, fontWeight: 700,
  });
  const iconBtn = (enabled: boolean): React.CSSProperties => ({
    width: 36, height: 36, borderRadius: R.sm, border: `1px solid ${C.border}`,
    background: "#fff", color: C.muted, display: "inline-flex", alignItems: "center", justifyContent: "center",
    cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.4, flexShrink: 0,
  });

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 14px" }}>
      {DRAW_MODE_TOOLS.map(({ key, label, icon }) => (
        <button key={key} type="button" style={toolBtn(tool === key)} onClick={() => onToolChange(key)} aria-label={label} title={label}>
          {icon}
        </button>
      ))}
      <button type="button" style={toolBtn(false)} onClick={onInsertShape} aria-label="도형" title="도형"><Shapes size={16} /></button>
      <button type="button" style={toolBtn(false)} onClick={onInsertText} aria-label="텍스트" title="텍스트"><Type size={16} /></button>
      <button type="button" style={toolBtn(false)} onClick={onInsertImage} aria-label="이미지" title="이미지"><ImageIcon size={16} /></button>
      <button type="button" style={toolBtn(posePopupOpen)} onClick={onOpenPosePopup} aria-label="원장 포즈" title="원장 포즈"><Stethoscope size={16} /></button>

      <div style={{ width: 1, height: 26, background: C.border, margin: "0 2px" }} />

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

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {DRAW_WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onWidthChange(w)}
            aria-label={`굵기 ${w}px`}
            style={{
              width: 26, height: 26, borderRadius: 6, border: `1px solid ${width === w ? C.teal : C.border}`,
              background: width === w ? C.mint : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span style={{ width: 14, height: Math.max(2, w - 1), borderRadius: 2, background: C.ink }} />
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 26, background: C.border, margin: "0 2px" }} />

      <button type="button" disabled={!canUndo} onClick={onUndo} aria-label="실행 취소" style={iconBtn(canUndo)}><Undo2 size={16} /></button>
      <button type="button" disabled={!canRedo} onClick={onRedo} aria-label="다시 실행" style={iconBtn(canRedo)}><Redo2 size={16} /></button>
      <button type="button" onClick={onClear} aria-label="전체 지우기" title="전체 지우기" style={iconBtn(true)}><Trash2 size={15} color={C.danger} /></button>

      <button
        type="button"
        onClick={onExportPdf}
        style={{
          marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 14px",
          borderRadius: R.sm, border: 0, background: C.teal, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0,
        }}
      >
        <Printer size={14} />PDF 내보내기
      </button>
    </div>
  );
}
