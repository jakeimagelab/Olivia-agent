"use client";

import { useEffect, useState } from "react";
import type { DailyGoal } from "../types";

export default function DailyGoalEditor({ goal, onSaved }: { goal: DailyGoal | null; onSaved: (goal: DailyGoal) => void }) {
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setTitle(goal?.title ?? "");
    setCriteria(goal?.success_criteria ?? "");
  }, [goal]);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/team/goals/today", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, successCriteria: criteria }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      onSaved(data.goal);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "목표 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="team-field"><label>오늘의 핵심 목표</label><input className="team-input" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="오늘 가장 중요한 한 가지" /></div>
      <div className="team-field"><label>완료 기준</label><input className="team-input" maxLength={2000} value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder="어디까지 하면 완료인지 적어주세요" /></div>
      {error ? <div className="team-error">{error}</div> : null}
      <div><button type="button" className="team-button" disabled={busy || !title.trim()} onClick={save}>{busy ? "저장 중..." : goal ? "목표 수정" : "목표 저장"}</button></div>
    </div>
  );
}
