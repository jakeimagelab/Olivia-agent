"use client";

import { useState } from "react";
import { Check, ChevronRight, Circle, Clock, Plus } from "lucide-react";
import { C, R } from "@/lib/theme";
import type { TaskListItem, TaskPriority, TaskStatus } from "@/lib/work-journal/types";

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];
const STATUS_LABEL: Record<TaskStatus, string> = { todo: "대기", in_progress: "진행 중", done: "완료" };
const STATUS_COLOR: Record<TaskStatus, string> = { todo: C.hint, in_progress: C.orange, done: C.success };

function StatusIcon({ status, size = 15 }: { status: TaskStatus; size?: number }) {
  const color = STATUS_COLOR[status];
  if (status === "done") return <Check size={size} color={color} strokeWidth={3} />;
  if (status === "in_progress") return <Clock size={size} color={color} />;
  return <Circle size={size} color={color} />;
}

export default function TaskListColumn({
  dateLabel,
  tasks,
  selectedTaskId,
  onSelectTask,
  onAddTask,
  onCycleStatus,
  assigneeOptions,
}: {
  dateLabel: string;
  tasks: TaskListItem[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onAddTask: (input: { title: string; assigneeName: string; priority: TaskPriority }) => Promise<void>;
  onCycleStatus: (task: TaskListItem) => void;
  assigneeOptions: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAddTask({ title: title.trim(), assigneeName: assigneeName.trim(), priority });
      setTitle(""); setAssigneeName(""); setPriority("normal"); setAdding(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: C.ink }}>{dateLabel} To do list</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.teal, background: C.mint, borderRadius: R.full, padding: "2px 8px" }}>{tasks.length}</span>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 12px", borderRadius: R.sm, border: "none", background: C.orange, color: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}
        >
          <Plus size={13} />업무 추가
        </button>
      </div>

      {adding ? (
        <div style={{ flexShrink: 0, marginBottom: 10, padding: 10, borderRadius: R.md, border: `1px solid ${C.border}`, background: C.mint, display: "grid", gap: 6 }}>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            placeholder="업무 제목"
            style={{ height: 32, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12.5 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={assigneeName}
              onChange={(e) => setAssigneeName(e.target.value)}
              placeholder="담당자"
              list="wj-assignee-options"
              style={{ flex: 1, height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12 }}
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              style={{ height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 8px", fontSize: 12 }}
            >
              <option value="low">낮음</option>
              <option value="normal">보통</option>
              <option value="high">높음</option>
            </select>
            <datalist id="wj-assignee-options">
              {assigneeOptions.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setAdding(false)} style={{ height: 28, padding: "0 10px", borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>취소</button>
            <button type="button" onClick={submit} disabled={!title.trim() || submitting} style={{ height: 28, padding: "0 12px", borderRadius: R.sm, border: "none", background: C.teal, color: "#fff", fontSize: 11, fontWeight: 800, cursor: !title.trim() || submitting ? "not-allowed" : "pointer", opacity: !title.trim() || submitting ? 0.6 : 1 }}>
              {submitting ? "추가 중..." : "추가"}
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 76px 60px", gap: 8, padding: "0 10px 8px", fontSize: 10.5, fontWeight: 800, color: C.hint, flexShrink: 0 }}>
        <span />
        <span>업무</span>
        <span>담당자</span>
        <span>상태</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {tasks.length === 0 ? (
          <p style={{ fontSize: 12, color: C.hint, padding: "0 10px" }}>등록된 업무가 없습니다.</p>
        ) : tasks.map((task) => {
          const active = task.id === selectedTaskId;
          return (
            <div
              key={task.id}
              onClick={() => onSelectTask(task.id)}
              style={{
                display: "grid", gridTemplateColumns: "24px 1fr 76px 60px", alignItems: "center", gap: 8,
                borderRadius: R.md, padding: "10px", cursor: "pointer",
                border: `1.5px solid ${active ? C.teal : "transparent"}`, background: active ? C.mint : "#fff",
              }}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCycleStatus(task); }}
                aria-label="완료 표시"
                style={{
                  width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${task.status === "done" ? C.success : C.border}`,
                  background: task.status === "done" ? C.success : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}
              >
                {task.status === "done" ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
              </button>
              <span style={{
                fontSize: 12.5, color: task.status === "done" ? C.hint : C.ink, fontWeight: 600,
                textDecoration: task.status === "done" ? "line-through" : "none",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {task.title || "(제목 없음)"}
                {task.checklistTotal > 0 ? (
                  <span style={{ marginLeft: 6, fontSize: 10, color: C.hint, fontWeight: 700 }}>{task.checklistDone}/{task.checklistTotal}</span>
                ) : null}
              </span>
              {task.assigneeName ? (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.teal, background: C.mint, borderRadius: R.xs, padding: "3px 7px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.assigneeName}
                </span>
              ) : <span />}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCycleStatus(task); }}
                  title={STATUS_LABEL[task.status]}
                  aria-label={STATUS_LABEL[task.status]}
                  style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center" }}
                >
                  <StatusIcon status={task.status} />
                </button>
                <ChevronRight size={14} color={C.hint} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 16, padding: "10px 10px 0", borderTop: `1px solid ${C.border}`, marginTop: 8 }}>
        {STATUS_ORDER.map((status) => (
          <span key={status} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.muted, fontWeight: 700 }}>
            <StatusIcon status={status} size={12} />{STATUS_LABEL[status]}
          </span>
        ))}
      </div>
    </div>
  );
}
