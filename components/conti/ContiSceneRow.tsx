"use client";

import { memo } from "react";
import { Copy, GripVertical, Trash2 } from "lucide-react";
import ContiLensSelect from "./ContiLensSelect";
import type { ContiRow } from "./types";
import { getContiCategoryColor } from "./contiColors";

const td = { padding: "7px 8px", fontSize: 13, color: "#374151", borderBottom: "1px solid rgba(21,88,85,.07)", verticalAlign: "top" } as const;
const field = { width: "100%", minHeight: 36, border: "1px solid transparent", borderRadius: 5, background: "transparent", color: "inherit", font: "inherit", padding: "5px 7px" } as const;

type Props = {
  row: ContiRow;
  index: number;
  selected: boolean;
  dragOver: boolean;
  onSelect: (id: string) => void;
  onUpdate: (index: number, field: keyof ContiRow, value: string) => void;
  onColor: (index: number, background: string, text: string) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number, sceneId: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (event: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
};

function ContiSceneRow({ row, index, selected, dragOver, onSelect, onUpdate, onColor, onDuplicate, onDelete, onDragStart, onDragOver, onDrop, onDragEnd }: Props) {
  const id = row.id || `shot:${index + 1}`;
  const categoryColor = getContiCategoryColor(row.category);
  const [background, text] = row.color?.split("|") || [categoryColor.bg, categoryColor.text];
  return (
    <tr draggable onPointerDown={() => onSelect(id)} onDragStart={() => onDragStart(index)} onDragOver={(event) => onDragOver(event, index)} onDrop={() => onDrop(index)} onDragEnd={onDragEnd} style={{ outline: selected || dragOver ? "2px solid #155855" : "none", background: dragOver ? "rgba(21,88,85,.06)" : background }}>
      <td style={{ ...td, width: 36, cursor: "grab" }}><GripVertical size={15} color="#7b9691" /></td>
      <td style={{ ...td, minWidth: 150, color: text }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <strong style={{ color: "#155855", flexShrink: 0 }}>{index + 1}</strong>
          <input value={row.category} onChange={(event) => onUpdate(index, "category", event.target.value)} aria-label={`${index + 1}번 장면`} style={{ ...field, fontWeight: 800 }} />
          <input type="color" value={background} onChange={(event) => onColor(index, event.target.value, text)} aria-label="장면 배경색" style={{ width: 22, height: 24, padding: 0, border: 0 }} />
        </div>
      </td>
      <td style={{ ...td, minWidth: 140 }}><input value={row.location} onChange={(event) => onUpdate(index, "location", event.target.value)} style={field} /></td>
      <td style={{ ...td, minWidth: 180 }}><input value={row.personnel} onChange={(event) => onUpdate(index, "personnel", event.target.value)} style={field} /></td>
      <td style={{ ...td, minWidth: 130 }}><ContiLensSelect value={row.cameraAngle} onChange={(value) => onUpdate(index, "cameraAngle", value)} /></td>
      <td style={{ ...td, minWidth: 330 }}><textarea value={row.description} onChange={(event) => onUpdate(index, "description", event.target.value)} rows={2} style={{ ...field, resize: "vertical" }} /></td>
      <td style={{ ...td, minWidth: 95 }}><input value={row.duration} onChange={(event) => onUpdate(index, "duration", event.target.value)} placeholder="10분" style={field} /></td>
      <td style={{ ...td, minWidth: 150 }}><input value={row.notes} onChange={(event) => onUpdate(index, "notes", event.target.value)} placeholder="-" style={field} /></td>
      <td style={{ ...td, width: 70 }}><div style={{ display: "flex", gap: 4 }}><button type="button" title="행 복사" onClick={() => onDuplicate(index)} style={{ width: 28, height: 28, border: "1px solid rgba(21,88,85,.3)", borderRadius: 5, background: "#fff", color: "#155855", cursor: "pointer" }}><Copy size={12} /></button><button type="button" title="행 삭제" onClick={() => onDelete(index, id)} style={{ width: 28, height: 28, border: "1px solid #fca5a5", borderRadius: 5, background: "#fff", color: "#ef4444", cursor: "pointer" }}><Trash2 size={12} /></button></div></td>
    </tr>
  );
}

export default memo(ContiSceneRow);
