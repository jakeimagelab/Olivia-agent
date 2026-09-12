"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, MapPin, Plus, Trash2 } from "lucide-react";
import type { CalendarTodo } from "@/lib/calendarTodos";
import MobileHeader from "./MobileHeader";
import styles from "./OliviaMobileShell.module.css";

type CalendarView = "today" | "week" | "month";
type CalendarTask = {
  id: string;
  title: string;
  date: string;
  time?: string | null;
  end_time?: string | null;
  location?: string | null;
  memo?: string | null;
  category?: string | null;
};

type CalendarDraft = { id?: string; title: string; date: string; time: string; location: string; memo: string };

const VIEW_LABELS: Array<{ id: CalendarView; label: string }> = [
  { id: "today", label: "오늘" }, { id: "week", label: "주간" }, { id: "month", label: "월간" },
];

function dateKey(date = new Date()) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function moveDate(value: string, days: number) {
  const next = parseDate(value);
  next.setDate(next.getDate() + days);
  return dateKey(next);
}

function formatHeading(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(parseDate(value));
}

function getWeek(value: string) {
  const selected = parseDate(value);
  const mondayOffset = selected.getDay() === 0 ? -6 : 1 - selected.getDay();
  return Array.from({ length: 7 }, (_, index) => moveDate(value, mondayOffset + index));
}

function getMonthGrid(value: string) {
  const selected = parseDate(value);
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { key: dateKey(date), inMonth: date.getMonth() === selected.getMonth() };
  });
}

const emptyDraft = (date: string): CalendarDraft => ({ title: "", date, time: "", location: "", memo: "" });

export default function MobileCalendar() {
  const [view, setView] = useState<CalendarView>("today");
  const [selectedDate, setSelectedDate] = useState(dateKey);
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<CalendarDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [todos, setTodos] = useState<CalendarTodo[]>([]);
  const [todosLoading, setTodosLoading] = useState(true);
  const [todoError, setTodoError] = useState("");
  const [todoTitle, setTodoTitle] = useState("");
  const [todoSaving, setTodoSaving] = useState(false);
  const [todoBusyId, setTodoBusyId] = useState<string | null>(null);

  const monthKey = selectedDate.slice(0, 7);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/calendar?month=${monthKey}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "일정을 불러오지 못했어요.");
      setTasks(payload.tasks || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "일정을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  const loadTodos = useCallback(async () => {
    setTodosLoading(true);
    setTodoError("");
    try {
      const response = await fetch("/api/calendar/todos", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "할 일을 불러오지 못했어요.");
      setTodos(payload.todos || []);
    } catch (loadError) {
      setTodoError(loadError instanceof Error ? loadError.message : "할 일을 불러오지 못했어요.");
    } finally {
      setTodosLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadTodos(); }, [loadTodos]);
  useEffect(() => {
    const refresh = () => { void load(); void loadTodos(); };
    window.addEventListener("olivia-resource-updated", refresh);
    window.addEventListener("olivia-calendar-updated", refresh);
    return () => {
      window.removeEventListener("olivia-resource-updated", refresh);
      window.removeEventListener("olivia-calendar-updated", refresh);
    };
  }, [load, loadTodos]);

  const selectedTasks = useMemo(() => tasks.filter((task) => task.date === selectedDate), [selectedDate, tasks]);
  const week = useMemo(() => getWeek(selectedDate), [selectedDate]);
  const monthGrid = useMemo(() => getMonthGrid(selectedDate), [selectedDate]);
  const taskDates = useMemo(() => new Set(tasks.map((task) => task.date)), [tasks]);
  const sortedTodos = useMemo(() => [...todos].sort((left, right) =>
    Number(left.completed) - Number(right.completed)
      || left.sortOrder - right.sortOrder
      || left.createdAt.localeCompare(right.createdAt)
  ), [todos]);

  const move = (direction: -1 | 1) => {
    const amount = view === "month" ? 30 : view === "week" ? 7 : 1;
    setSelectedDate(moveDate(selectedDate, amount * direction));
  };

  const editTask = (task: CalendarTask) => setDraft({
    id: task.id, title: task.title, date: task.date, time: task.time?.slice(0, 5) || "", location: task.location || "", memo: task.memo || "",
  });

  const save = async () => {
    if (!draft?.title.trim() || !draft.date) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/calendar", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(draft.id ? { id: draft.id } : {}),
          title: draft.title.trim(), date: draft.date, time: draft.time || null,
          location: draft.location.trim() || null, memo: draft.memo.trim(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "일정을 저장하지 못했어요.");
      setSelectedDate(draft.date);
      setDraft(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "일정을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  const addTodo = async () => {
    const title = todoTitle.trim();
    if (!title || todoSaving) return;
    setTodoSaving(true);
    setTodoError("");
    try {
      const response = await fetch("/api/calendar/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "할 일을 추가하지 못했어요.");
      setTodos((current) => [...current, payload.todo as CalendarTodo]);
      setTodoTitle("");
      window.dispatchEvent(new CustomEvent("olivia-calendar-updated"));
    } catch (saveError) {
      setTodoError(saveError instanceof Error ? saveError.message : "할 일을 추가하지 못했어요.");
    } finally {
      setTodoSaving(false);
    }
  };

  const toggleTodo = async (todo: CalendarTodo) => {
    if (todoBusyId) return;
    const completed = !todo.completed;
    setTodoBusyId(todo.id);
    setTodoError("");
    setTodos((current) => current.map((item) => item.id === todo.id ? { ...item, completed } : item));
    try {
      const response = await fetch("/api/calendar/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todo.id, completed }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "완료 상태를 바꾸지 못했어요.");
      setTodos((current) => current.map((item) => item.id === todo.id ? payload.todo as CalendarTodo : item));
      window.dispatchEvent(new CustomEvent("olivia-calendar-updated"));
    } catch (saveError) {
      setTodos((current) => current.map((item) => item.id === todo.id ? todo : item));
      setTodoError(saveError instanceof Error ? saveError.message : "완료 상태를 바꾸지 못했어요.");
    } finally {
      setTodoBusyId(null);
    }
  };

  const deleteTodo = async (todo: CalendarTodo) => {
    if (todoBusyId) return;
    setTodoBusyId(todo.id);
    setTodoError("");
    setTodos((current) => current.filter((item) => item.id !== todo.id));
    try {
      const response = await fetch(`/api/calendar/todos?id=${encodeURIComponent(todo.id)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "할 일을 삭제하지 못했어요.");
      window.dispatchEvent(new CustomEvent("olivia-calendar-updated"));
    } catch (saveError) {
      setTodos((current) => current.some((item) => item.id === todo.id) ? current : [...current, todo]);
      setTodoError(saveError instanceof Error ? saveError.message : "할 일을 삭제하지 못했어요.");
    } finally {
      setTodoBusyId(null);
    }
  };

  return (
    <section className={styles.screenWithHeader} aria-label="모바일 캘린더">
      <MobileHeader title="캘린더" subtitle="오늘과 다가오는 일정을 확인하세요." onAdd={() => setDraft(emptyDraft(selectedDate))} />
      <div className={styles.scrollBody}>
        <div className={styles.segmented}>
          {VIEW_LABELS.map((item) => <button key={item.id} type="button" className={view === item.id ? styles.segmentedActive : undefined} onClick={() => { setView(item.id); if (item.id === "today") setSelectedDate(dateKey()); }}>{item.label}</button>)}
        </div>
        <div className={styles.dateHeading}>
          <button type="button" onClick={() => move(-1)} aria-label="이전 날짜"><ChevronLeft size={20} /></button>
          <div><h2>{formatHeading(selectedDate)}</h2><p>일정 {selectedTasks.length}</p></div>
          <button type="button" onClick={() => move(1)} aria-label="다음 날짜"><ChevronRight size={20} /></button>
        </div>

        {view === "week" ? <div className={styles.weekStrip}>
          {week.map((key) => <button type="button" key={key} className={selectedDate === key ? styles.dateSelected : undefined} onClick={() => setSelectedDate(key)}><span>{new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(parseDate(key))}</span><strong>{parseDate(key).getDate()}</strong>{taskDates.has(key) ? <i /> : null}</button>)}
        </div> : null}

        {view === "month" ? <div className={styles.monthGrid}>
          {Array.from("일월화수목금토").map((day) => <span key={day}>{day}</span>)}
          {monthGrid.map(({ key, inMonth }) => <button type="button" key={key} data-outside={!inMonth || undefined} className={selectedDate === key ? styles.dateSelected : undefined} onClick={() => setSelectedDate(key)}>{parseDate(key).getDate()}{taskDates.has(key) ? <i /> : null}</button>)}
        </div> : null}

        <div className={styles.listHeading}><h3>{view === "today" ? "오늘 일정" : "선택한 날짜"}</h3><span>{selectedTasks.length}</span></div>
        {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>일정을 확인하고 있어요...</div> : selectedTasks.length ? (
          <div className={styles.scheduleList}>{selectedTasks.map((task) => <button type="button" key={task.id} onClick={() => editTask(task)}>
            <span className={styles.scheduleTime}>{task.time?.slice(0, 5) || "—"}</span>
            <span className={styles.scheduleCopy}><strong>{task.title}</strong><small><MapPin size={12} />{task.location || "장소 미정"}</small></span>
            <ChevronRight size={18} />
          </button>)}</div>
        ) : <div className={styles.emptyState}><CalendarDays size={22} /><span>{selectedDate === dateKey() ? "오늘 예정된 일정이 없어요." : "이날 예정된 일정이 없어요."}</span></div>}

        <section className={styles.todoSection} aria-labelledby="mobile-calendar-todos">
          <div className={styles.listHeading}>
            <h3 id="mobile-calendar-todos">할 일</h3>
            <span>{todos.length}</span>
          </div>
          <form className={styles.todoComposer} onSubmit={(event) => { event.preventDefault(); void addTodo(); }}>
            <input value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} placeholder="새 할 일을 입력하세요" maxLength={160} aria-label="새 할 일" />
            <button type="submit" disabled={todoSaving || !todoTitle.trim()} aria-label="할 일 추가"><Plus size={18} /></button>
          </form>
          {todoError ? <div className={styles.todoError}><span>{todoError}</span><button type="button" onClick={() => void loadTodos()}>다시 시도</button></div> : null}
          {todosLoading ? <div className={styles.todoEmpty}>할 일을 확인하고 있어요...</div> : sortedTodos.length ? (
            <div className={styles.todoList}>{sortedTodos.map((todo) => (
              <div key={todo.id} className={todo.completed ? styles.todoCompleted : undefined}>
                <button type="button" className={styles.todoToggle} disabled={todoBusyId === todo.id} onClick={() => void toggleTodo(todo)} aria-label={`${todo.title} ${todo.completed ? "미완료로 변경" : "완료"}`} aria-pressed={todo.completed}>
                  {todo.completed ? <Check size={13} /> : null}
                </button>
                <span>{todo.title}</span>
                <button type="button" className={styles.todoDelete} disabled={todoBusyId === todo.id} onClick={() => void deleteTodo(todo)} aria-label={`${todo.title} 삭제`}><Trash2 size={15} /></button>
              </div>
            ))}</div>
          ) : <div className={styles.todoEmpty}>등록된 할 일이 없어요.</div>}
        </section>
      </div>

      {draft ? <div className={styles.sheetBackdrop} onPointerDown={() => setDraft(null)}>
        <form className={styles.sheet} onSubmit={(event) => { event.preventDefault(); void save(); }} onPointerDown={(event) => event.stopPropagation()}>
          <div className={styles.sheetHandle} />
          <header><h2>{draft.id ? "일정 수정" : "새 일정"}</h2><button type="button" onClick={() => setDraft(null)}>닫기</button></header>
          <label><span>제목</span><input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="일정 제목" /></label>
          <div className={styles.formRow}><label><span>날짜</span><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label><label><span>시간</span><input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label></div>
          <label><span>위치</span><input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="위치" /></label>
          <label><span>메모</span><textarea rows={3} value={draft.memo} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} placeholder="필요한 내용을 적어주세요." /></label>
          <button type="submit" className={styles.sheetSave} disabled={saving || !draft.title.trim()}>{saving ? "저장 중..." : "저장"}</button>
        </form>
      </div> : null}
    </section>
  );
}
