"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";
import type { ScheduleRow } from "./types";

const DURATION_OPTIONS = ["10분", "15분", "20분", "30분", "45분", "60분", "90분", "120분"];
const th = { background: "#155855", color: "#fff", padding: "10px 12px", fontWeight: 900, fontSize: 12, textAlign: "left", whiteSpace: "nowrap" } as const;
const td = { padding: "7px 8px", fontSize: 13, borderBottom: "1px solid rgba(21,88,85,.07)" } as const;
const input = { width: "100%", minHeight: 34, border: "1px solid transparent", background: "transparent", font: "inherit" } as const;

function addMinutes(time: string, duration: string) {
  const match = time.match(/(\d{2}):(\d{2})/);
  const minutes = Number(duration.match(/\d+/)?.[0]);
  if (!match || !minutes) return time;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  return `${match[1]}:${match[2]} - ${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type Props = {
  rows: ScheduleRow[];
  dragOverIndex?: number;
  onUpdate: (index: number, field: keyof ScheduleRow, value: string) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (event: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
};

export default function ContiSchedule({ rows, dragOverIndex, onUpdate, onAdd, onDelete, onDragStart, onDragOver, onDrop, onDragEnd }: Props) {
  return <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th style={{ ...th, width: 36 }} /><th style={th}>시간</th><th style={th}>소요시간</th><th style={th}>내용</th><th style={th}>구분</th><th style={th}>요청사항</th><th style={th}>비고</th><th style={{ ...th, width: 36 }} /></tr></thead><tbody>{rows.map((row, index) => <tr key={index} draggable onDragStart={() => onDragStart(index)} onDragOver={(event) => onDragOver(event, index)} onDrop={() => onDrop(index)} onDragEnd={onDragEnd} style={{ background: dragOverIndex === index ? "rgba(21,88,85,.06)" : index % 2 ? "#fafaf9" : "#fff", outline: dragOverIndex === index ? "2px solid #155855" : "none" }}><td style={{ ...td, cursor: "grab" }}><GripVertical size={15} /></td><td style={{ ...td, minWidth: 150 }}><input value={row.time} onChange={(event) => onUpdate(index, "time", event.target.value)} placeholder="09:00 - 09:30" style={input} /></td><td style={{ ...td, minWidth: 95 }}><select value={row.duration || ""} onChange={(event) => { onUpdate(index, "duration", event.target.value); onUpdate(index, "time", addMinutes(row.time, event.target.value)); }} style={input}><option value="">선택</option>{DURATION_OPTIONS.map((duration) => <option key={duration}>{duration}</option>)}</select></td><td style={{ ...td, minWidth: 170 }}><input value={row.activity} onChange={(event) => onUpdate(index, "activity", event.target.value)} style={input} /></td><td style={{ ...td, minWidth: 90 }}><input value={row.type} onChange={(event) => onUpdate(index, "type", event.target.value)} style={input} /></td><td style={{ ...td, minWidth: 180 }}><input value={row.requirements} onChange={(event) => onUpdate(index, "requirements", event.target.value)} style={input} /></td><td style={{ ...td, minWidth: 130 }}><input value={row.notes} onChange={(event) => onUpdate(index, "notes", event.target.value)} placeholder="-" style={input} /></td><td style={td}><button type="button" onClick={() => onDelete(index)} aria-label="스케줄 행 삭제" style={{ border: 0, background: "transparent", color: "#dc2626", cursor: "pointer" }}><Trash2 size={14} /></button></td></tr>)}</tbody></table><div style={{ padding: "10px 12px" }}><button type="button" onClick={onAdd} className="admin-secondary-link"><Plus size={13} /> 행 추가</button></div></div>;
}
