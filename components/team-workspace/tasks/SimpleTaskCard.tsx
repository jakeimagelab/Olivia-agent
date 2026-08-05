"use client";

import { ListChecks } from "lucide-react";
import { C } from "@/lib/theme";
import type { TeamTask } from "../types";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
function formatKoreanDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  const weekday = WEEKDAY[new Date(`${dateStr}T00:00:00+09:00`).getDay()];
  return `${month}/${day}(${weekday})`;
}

// 워크스페이스 "할 일" 탭 전용 카드 — 상태 단계(시작/확인요청/승인) 없이 체크박스 하나로
// 바로 완료 처리한다. 프로젝트 세부 업무(TaskCard)는 검토 단계가 필요할 수 있어 그대로 둔다.
export default function SimpleTaskCard({
  task,
  onOpen,
  onToggle,
  busy,
}: {
  task: TeamTask;
  onOpen: () => void;
  onToggle: () => void;
  busy?: boolean;
}) {
  const done = task.status === "completed";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const overdue = Boolean(task.due_date && task.due_date < today && !done);
  return (
    <article className="team-card" style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, opacity: busy ? 0.6 : 1 }}>
      <input
        type="checkbox"
        checked={done}
        disabled={busy}
        onChange={onToggle}
        style={{ width: 18, height: 18, flexShrink: 0, cursor: "pointer", accentColor: C.teal }}
      />
      <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", textAlign: "left", padding: 0, cursor: "pointer" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: done ? C.hint : C.ink, textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title}
        </div>
        {(task.due_date || (task.checklistProgress && task.checklistProgress.total > 0)) && (
          <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: overdue ? C.orange : C.muted, fontWeight: overdue ? 800 : 500 }}>
            {task.due_date && <span>{formatKoreanDate(task.due_date)}</span>}
            {task.checklistProgress && task.checklistProgress.total > 0 && (
              <span><ListChecks size={11} style={{ verticalAlign: -2, marginRight: 3 }} />{task.checklistProgress.done}/{task.checklistProgress.total}</span>
            )}
          </div>
        )}
      </button>
    </article>
  );
}
