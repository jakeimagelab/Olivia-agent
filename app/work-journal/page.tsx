"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import MiniCalendar from "@/components/work-journal/MiniCalendar";
import TaskListColumn from "@/components/work-journal/TaskListColumn";
import TaskDetailPanel from "@/components/work-journal/TaskDetailPanel";
import { C, R } from "@/lib/theme";
import type { CalendarEvent, Task, TaskDetail, TaskListItem, TaskPriority, TaskStatus, UpcomingEntry } from "@/lib/work-journal/types";

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = { todo: "in_progress", in_progress: "done", done: "todo" };

// 서버가 500 등으로 죽으면 응답 본문이 JSON이 아닐 수 있다(response.json()이 그대로 예외를 던지면
// 브라우저의 날 것 그대로의 파싱 에러 문구가 화면에 노출된다) — 항상 사람이 읽을 수 있는 메시지로 바꾼다.
async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`요청에 실패했습니다. (${response.status})`);
  }
  if (!data?.ok) throw new Error(data?.error || `요청에 실패했습니다. (${response.status})`);
  return data;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function rowToCalendarEvent(row: Record<string, any>): CalendarEvent {
  return {
    id: row.id,
    date: row.date,
    time: row.time ?? null,
    title: row.title ?? "",
    category: row.category ?? "general",
    completed: !!row.completed,
    location: row.location ?? null,
  };
}

function dateHeaderLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekday})`;
}

export default function WorkJournalPage() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [currentMonth, setCurrentMonth] = useState(todayStr().slice(0, 7));
  const [dayCounts, setDayCounts] = useState<Map<string, { total: number; done: number }>>(new Map());
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [upcoming, setUpcoming] = useState<Task[]>([]);
  const [calendarEventsByDate, setCalendarEventsByDate] = useState<Map<string, CalendarEvent[]>>(new Map());
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [error, setError] = useState("");

  const loadMonth = useCallback(async (month: string) => {
    try {
      const data = await fetchJson(`/api/work-journal/tasks?month=${month}`, { cache: "no-store" });
      const next = new Map<string, { total: number; done: number }>();
      for (const day of data.days as { dueDate: string; total: number; done: number }[]) next.set(day.dueDate, { total: day.total, done: day.done });
      setDayCounts(next);
    } catch {
      /* 캘린더 점 표시는 부가 정보라 실패해도 조용히 무시한다 */
    }
  }, []);

  // 기존 "캘린더"(calendar_tasks) 연동 — 업무일지는 여기 쓰지 않고 읽기 전용으로만 가져와 보여준다.
  // 실제 일정 등록/수정은 그대로 /calendar에서 한다.
  const loadCalendarMonth = useCallback(async (month: string) => {
    try {
      const data = await fetchJson(`/api/calendar?month=${month}`, { cache: "no-store" });
      const byDate = new Map<string, CalendarEvent[]>();
      for (const row of data.tasks as Record<string, any>[]) {
        const event = rowToCalendarEvent(row);
        byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
      }
      setCalendarEventsByDate(byDate);
    } catch {
      /* 캘린더 연동은 부가 정보라 실패해도 조용히 무시한다 */
    }
  }, []);

  const loadUpcomingCalendarEvents = useCallback(async () => {
    try {
      const thisMonth = todayStr().slice(0, 7);
      const [year, m] = thisMonth.split("-").map(Number);
      const nextMonth = m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
      const [a, b] = await Promise.all([
        fetchJson(`/api/calendar?month=${thisMonth}`, { cache: "no-store" }),
        fetchJson(`/api/calendar?month=${nextMonth}`, { cache: "no-store" }),
      ]);
      const today = todayStr();
      const merged = [...a.tasks, ...b.tasks]
        .map(rowToCalendarEvent)
        .filter((event) => event.date >= today && !event.completed)
        .sort((x, y) => (x.date === y.date ? (x.time ?? "").localeCompare(y.time ?? "") : x.date.localeCompare(y.date)))
        .slice(0, 10);
      setUpcomingEvents(merged);
    } catch {
      /* 다가오는 일정 위젯도 부가 정보라 조용히 무시한다 */
    }
  }, []);

  const loadTasks = useCallback(async (date: string) => {
    setTasksLoading(true);
    setError("");
    try {
      const data = await fetchJson(`/api/work-journal/tasks?date=${date}`, { cache: "no-store" });
      setTasks(data.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업무 목록을 불러오지 못했습니다.");
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadUpcoming = useCallback(async () => {
    try {
      const data = await fetchJson("/api/work-journal/upcoming?limit=6", { cache: "no-store" });
      setUpcoming(data.tasks);
    } catch {
      /* 다가오는 일정 위젯도 부가 정보라 조용히 무시한다 */
    }
  }, []);

  const loadAssignees = useCallback(async () => {
    try {
      const data = await fetchJson("/api/work-journal/assignees", { cache: "no-store" });
      setAssignees(data.assignees);
    } catch {
      /* 자동완성 후보 로드 실패는 무시 — 직접 입력은 그대로 가능 */
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const data = await fetchJson(`/api/work-journal/tasks/${id}`, { cache: "no-store" });
      setTaskDetail(data.task);
    } catch {
      /* 상세 로드 실패 — 패널은 로딩 상태에서 빠져나온다 */
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void loadMonth(currentMonth); void loadCalendarMonth(currentMonth); }, [currentMonth, loadMonth, loadCalendarMonth]);
  useEffect(() => { void loadTasks(selectedDate); setSelectedTaskId(null); setTaskDetail(null); }, [selectedDate, loadTasks]);
  useEffect(() => { void loadUpcoming(); void loadUpcomingCalendarEvents(); void loadAssignees(); }, [loadUpcoming, loadUpcomingCalendarEvents, loadAssignees]);
  useEffect(() => {
    if (!selectedTaskId) { setTaskDetail(null); return; }
    void loadDetail(selectedTaskId);
  }, [selectedTaskId, loadDetail]);

  const eventDates = useMemo(() => new Set(calendarEventsByDate.keys()), [calendarEventsByDate]);
  const selectedDateEvents = calendarEventsByDate.get(selectedDate) ?? [];

  const mergedUpcoming = useMemo<UpcomingEntry[]>(() => {
    const taskEntries: UpcomingEntry[] = upcoming.map((task) => ({
      kind: "task", id: task.id, date: task.dueDate, time: task.dueTime, title: task.title, done: task.status === "done",
    }));
    const eventEntries: UpcomingEntry[] = upcomingEvents.map((event) => ({
      kind: "event", id: event.id, date: event.date, time: event.time, title: event.title, done: event.completed,
    }));
    return [...taskEntries, ...eventEntries]
      .sort((a, b) => (a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date)))
      .slice(0, 8);
  }, [upcoming, upcomingEvents]);

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    if (date.slice(0, 7) !== currentMonth) setCurrentMonth(date.slice(0, 7));
  };

  const handleSelectUpcoming = (entry: UpcomingEntry) => {
    handleSelectDate(entry.date);
    setSelectedTaskId(entry.kind === "task" ? entry.id : null);
  };

  const handleAddTask = async (input: { title: string; assigneeName: string; priority: TaskPriority }) => {
    let data: any;
    try {
      data = await fetchJson("/api/work-journal/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: selectedDate, title: input.title, assigneeName: input.assigneeName || undefined, priority: input.priority }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "업무 추가에 실패했습니다.");
      return;
    }
    setTasks((prev) => [...prev, data.task]);
    void loadMonth(currentMonth);
    void loadUpcoming();
    if (input.assigneeName && !assignees.includes(input.assigneeName)) setAssignees((prev) => [...prev, input.assigneeName].sort());
  };

  const handleCycleStatus = async (task: TaskListItem) => {
    const nextStatus = STATUS_CYCLE[task.status];
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    if (taskDetail?.id === task.id) setTaskDetail((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    try {
      await fetchJson(`/api/work-journal/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태 변경에 실패했습니다.");
      return;
    }
    void loadMonth(currentMonth);
    void loadUpcoming();
  };

  const handleUpdateDetail = async (patch: Partial<Task>) => {
    if (!taskDetail) return;
    const taskId = taskDetail.id;
    setTaskDetail((prev) => (prev ? { ...prev, ...patch } : prev));
    let data: any;
    try {
      data = await fetchJson(`/api/work-journal/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
      return;
    }

    if (typeof patch.dueDate === "string" && patch.dueDate !== selectedDate) {
      // 마감일이 다른 날짜로 바뀌면 오늘 목록에서는 사라진다.
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setSelectedTaskId(null);
      setTaskDetail(null);
    } else {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...data.task } : t)));
    }
    void loadMonth(currentMonth);
    void loadUpcoming();
    if (typeof patch.assigneeName === "string" && patch.assigneeName && !assignees.includes(patch.assigneeName)) {
      setAssignees((prev) => [...prev, patch.assigneeName as string].sort());
    }
  };

  const handleDeleteTask = async () => {
    if (!taskDetail) return;
    const taskId = taskDetail.id;
    if (!window.confirm("이 업무를 삭제할까요? 세부 체크리스트와 첨부파일도 함께 삭제됩니다.")) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTaskId(null);
    setTaskDetail(null);
    try {
      await fetchJson(`/api/work-journal/tasks/${taskId}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    }
    void loadMonth(currentMonth);
    void loadUpcoming();
  };

  const patchChecklistCount = (taskId: string, deltaTotal: number, deltaDone: number) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, checklistTotal: t.checklistTotal + deltaTotal, checklistDone: t.checklistDone + deltaDone } : t)));
  };

  const handleAddChecklistItem = async (label: string) => {
    if (!taskDetail) return;
    const taskId = taskDetail.id;
    let data: any;
    try {
      data = await fetchJson(`/api/work-journal/tasks/${taskId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "세부 업무 추가에 실패했습니다.");
      return;
    }
    setTaskDetail((prev) => (prev ? { ...prev, checklist: [...prev.checklist, data.item] } : prev));
    patchChecklistCount(taskId, 1, 0);
  };

  const handleToggleChecklistItem = async (itemId: string, done: boolean) => {
    if (!taskDetail) return;
    const taskId = taskDetail.id;
    setTaskDetail((prev) => (prev ? { ...prev, checklist: prev.checklist.map((item) => (item.id === itemId ? { ...item, done } : item)) } : prev));
    patchChecklistCount(taskId, 0, done ? 1 : -1);
    try {
      await fetchJson(`/api/work-journal/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "변경에 실패했습니다.");
    }
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    if (!taskDetail) return;
    const taskId = taskDetail.id;
    const removed = taskDetail.checklist.find((item) => item.id === itemId);
    setTaskDetail((prev) => (prev ? { ...prev, checklist: prev.checklist.filter((item) => item.id !== itemId) } : prev));
    if (removed) patchChecklistCount(taskId, -1, removed.done ? -1 : 0);
    try {
      await fetchJson(`/api/work-journal/checklist/${itemId}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    }
  };

  const handleUploadFile = async (file: File) => {
    if (!taskDetail) return;
    const taskId = taskDetail.id;
    const formData = new FormData();
    formData.append("file", file);
    let data: any;
    try {
      data = await fetchJson(`/api/work-journal/tasks/${taskId}/files`, { method: "POST", body: formData });
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일 업로드에 실패했습니다.");
      return;
    }
    setTaskDetail((prev) => (prev && prev.id === taskId ? { ...prev, files: [...prev.files, data.file] } : prev));
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!taskDetail) return;
    setTaskDetail((prev) => (prev ? { ...prev, files: prev.files.filter((f) => f.id !== fileId) } : prev));
    try {
      await fetchJson(`/api/work-journal/files/${fileId}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    }
  };

  return (
    <main className="pc-page" style={{ color: C.ink, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      <PageHeader title="업무일지" />
      <div className="pc-content pc-content--wide">
        <p style={{ fontSize: 13, color: C.muted, margin: "-8px 0 20px" }}>
          공유 업무일지를 통해 팀의 일정을 확인하고 업무 진행 현황을 함께 관리하세요.
        </p>
        {error ? <p style={{ fontSize: 12, color: C.danger, marginBottom: 12 }}>{error}</p> : null}

        <div
          className="wj-columns"
          style={{ display: "grid", gridTemplateColumns: "280px 1fr 360px", gap: 16, height: "calc(100vh - 260px)", minHeight: 560 }}
        >
          <MiniCalendar
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            dayCounts={dayCounts}
            onSelectDate={handleSelectDate}
            onMonthChange={setCurrentMonth}
            upcoming={upcoming}
            onSelectUpcoming={handleSelectUpcoming}
          />

          <div className="pc-card pc-card--padded" style={{ minHeight: 0, overflow: "hidden" }}>
            {tasksLoading ? (
              <p style={{ fontSize: 12, color: C.hint }}>불러오는 중...</p>
            ) : (
              <TaskListColumn
                dateLabel={dateHeaderLabel(selectedDate)}
                tasks={tasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onAddTask={handleAddTask}
                onCycleStatus={handleCycleStatus}
                assigneeOptions={assignees}
              />
            )}
          </div>

          <div className="pc-card pc-card--padded" style={{ minHeight: 0, overflow: "hidden" }}>
            <TaskDetailPanel
              detail={taskDetail}
              loading={detailLoading}
              onUpdate={handleUpdateDetail}
              onDelete={handleDeleteTask}
              onAddChecklistItem={handleAddChecklistItem}
              onToggleChecklistItem={handleToggleChecklistItem}
              onDeleteChecklistItem={handleDeleteChecklistItem}
              onUploadFile={handleUploadFile}
              onDeleteFile={handleDeleteFile}
              assigneeOptions={assignees}
            />
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 1100px) {
          .wj-columns {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto auto auto !important;
            height: auto !important;
            min-height: 0 !important;
          }
          .wj-columns > div { height: 480px; }
        }
      `}</style>
    </main>
  );
}
