import type { DailyGoal } from "../types";
import DailyGoalEditor from "../goals/DailyGoalEditor";
import DailyGoalResult from "../goals/DailyGoalResult";

export default function TodayGoalCard({ goal, onSaved }: { goal: DailyGoal | null; onSaved: (goal: DailyGoal) => void }) {
  return (
    <section className="team-card">
      <div className="team-card-header"><h3>오늘의 핵심 목표</h3></div>
      <div className="team-card-body" style={{ display: "grid", gap: 18 }}>
        <DailyGoalEditor goal={goal} onSaved={onSaved} />
        {goal ? <div style={{ borderTop: "1px solid rgba(21,88,85,.12)", paddingTop: 16 }}><DailyGoalResult goal={goal} onSaved={onSaved} /></div> : null}
      </div>
    </section>
  );
}
