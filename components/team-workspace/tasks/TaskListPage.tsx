"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { C } from "@/lib/theme";
import type { TeamTask } from "../types";
import { useTeamRealtime } from "../useTeamRealtime";
import NewTaskDialog from "./NewTaskDialog";
import SimpleTaskCard from "./SimpleTaskCard";
import TaskDetailDrawer from "./TaskDetailDrawer";

export default function TaskListPage({
  initialTaskId = null,
}: {
  initialTaskId?: string | null;
}) {
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId);
  const [newOpen, setNewOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/team/tasks", { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      setTasks(data.tasks);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "업무를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useTeamRealtime(["team_tasks", "team_task_checklists"], load);

  const { open, completed } = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    return {
      open: sorted.filter((task) => task.status !== "completed" && task.status !== "canceled"),
      completed: sorted.filter((task) => task.status === "completed"),
    };
  }, [tasks]);

  const toggleComplete = async (task: TeamTask) => {
    if (busyId) return;
    setBusyId(task.id);
    try {
      const response = await fetch(`/api/team/tasks/${task.id}/${task.status === "completed" ? "uncomplete" : "complete"}`, { method: "POST" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "상태 변경에 실패했습니다.");
    } finally {
      setBusyId("");
    }
  };

  const renderCard = (task: TeamTask) => (
    <SimpleTaskCard key={task.id} task={task} onOpen={() => setSelectedId(task.id)} onToggle={() => toggleComplete(task)} busy={busyId === task.id} />
  );

  return (
    <>
      <div className="team-page-heading" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14 }}>
        <div><h2>할 일</h2><p>체크박스로 바로 완료 표시하는 간단한 할 일 목록입니다.</p></div>
        <button type="button" className="team-button" onClick={() => setNewOpen(true)}><Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} />새 할 일</button>
      </div>
      {error ? <div className="team-error" style={{ marginBottom: 14 }}>{error}</div> : null}
      {loading ? <div className="team-empty">업무를 불러오는 중...</div> : (
        <div style={{ display: "grid", gap: 18 }}>
          {!open.length ? <div className="team-empty">할 일이 없습니다. 새 할 일을 추가해보세요.</div> : (
            <div style={{ display: "grid", gap: 8 }}>{open.map(renderCard)}</div>
          )}
          {completed.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, border: 0, background: "transparent", cursor: "pointer", padding: "4px 0 8px", color: C.muted, fontSize: 12, fontWeight: 900 }}
              >
                {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                완료됨
                <span style={{ color: C.hint, fontWeight: 700 }}>{completed.length}</span>
              </button>
              {showCompleted && <div style={{ display: "grid", gap: 8 }}>{completed.map(renderCard)}</div>}
            </div>
          )}
        </div>
      )}
      <NewTaskDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => load()} />
      <TaskDetailDrawer taskId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
    </>
  );
}
