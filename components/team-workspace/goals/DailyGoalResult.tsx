"use client";

import { useEffect, useState } from "react";
import type { DailyGoal, DailyGoalStatus } from "../types";

export default function DailyGoalResult({ goal, onSaved }: { goal: DailyGoal; onSaved: (goal: DailyGoal) => void }) {
  const [status, setStatus] = useState<DailyGoalStatus>(goal.status);
  const [note, setNote] = useState(goal.result_note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setStatus(goal.status); setNote(goal.result_note ?? ""); }, [goal]);
  const save = async () => {
    if (status === "planned" || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/team/goals/today/result", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resultNote: note }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      onSaved(data.goal);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "오늘의 결과 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="team-field"><label>오늘의 결과</label><select className="team-select" value={status} onChange={(event) => setStatus(event.target.value as DailyGoalStatus)}><option value="planned">결과 선택</option><option value="achieved">달성</option><option value="partial">일부 달성</option><option value="missed">미달성</option></select></div>
      <div className="team-field"><label>한 줄 결과 보고</label><input className="team-input" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="오늘의 결과를 짧게 남겨주세요" /></div>
      {error ? <div className="team-error">{error}</div> : null}
      <div><button type="button" className="team-button secondary" disabled={busy || status === "planned"} onClick={save}>{busy ? "저장 중..." : "결과 저장"}</button></div>
    </div>
  );
}
