"use client";

import type { TeamTaskChecklistItem } from "../types";

export default function TaskChecklist({ items, onToggle, disabled }: { items: TeamTaskChecklistItem[]; onToggle?: (item: TeamTaskChecklistItem) => void; disabled?: boolean }) {
  if (!items.length) return <div className="team-empty">체크리스트가 없습니다.</div>;
  return (
    <div style={{ display: "grid", gap: 7 }}>
      {items.map((item) => (
        <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <input type="checkbox" checked={item.completed} disabled={disabled || !onToggle} onChange={() => onToggle?.(item)} />
          <span style={{ textDecoration: item.completed ? "line-through" : "none" }}>{item.content}</span>
        </label>
      ))}
    </div>
  );
}
