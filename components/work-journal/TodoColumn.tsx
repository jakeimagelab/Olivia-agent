"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { C, R } from "@/lib/theme";
import { dateHeaderLabel, timeRangeLabel } from "@/lib/work-journal/dateLabel";
import type { CalendarEvent } from "@/lib/work-journal/types";
import type { ScheduleTodo } from "@/lib/work-journal/scheduleTypes";

// app/calendar/page.tsx의 카테고리 색상표와 동일 — ScheduleColumn.tsx/ScheduleDetailCard.tsx와 같은
// 이유로 여기서도 다시 쓴다.
const CATEGORY: Record<string, { label: string; color: string; bg: string }> = {
  shooting: { label: "촬영", color: "#E85D2C", bg: "#FFF0EB" },
  client:   { label: "고객", color: "#155855", bg: "#EAF4F2" },
  admin:    { label: "행정", color: "#EB8F22", bg: "#FFF3E0" },
  personal: { label: "개인", color: "#000000", bg: "#ECECEC" },
  general:  { label: "기타", color: "#5A7470", bg: "#F3F4F6" },
};

export default function TodoColumn({
  schedule,
  todos,
  loading,
  onAddTodo,
  onToggleTodo,
  onReorderTodo,
  onDeleteTodo,
}: {
  schedule: CalendarEvent;
  todos: ScheduleTodo[];
  loading: boolean;
  onAddTodo: (input: { title: string; assignee?: string }) => Promise<void>;
  onToggleTodo: (id: string, completed: boolean) => void;
  onReorderTodo: (id: string, direction: "up" | "down") => void;
  onDeleteTodo: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const done = todos.filter((t) => t.completed).length;
  const cat = CATEGORY[schedule.category] ?? CATEGORY.general;

  const submit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAddTodo({ title: title.trim(), assignee: assignee.trim() || undefined });
      setTitle(""); setAssignee(""); setAdding(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pc-card pc-card--padded" style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: cat.color, background: cat.bg, borderRadius: R.xs, padding: "3px 8px", flexShrink: 0 }}>
            {cat.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: C.ink }}>{schedule.title}</span>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 12px", borderRadius: R.sm, border: "none", background: C.orange, color: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}
          >
            <Plus size={13} />추가
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>{dateHeaderLabel(schedule.date)} · {timeRangeLabel(schedule.time, schedule.endTime)}</span>
          {schedule.location ? <span style={{ fontSize: 11.5, color: C.muted }}>· {schedule.location}</span> : null}
          <span style={{ fontSize: 11, fontWeight: 800, color: C.teal, background: C.mint, borderRadius: R.full, padding: "2px 8px" }}>
            진행률 {done} / {todos.length}
          </span>
        </div>
        {schedule.memo ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: C.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{schedule.memo}</p>
        ) : null}
      </div>

      {adding ? (
        <div style={{ flexShrink: 0, marginBottom: 10, padding: 10, borderRadius: R.md, border: `1px solid ${C.border}`, background: C.mint, display: "grid", gap: 6 }}>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            placeholder="To-do 제목"
            style={{ height: 32, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12.5 }}
          />
          <input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            placeholder="담당자 (선택)"
            style={{ height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12 }}
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setAdding(false)} style={{ height: 28, padding: "0 10px", borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>취소</button>
            <button type="button" onClick={submit} disabled={!title.trim() || submitting} style={{ height: 28, padding: "0 12px", borderRadius: R.sm, border: "none", background: C.teal, color: "#fff", fontSize: 11, fontWeight: 800, cursor: !title.trim() || submitting ? "not-allowed" : "pointer", opacity: !title.trim() || submitting ? 0.6 : 1 }}>
              {submitting ? "추가 중..." : "추가"}
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {loading ? (
          <p style={{ fontSize: 12, color: C.hint }}>불러오는 중...</p>
        ) : todos.length === 0 ? (
          <p style={{ fontSize: 12, color: C.hint }}>등록된 To-do가 없습니다.</p>
        ) : (
          todos.map((todo, index) => (
            <div
              key={todo.id}
              style={{
                display: "flex", alignItems: "center", gap: 8, borderRadius: R.md, padding: "9px 10px",
                border: `1px solid ${C.border}`, background: "#fff",
              }}
            >
              <button
                type="button"
                onClick={() => onToggleTodo(todo.id, !todo.completed)}
                aria-label="완료 표시"
                style={{
                  width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${todo.completed ? C.success : C.border}`,
                  background: todo.completed ? C.success : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
                }}
              >
                {todo.completed ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
              </button>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 12.5, color: todo.completed ? C.hint : C.ink, fontWeight: 600,
                textDecoration: todo.completed ? "line-through" : "none",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {todo.title}
              </span>
              {todo.assignee ? (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.teal, background: C.mint, borderRadius: R.xs, padding: "3px 7px", flexShrink: 0 }}>
                  {todo.assignee}
                </span>
              ) : null}
              <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
                <button type="button" onClick={() => onReorderTodo(todo.id, "up")} disabled={index === 0} aria-label="위로 이동"
                  style={{ border: "none", background: "transparent", color: C.muted, cursor: index === 0 ? "not-allowed" : "pointer", opacity: index === 0 ? 0.3 : 1, padding: 0, height: 14 }}>
                  <ChevronUp size={14} />
                </button>
                <button type="button" onClick={() => onReorderTodo(todo.id, "down")} disabled={index === todos.length - 1} aria-label="아래로 이동"
                  style={{ border: "none", background: "transparent", color: C.muted, cursor: index === todos.length - 1 ? "not-allowed" : "pointer", opacity: index === todos.length - 1 ? 0.3 : 1, padding: 0, height: 14 }}>
                  <ChevronDown size={14} />
                </button>
              </div>
              <button type="button" onClick={() => onDeleteTodo(todo.id)} aria-label="삭제" title="삭제"
                style={{ border: "none", background: "transparent", color: C.hint, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center" }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
