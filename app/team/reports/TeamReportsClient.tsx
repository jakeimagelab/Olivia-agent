"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { C } from "@/lib/theme";
import type { TeamTask } from "@/components/team-workspace/types";
import { useTeamRealtime } from "@/components/team-workspace/useTeamRealtime";

export default function TeamReportsClient() {
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/team/tasks", { cache: "no-store" });
    const data = await response.json();
    if (data.ok) { setTasks(data.tasks); setError(""); } else setError(data.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  useTeamRealtime(["team_tasks"], load);
  const summary = useMemo(() => ({
    completed: tasks.filter((task) => task.status === "completed").length,
    progressing: tasks.filter((task) => task.status === "in_progress").length,
    review: tasks.filter((task) => task.status === "review").length,
    overdue: tasks.filter((task) => task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && !["completed", "canceled"].includes(task.status)).length,
  }), [tasks]);
  return (
    <>
      <div className="team-page-heading"><h2>팀 리포트</h2><p>평가 점수 대신 현재 업무 흐름을 간단히 확인합니다.</p></div>
      {error ? <div className="team-error">{error}</div> : null}
      <div className="team-grid-3">
        {[["완료", summary.completed, C.success], ["진행 중", summary.progressing, C.teal], ["확인 요청", summary.review, C.orange], ["지연", summary.overdue, C.danger]].map(([label, value, color]) => <div key={String(label)} className="team-card" style={{ padding: 20 }}><div style={{ fontSize: 11, color: C.muted }}>{label}</div><div style={{ fontSize: 32, fontWeight: 900, color: String(color), marginTop: 8 }}>{value}</div></div>)}
      </div>
    </>
  );
}
