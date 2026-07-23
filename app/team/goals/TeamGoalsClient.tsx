"use client";

import { useCallback, useEffect, useState } from "react";
import type { DailyGoal } from "@/components/team-workspace/types";
import { useTeamRealtime } from "@/components/team-workspace/useTeamRealtime";
import DailyGoalEditor from "@/components/team-workspace/goals/DailyGoalEditor";
import DailyGoalResult from "@/components/team-workspace/goals/DailyGoalResult";
import TeamGoalOverview from "@/components/team-workspace/goals/TeamGoalOverview";

export default function TeamGoalsClient() {
  const [goal, setGoal] = useState<DailyGoal | null>(null);
  const [goals, setGoals] = useState<DailyGoal[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [today, all, session] = await Promise.all([
        fetch("/api/team/goals/today", { cache: "no-store" }).then((response) => response.json()),
        fetch("/api/team/goals", { cache: "no-store" }).then((response) => response.json()),
        fetch("/api/team-chat/session", { cache: "no-store" }).then((response) => response.json()),
      ]);
      if (!today.ok) throw new Error(today.error);
      setGoal(today.goal); setGoals(all.goals ?? []); setIsAdmin(Boolean(session.isAdmin)); setError("");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "목표를 불러오지 못했습니다."); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useTeamRealtime(["daily_goals"], load);
  return (
    <>
      <div className="team-page-heading"><h2>목표</h2><p>오늘 가장 중요한 한 가지와 완료 기준을 가볍게 공유합니다.</p></div>
      {error ? <div className="team-error" style={{ marginBottom: 14 }}>{error}</div> : null}
      <div className="team-grid-2" style={{ alignItems: "start" }}>
        <section className="team-card"><div className="team-card-header"><h3>나의 오늘 목표</h3></div><div className="team-card-body" style={{ display: "grid", gap: 18 }}><DailyGoalEditor goal={goal} onSaved={(saved) => { setGoal(saved); load(); }} />{goal ? <DailyGoalResult goal={goal} onSaved={(saved) => { setGoal(saved); load(); }} /> : null}</div></section>
        {isAdmin ? <section className="team-card"><div className="team-card-header"><h3>팀 오늘 목표</h3></div><div className="team-card-body"><TeamGoalOverview goals={goals} /></div></section> : null}
      </div>
    </>
  );
}
