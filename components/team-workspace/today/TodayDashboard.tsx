"use client";

import { useCallback, useEffect, useState } from "react";
import type { DailyGoal, TeamTask } from "../types";
import { useTeamRealtime } from "../useTeamRealtime";
import TaskDetailDrawer from "../tasks/TaskDetailDrawer";
import MyTaskList from "./MyTaskList";
import ReviewRequestPanel from "./ReviewRequestPanel";
import TeamStatusPanel from "./TeamStatusPanel";
import TodayGoalCard from "./TodayGoalCard";

type TodayData = {
  isAdmin: boolean;
  goal: DailyGoal | null;
  myTasks: TeamTask[];
  todayTasks: TeamTask[];
  overdue: TeamTask[];
  reviewRequests: TeamTask[];
  admin: null | { reviewRequests: TeamTask[]; overdue: TeamTask[]; unassigned: TeamTask[]; missingGoals: any[]; memberStats: any[] };
};

export default function TodayDashboard() {
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/team/today", { cache: "no-store" });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error);
      setData(json);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "오늘 업무를 불러오지 못했습니다.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useTeamRealtime(["team_tasks", "daily_goals", "team_projects"], load);
  const action = async (taskId: string, actionName: string) => {
    if (busyId) return;
    setBusyId(taskId);
    try {
      const response = await fetch(`/api/team/tasks/${taskId}/${actionName}`, { method: "POST" });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "상태 변경에 실패했습니다.");
    } finally {
      setBusyId("");
    }
  };
  if (error && !data) return <div className="team-error">{error}</div>;
  if (!data) return <div className="team-empty">오늘 업무를 불러오는 중...</div>;
  return (
    <>
      <div className="team-page-heading"><h2>오늘</h2><p>가장 중요한 목표와 지금 처리할 업무만 먼저 보여드려요.</p></div>
      {error ? <div className="team-error" style={{ marginBottom: 14 }}>{error}</div> : null}
      <div className="team-grid-2" style={{ alignItems: "start" }}>
        <TodayGoalCard goal={data.goal} onSaved={() => load()} />
        <MyTaskList tasks={data.todayTasks} title="오늘 해야 할 업무" empty="오늘 등록된 업무가 없습니다." onOpen={setSelectedId} onAction={action} busyId={busyId} />
      </div>
      <div style={{ height: 16 }} />
      {data.isAdmin && data.admin ? (
        <div style={{ display: "grid", gap: 16 }}>
          <ReviewRequestPanel tasks={data.admin.reviewRequests} onOpen={setSelectedId} onAction={action} busyId={busyId} />
          <MyTaskList tasks={data.admin.overdue} title="지연 업무" empty="지연된 업무가 없습니다." onOpen={setSelectedId} onAction={action} busyId={busyId} />
          <MyTaskList tasks={data.admin.unassigned} title="담당자 없는 업무" empty="담당자 없는 업무가 없습니다." onOpen={setSelectedId} onAction={action} busyId={busyId} />
          <section className="team-card"><div className="team-card-header"><h3>팀원별 진행 현황</h3><span style={{ fontSize: 11 }}>목표 미작성 {data.admin.missingGoals.length}명</span></div><div className="team-card-body"><TeamStatusPanel stats={data.admin.memberStats} /></div></section>
        </div>
      ) : (
        <div className="team-grid-2">
          <MyTaskList tasks={data.myTasks} title="내 할 일" empty="등록된 내 업무가 없습니다." onOpen={setSelectedId} onAction={action} busyId={busyId} />
          <MyTaskList tasks={data.overdue} title="마감이 지난 업무" empty="마감이 지난 업무가 없습니다." onOpen={setSelectedId} onAction={action} busyId={busyId} />
          <ReviewRequestPanel tasks={data.reviewRequests} onOpen={setSelectedId} onAction={action} busyId={busyId} />
        </div>
      )}
      <TaskDetailDrawer taskId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
    </>
  );
}
