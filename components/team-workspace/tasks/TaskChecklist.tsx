"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { C } from "@/lib/theme";
import type { TeamMember, TeamTaskChecklistItem } from "../types";

export default function TaskChecklist({
  items,
  members,
  canManage,
  busyId,
  onToggle,
  onAdd,
  onReassign,
  onDelete,
}: {
  items: TeamTaskChecklistItem[];
  members: TeamMember[];
  canManage: boolean;
  busyId?: string;
  onToggle?: (item: TeamTaskChecklistItem) => void;
  onAdd?: (content: string, assigneeId: string | null) => void;
  onReassign?: (item: TeamTaskChecklistItem, assigneeId: string | null) => void;
  onDelete?: (item: TeamTaskChecklistItem) => void;
}) {
  const [content, setContent] = useState("");
  const [assigneeId, setAssigneeId] = useState("");

  const submitAdd = (event: React.FormEvent) => {
    event.preventDefault();
    if (!content.trim() || !onAdd) return;
    onAdd(content.trim(), assigneeId || null);
    setContent("");
    setAssigneeId("");
  };

  return (
    <div style={{ display: "grid", gap: 7 }}>
      {!items.length ? <div className="team-empty">아직 세부 업무가 없습니다.</div> : items.map((item) => (
        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: busyId === item.id ? 0.6 : 1 }}>
          <input type="checkbox" checked={item.completed} disabled={!onToggle || busyId === item.id} onChange={() => onToggle?.(item)} />
          <span style={{ flex: 1, textDecoration: item.completed ? "line-through" : "none", color: item.completed ? C.hint : C.ink }}>{item.content}</span>
          {canManage ? (
            <select
              className="team-select"
              style={{ minHeight: 28, padding: "0 8px", fontSize: 11, width: 96 }}
              value={item.assignee_id ?? ""}
              disabled={busyId === item.id}
              onChange={(event) => onReassign?.(item, event.target.value || null)}
            >
              <option value="">담당자 선택</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}
            </select>
          ) : item.assignee ? (
            <span style={{ fontSize: 11, background: C.mint, color: C.teal, padding: "3px 8px", borderRadius: 20, fontWeight: 700 }}>{item.assignee.display_name}</span>
          ) : null}
          {canManage ? (
            <button type="button" onClick={() => onDelete?.(item)} disabled={busyId === item.id} style={{ border: 0, background: "transparent", color: C.muted, cursor: "pointer", padding: 2 }}>
              <Trash2 size={13} />
            </button>
          ) : null}
        </div>
      ))}
      {canManage && onAdd ? (
        <form onSubmit={submitAdd} style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <input
            className="team-input"
            style={{ flex: 1 }}
            placeholder="업무 내용 입력 (예: 레퍼런스 조사)"
            maxLength={500}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <select className="team-select" style={{ width: 110 }} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
            <option value="">담당자 선택</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}
          </select>
          <button type="submit" className="team-button" disabled={!content.trim()}>+ 추가</button>
        </form>
      ) : null}
    </div>
  );
}
