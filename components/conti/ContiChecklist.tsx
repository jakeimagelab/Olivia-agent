"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";
import type { ChecklistRow } from "./types";

const DEFAULT_COLORS: Record<string, string> = { "가운 및 유니폼": "#FFF1E8|#E85D2C", "내부청소": "#FFF3E0|#EB8F22", "공유/섭외": "#E6F4F1|#155855" };
const th = { background: "#155855", color: "#fff", padding: "10px 12px", fontWeight: 900, fontSize: 12, textAlign: "left", whiteSpace: "nowrap" } as const;
const td = { padding: "7px 8px", fontSize: 13, borderBottom: "1px solid rgba(21,88,85,.07)" } as const;
const input = { width: "100%", minHeight: 34, border: "1px solid transparent", background: "transparent", font: "inherit", color: "inherit" } as const;

type Props = {
  rows: ChecklistRow[];
  dragOverIndex?: number;
  onUpdate: (index: number, field: keyof ChecklistRow, value: string) => void;
  onColor: (index: number, background: string, text: string) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onClear: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (event: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
};

export default function ContiChecklist({ rows, dragOverIndex, onUpdate, onColor, onAdd, onDelete, onClear, onDragStart, onDragOver, onDrop, onDragEnd }: Props) {
  return <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th style={{ ...th, width: 36 }} /><th style={th}>번호</th><th style={th}>분류</th><th style={th}>체크리스트</th><th style={th}>준비여부</th><th style={th}>비고</th><th style={{ ...th, width: 36 }} /></tr></thead><tbody>{rows.map((row, index) => {
    const [background, text] = (row.color || DEFAULT_COLORS[row.category] || "#fff|#374151").split("|");
    const dragOver = dragOverIndex === index;
    return <tr key={index} draggable onDragStart={() => onDragStart(index)} onDragOver={(event) => onDragOver(event, index)} onDrop={() => onDrop(index)} onDragEnd={onDragEnd} style={{ background: dragOver ? "rgba(21,88,85,.06)" : background, color: text, outline: dragOver ? "2px solid #155855" : "none" }}><td style={{ ...td, cursor: "grab" }}><GripVertical size={15} /></td><td style={{ ...td, width: 50, fontWeight: 800 }}>{row.number}</td><td style={{ ...td, minWidth: 130 }}><div style={{ display: "flex", gap: 6 }}><input type="color" value={background} onChange={(event) => onColor(index, event.target.value, text)} aria-label="체크리스트 색상" style={{ width: 22, padding: 0, border: 0 }} /><input value={row.category} onChange={(event) => onUpdate(index, "category", event.target.value)} style={input} /></div></td><td style={{ ...td, minWidth: 260 }}><input value={row.item} onChange={(event) => onUpdate(index, "item", event.target.value)} style={input} /></td><td style={{ ...td, width: 80 }}><span aria-hidden style={{ display: "block", width: 20, height: 20, border: "2px solid rgba(21,88,85,.25)", borderRadius: 4 }} /></td><td style={{ ...td, minWidth: 150 }}><input value={row.notes} onChange={(event) => onUpdate(index, "notes", event.target.value)} placeholder="-" style={input} /></td><td style={td}><button type="button" onClick={() => onDelete(index)} aria-label="체크리스트 행 삭제" style={{ border: 0, background: "transparent", color: "#dc2626", cursor: "pointer" }}><Trash2 size={14} /></button></td></tr>;
  })}</tbody></table><div style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between" }}><button type="button" onClick={onAdd} className="admin-secondary-link"><Plus size={13} /> 행 추가</button>{rows.length ? <button type="button" onClick={onClear} className="admin-secondary-link" style={{ color: "#dc2626" }}><Trash2 size={13} /> 전체 삭제</button> : null}</div></div>;
}
