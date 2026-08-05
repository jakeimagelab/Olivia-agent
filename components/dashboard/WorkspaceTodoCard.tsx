"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useHomeDashboardData } from "@/components/dashboard/HomeDashboardData";

export default function WorkspaceTodoCard() {
  const { data, state } = useHomeDashboardData();
  const tasks = data?.workspaceTodayTasks ?? [];
  if (state !== "loading" && tasks.length === 0) return null;

  return (
    <section className="oa-daily-brief oa-daily-brief--schedule" aria-busy={state === "loading"}>
      <div className="oa-daily-brief__schedule-head">
        <div>
          <span className="oa-daily-brief__schedule-icon"><ClipboardList size={13} aria-hidden="true" /></span>
          <div>
            <div className="oa-daily-brief__eyebrow">TEAM TODO</div>
            <strong>직원 업무 · 오늘의 할 일</strong>
          </div>
        </div>
      </div>

      {state === "loading" ? (
        <div className="oa-daily-brief__schedule-skeleton" aria-label="오늘 업무를 불러오는 중" role="status"><span /><span /><span /></div>
      ) : (
        <ul className="oa-daily-brief__checklist" aria-label="직원 업무 오늘의 할 일">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link href={`/team?tab=tasks&task=${task.id}`} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textDecoration: "none", color: "inherit" }}>
                {task.calendar_task_id ? <span aria-hidden="true">📅</span> : null}
                <strong style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</strong>
                {task.checklistProgress && task.checklistProgress.total > 0 ? (
                  <small>{task.checklistProgress.done}/{task.checklistProgress.total}</small>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="oa-daily-brief__schedule-footer">
        <Link href="/team?tab=tasks">워크스페이스에서 보기</Link>
      </div>
    </section>
  );
}
