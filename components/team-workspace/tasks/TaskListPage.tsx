"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { TeamTask } from "../types";
import { useTeamRealtime } from "../useTeamRealtime";
import NewTaskDialog from "./NewTaskDialog";
import TaskCard from "./TaskCard";
import TaskDetailDrawer from "./TaskDetailDrawer";
import TaskFilters from "./TaskFilters";

const PRIORITY = { urgent: 4, high: 3, normal: 2, low: 1 };

export default function TaskListPage({
  initialTaskId = null,
}: {
  initialTaskId?: string | null;
}) {
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("mine");
  const [sort, setSort] = useState("due");
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId);
  const [newOpen, setNewOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
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

  const displayed = useMemo(() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    let result = filter === "all" || filter === "mine"
      ? [...tasks]
      : filter === "overdue"
        ? tasks.filter((task) => task.due_date && task.due_date < today && !["completed", "canceled"].includes(task.status))
        : tasks.filter((task) => task.status === filter);
    if (sort === "priority") result.sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority]);
    else if (sort === "recent") result.sort((a, b) => b.created_at.localeCompare(a.created_at));
    else result.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    return result;
  }, [tasks, filter, sort]);

  const quickAction = async (taskId: string, action: string) => {
    if (busyId) return;
    setBusyId(taskId);
    try {
      const response = await fetch(`/api/team/tasks/${taskId}/${action}`, { method: "POST" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "상태 변경에 실패했습니다.");
    } finally {
      setBusyId("");
    }
  };
  return (
    <>
      <div className="team-page-heading" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14 }}>
        <div><h2>할 일</h2><p>오늘 실행할 업무를 목록으로 빠르게 확인하고 상태를 바꿉니다.</p></div>
        <button type="button" className="team-button" onClick={() => setNewOpen(true)}><Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} />새 할 일</button>
      </div>
      <div style={{ marginBottom: 16 }}><TaskFilters filter={filter} sort={sort} onFilter={setFilter} onSort={setSort} /></div>
      {error ? <div className="team-error" style={{ marginBottom: 14 }}>{error}</div> : null}
      {loading ? <div className="team-empty">업무를 불러오는 중...</div> : displayed.length ? (
        <div style={{ display: "grid", gap: 10 }}>{displayed.map((task) => <TaskCard key={task.id} task={task} onOpen={() => setSelectedId(task.id)} onAction={(action) => quickAction(task.id, action)} busy={busyId === task.id} />)}</div>
      ) : <div className="team-empty">조건에 맞는 업무가 없습니다.</div>}
      <NewTaskDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => load()} />
      <TaskDetailDrawer taskId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
    </>
  );
}
