"use client";

import { CalendarDays, FolderKanban, UserRound } from "lucide-react";
import { C } from "@/lib/theme";
import type { TeamTask } from "../types";
import TaskStatusBadge from "./TaskStatusBadge";

export default function TaskCard({
  task,
  onOpen,
  onAction,
  busy,
}: {
  task: TeamTask;
  onOpen: () => void;
  onAction?: (action: string) => void;
  busy?: boolean;
}) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const overdue = Boolean(task.due_date && task.due_date < today && !["completed", "canceled"].includes(task.status));
  const quickAction = task.status === "todo"
    ? ["start", "시작하기"]
    : task.status === "in_progress"
      ? ["submit", "확인 요청"]
      : task.status === "review"
        ? ["approve", "승인"]
        : null;
  return (
    <article className="team-card" style={{ padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
      <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", textAlign: "left", padding: 0, cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
          <TaskStatusBadge status={task.status} overdue={overdue} />
          <span style={{ fontSize: 10, color: C.orange, fontWeight: 900 }}>{task.priority === "urgent" ? "긴급" : task.priority === "high" ? "높음" : ""}</span>
        </div>
        <h3 style={{ fontSize: 14, margin: 0, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 9, color: C.muted, fontSize: 11 }}>
          <span><UserRound size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{task.assignee?.display_name ?? "담당자 없음"}</span>
          {task.project ? <span><FolderKanban size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{task.project.name}</span> : null}
          <span><CalendarDays size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{task.due_date ?? "마감일 없음"}</span>
        </div>
      </button>
      {quickAction && onAction ? (
        <button className={`team-button${task.status === "review" ? " orange" : ""}`} type="button" disabled={busy} onClick={() => onAction(quickAction[0])}>
          {busy ? "처리 중" : quickAction[1]}
        </button>
      ) : null}
    </article>
  );
}
