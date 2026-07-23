import { C } from "@/lib/theme";
import type { DailyGoal, TeamMember } from "../types";

const LABEL = { planned: "진행 중", achieved: "달성", partial: "일부 달성", missed: "미달성" };

export default function TeamGoalOverview({ goals, members }: { goals: DailyGoal[]; members?: TeamMember[] }) {
  if (!goals.length) return <div className="team-empty">작성된 오늘의 핵심 목표가 없습니다.</div>;
  return (
    <div style={{ display: "grid", gap: 9 }}>
      {goals.map((goal) => (
        <div key={goal.id} style={{ padding: 13, borderRadius: 12, border: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 12, alignItems: "center" }}>
          <b style={{ fontSize: 12, color: C.teal }}>{goal.member?.display_name ?? members?.find((member) => member.id === goal.member_id)?.display_name ?? "팀원"}</b>
          <div><div style={{ fontSize: 12, fontWeight: 800 }}>{goal.title}</div>{goal.result_note ? <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{goal.result_note}</div> : null}</div>
          <span style={{ fontSize: 10, fontWeight: 900, color: goal.status === "achieved" ? C.success : goal.status === "missed" ? C.danger : C.orange }}>{LABEL[goal.status]}</span>
        </div>
      ))}
    </div>
  );
}
