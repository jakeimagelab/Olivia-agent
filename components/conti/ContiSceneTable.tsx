"use client";

import { Plus } from "lucide-react";
import ContiSceneRow from "./ContiSceneRow";
import type { ContiRow } from "./types";

const th = { background: "#155855", color: "#fff", padding: "10px 12px", fontWeight: 900, fontSize: 12, textAlign: "left", whiteSpace: "nowrap" } as const;

type Props = {
  rows: ContiRow[];
  selectedSceneId?: string;
  dragOverIndex?: number;
  onSelect: (id: string) => void;
  onUpdate: (index: number, field: keyof ContiRow, value: string) => void;
  onColor: (index: number, background: string, text: string) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number, sceneId: string) => void;
  onAdd: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (event: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
};

export default function ContiSceneTable({ rows, selectedSceneId, dragOverIndex, onSelect, onUpdate, onColor, onDuplicate, onDelete, onAdd, onDragStart, onDragOver, onDrop, onDragEnd }: Props) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 1300, borderCollapse: "collapse" }}>
        <thead><tr><th style={{ ...th, width: 36 }} /><th style={th}>장면</th><th style={th}>장소</th><th style={th}>인원</th><th style={th}>구도</th><th style={th}>설명</th><th style={th}>시간</th><th style={th}>비고</th><th style={{ ...th, width: 70 }} /></tr></thead>
        <tbody>{rows.map((row, index) => {
          const id = row.id || `shot:${index + 1}`;
          return <ContiSceneRow key={id} row={row} index={index} selected={selectedSceneId === id} dragOver={dragOverIndex === index} onSelect={onSelect} onUpdate={onUpdate} onColor={onColor} onDuplicate={onDuplicate} onDelete={onDelete} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} />;
        })}</tbody>
      </table>
      <div style={{ padding: "10px 12px", borderTop: "1px dashed rgba(21,88,85,.15)" }}><button type="button" onClick={onAdd} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "1px dashed rgba(21,88,85,.3)", borderRadius: 6, background: "transparent", color: "#155855", fontSize: 12, fontWeight: 800, cursor: "pointer" }}><Plus size={13} /> 행 추가</button></div>
    </div>
  );
}
