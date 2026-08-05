"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { C } from "@/lib/theme";
import type { TeamTask } from "../types";
import { useTeamRealtime } from "../useTeamRealtime";
import NewTaskDialog from "./NewTaskDialog";
import TaskCard from "./TaskCard";
import TaskDetailDrawer from "./TaskDetailDrawer";
import TaskFilters from "./TaskFilters";

const PRIORITY = { urgent: 4, high: 3, normal: 2, low: 1 };

type DateGroupKey = "overdue" | "today" | "thisWeek" | "nextWeek" | "later" | "none";
const DATE_GROUP_LABEL: Record<DateGroupKey, string> = {
  overdue: "지난 일정",
  today: "오늘",
  thisWeek: "이번 주",
  nextWeek: "다음 주",
  later: "다가오는 일정",
  none: "마감일 없음",
};
const COLLAPSED_BY_DEFAULT: DateGroupKey[] = ["later", "none"];

// 캘린더 연동으로 할일이 한꺼번에 많이 쌓여도 한눈에 훑을 수 있도록 마감일 기준으로 묶는다.
// "다가오는 일정"/"마감일 없음"은 기본으로 접어둬서 당장 급한 일부터 보이게 한다.
function groupByDate(tasks: TeamTask[], today: string): { key: DateGroupKey; items: TeamTask[] }[] {
  const weekEnd = new Date(Date.now() + 6 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const nextWeekEnd = new Date(Date.now() + 13 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const buckets: Record<DateGroupKey, TeamTask[]> = { overdue: [], today: [], thisWeek: [], nextWeek: [], later: [], none: [] };
  for (const task of tasks) {
    if (!task.due_date) { buckets.none.push(task); continue; }
    if (task.due_date < today) { buckets.overdue.push(task); continue; }
    if (task.due_date === today) { buckets.today.push(task); continue; }
    if (task.due_date <= weekEnd) { buckets.thisWeek.push(task); continue; }
    if (task.due_date <= nextWeekEnd) { buckets.nextWeek.push(task); continue; }
    buckets.later.push(task);
  }
  return (["overdue", "today", "thisWeek", "nextWeek", "later", "none"] as DateGroupKey[])
    .map((key) => ({ key, items: buckets[key] }))
    .filter((group) => group.items.length > 0);
}

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
  const [collapsed, setCollapsed] = useState<Set<DateGroupKey>>(new Set(COLLAPSED_BY_DEFAULT));
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

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const displayed = useMemo(() => {
    let result = filter === "all" || filter === "mine"
      ? [...tasks]
      : filter === "overdue"
        ? tasks.filter((task) => task.due_date && task.due_date < today && !["completed", "canceled"].includes(task.status))
        : tasks.filter((task) => task.status === filter);
    if (sort === "priority") result.sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority]);
    else if (sort === "recent") result.sort((a, b) => b.created_at.localeCompare(a.created_at));
    else result.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    return result;
  }, [tasks, filter, sort, today]);

  const groups = sort === "due" ? groupByDate(displayed, today) : null;

  const toggleGroup = (key: DateGroupKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

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

  const renderCard = (task: TeamTask) => (
    <TaskCard key={task.id} task={task} onOpen={() => setSelectedId(task.id)} onAction={(action) => quickAction(task.id, action)} busy={busyId === task.id} />
  );

  return (
    <>
      <div className="team-page-heading" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14 }}>
        <div><h2>할 일</h2><p>오늘 실행할 업무를 목록으로 빠르게 확인하고 상태를 바꿉니다.</p></div>
        <button type="button" className="team-button" onClick={() => setNewOpen(true)}><Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} />새 할 일</button>
      </div>
      <div style={{ marginBottom: 16 }}><TaskFilters filter={filter} sort={sort} onFilter={setFilter} onSort={setSort} /></div>
      {error ? <div className="team-error" style={{ marginBottom: 14 }}>{error}</div> : null}
      {loading ? <div className="team-empty">업무를 불러오는 중...</div> : !displayed.length ? (
        <div className="team-empty">조건에 맞는 업무가 없습니다.</div>
      ) : groups ? (
        <div style={{ display: "grid", gap: 18 }}>
          {groups.map((group) => (
            <div key={group.key}>
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                style={{ display: "flex", alignItems: "center", gap: 6, border: 0, background: "transparent", cursor: "pointer", padding: "4px 0 8px", color: C.teal, fontSize: 12, fontWeight: 900 }}
              >
                {collapsed.has(group.key) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                {DATE_GROUP_LABEL[group.key]}
                <span style={{ color: C.hint, fontWeight: 700 }}>{group.items.length}</span>
              </button>
              {!collapsed.has(group.key) && <div style={{ display: "grid", gap: 10 }}>{group.items.map(renderCard)}</div>}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>{displayed.map(renderCard)}</div>
      )}
      <NewTaskDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => load()} />
      <TaskDetailDrawer taskId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
    </>
  );
}
