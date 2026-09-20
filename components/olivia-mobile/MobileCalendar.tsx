"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, MapPin, Pencil, Plus, Repeat2, Trash2 } from "lucide-react";
import type { CalendarTodo } from "@/lib/calendarTodos";
import { CALENDAR_REMINDER_LABEL, CALENDAR_REMINDER_MINUTES, type CalendarReminderMinutes } from "@/lib/calendarReminders";
import {
  MOBILE_CALENDAR_HOUR_HEIGHT,
  getMobileCalendarEventPosition,
  getMobileCalendarMonthGrid,
  getMobileCalendarWeek,
  mobileCalendarDateKey,
  mobileCalendarTimeToMinutes,
  moveMobileCalendarDate,
  moveMobileCalendarMonth,
  parseMobileCalendarDate,
} from "@/lib/olivia/mobile/calendarLayout";
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
  reminder_enabled?: boolean;
  reminder_minutes_before?: CalendarReminderMinutes;
};

type CalendarDraft = {
  id?: string;
  title: string;
  date: string;
  time: string;
  endTime: string;
  allDay: boolean;
  location: string;
  memo: string;
  reminderEnabled: boolean;
  reminderMinutes: CalendarReminderMinutes;
  category?: string | null;
};

const VIEW_LABELS: Array<{ id: CalendarView; label: string }> = [
  { id: "today", label: "오늘" },
  { id: "week", label: "주간" },
  { id: "month", label: "월간" },
];

const CATEGORY_COLORS: Record<string, string> = {
  shoot: "#e85d2c",
  client: "#155855",
  admin: "#d88719",
  personal: "#718580",
  general: "#3f79aa",
};

function formatHeading(value: string, monthOnly = false) {
  return new Intl.DateTimeFormat("ko-KR", monthOnly
    ? { year: "numeric", month: "long" }
    : { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(parseMobileCalendarDate(value));
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(parseMobileCalendarDate(value));
}

function formatClock(value?: string | null) {
  if (!value) return "";
  const [hour = "0", minute = "00"] = value.split(":");
  const hourNumber = Number(hour);
  const period = hourNumber < 12 ? "오전" : "오후";
  return `${period} ${hourNumber % 12 || 12}:${minute}`;
}

function formatTimeRange(task: CalendarTask) {
  if (!task.time) return "종일";
  const start = formatClock(task.time);
  return task.end_time ? `${start} – ${formatClock(task.end_time)}` : start;
}

function emptyDraft(date: string): CalendarDraft {
  return { title: "", date, time: "09:00", endTime: "10:00", allDay: false, location: "", memo: "", reminderEnabled: false, reminderMinutes: 30 };
}

function draftForTask(task: CalendarTask): CalendarDraft {
  const time = task.time?.slice(0, 5) || "09:00";
  const endTime = task.end_time?.slice(0, 5) || (() => {
    const minutes = Math.min(23 * 60 + 59, (mobileCalendarTimeToMinutes(time) ?? 9 * 60) + 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  })();
  return {
    id: task.id,
    title: task.title,
    date: task.date,
    time,
    endTime,
    allDay: !task.time,
    location: task.location || "",
    memo: task.memo || "",
    reminderEnabled: task.reminder_enabled === true,
    reminderMinutes: task.reminder_minutes_before ?? 30,
    category: task.category,
  };
}

function WeekStrip({ selectedDate, taskDates, onSelect, onMoveWeek }: {
  selectedDate: string;
  taskDates: Set<string>;
  onSelect: (date: string) => void;
  onMoveWeek: (direction: -1 | 1) => void;
}) {
  const gesture = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const week = useMemo(() => getMobileCalendarWeek(selectedDate), [selectedDate]);

  return (
    <div
      className={styles.weekStrip}
      data-mobile-swipe-lock
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") return;
        gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        const start = gesture.current;
        gesture.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (!start || start.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - start.x;
        const deltaY = event.clientY - start.y;
        if (Math.abs(deltaX) >= 42 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) onMoveWeek(deltaX < 0 ? 1 : -1);
      }}
      onPointerCancel={() => { gesture.current = null; }}
    >
      {week.map((key) => {
        const selected = selectedDate === key;
        const today = mobileCalendarDateKey() === key;
        return (
          <button
            type="button"
            key={key}
            className={selected ? styles.dateSelected : undefined}
            data-today={today || undefined}
            onClick={() => onSelect(key)}
            aria-label={`${formatCompactDate(key)}${taskDates.has(key) ? ", 일정 있음" : ""}`}
          >
            <span>{new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(parseMobileCalendarDate(key))}</span>
            <strong>{parseMobileCalendarDate(key).getDate()}</strong>
            {taskDates.has(key) ? <i /> : null}
          </button>
        );
      })}
    </div>
  );
}

function TimeAxis({ date, tasks, onOpen }: { date: string; tasks: CalendarTask[]; onOpen: (task: CalendarTask) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const timedTasks = useMemo(() => tasks.filter((task) => mobileCalendarTimeToMinutes(task.time) != null), [tasks]);
  const allDayTasks = useMemo(() => tasks.filter((task) => mobileCalendarTimeToMinutes(task.time) == null), [tasks]);
  const isToday = date === mobileCalendarDateKey();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const firstMinutes = timedTasks.length
        ? Math.min(...timedTasks.map((task) => mobileCalendarTimeToMinutes(task.time) ?? 9 * 60))
        : isToday ? nowMinutes : 9 * 60;
      if (viewportRef.current) viewportRef.current.scrollTop = Math.max(0, firstMinutes / 60 * MOBILE_CALENDAR_HOUR_HEIGHT - 92);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [date, isToday, timedTasks]);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return (
    <section className={styles.calendarTimelineSection} aria-label={`${formatCompactDate(date)} 시간별 일정`}>
      {allDayTasks.length ? (
        <div className={styles.calendarAllDayLane}>
          <span>종일</span>
          <div>{allDayTasks.map((task) => <button type="button" key={task.id} onClick={() => onOpen(task)}>{task.title}</button>)}</div>
        </div>
      ) : null}
      <div ref={viewportRef} className={styles.calendarTimelineViewport}>
        <div className={styles.calendarTimeGrid} style={{ height: MOBILE_CALENDAR_HOUR_HEIGHT * 24 }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <div className={styles.calendarHourRow} key={hour} style={{ top: hour * MOBILE_CALENDAR_HOUR_HEIGHT }}>
              <span>{hour === 0 ? "오전 12시" : hour < 12 ? `오전 ${hour}시` : hour === 12 ? "오후 12시" : `오후 ${hour - 12}시`}</span><i />
            </div>
          ))}
          {timedTasks.map((task) => {
            const position = getMobileCalendarEventPosition(task.time, task.end_time);
            const color = CATEGORY_COLORS[task.category || "general"] || CATEGORY_COLORS.general;
            return (
              <button
                type="button"
                key={task.id}
                className={styles.calendarTimelineEvent}
                style={{ top: position.top + 1, height: Math.max(28, position.height - 2), borderColor: color, backgroundColor: `${color}18` }}
                onClick={() => onOpen(task)}
              >
                <strong>{task.title}</strong>
                {position.height >= 40 ? <span>{formatTimeRange(task)}</span> : null}
              </button>
            );
          })}
          {isToday ? <div className={styles.calendarNowLine} style={{ top: nowMinutes / 60 * MOBILE_CALENDAR_HOUR_HEIGHT }}><span /></div> : null}
        </div>
      </div>
    </section>
  );
}

function CalendarEventScreen({ task, draft, saving, deleting, error, onBack, onEdit, onDraft, onSave, onDelete }: {
  task: CalendarTask | null;
  draft: CalendarDraft | null;
  saving: boolean;
  deleting: boolean;
  error: string;
  onBack: () => void;
  onEdit: () => void;
  onDraft: (draft: CalendarDraft) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const editing = draft !== null;
  const displayedDate = draft?.date || task?.date || mobileCalendarDateKey();

  if (editing && draft) {
    return (
      <section className={styles.calendarEventScreen} aria-label={draft.id ? "일정 편집" : "새 일정"}>
        <header className={styles.calendarEventHeader}>
          <button type="button" onClick={onBack}><ChevronLeft size={19} /><span>{draft.id ? "상세" : "캘린더"}</span></button>
          <h1>{draft.id ? "이벤트 편집" : "새 이벤트"}</h1><span />
        </header>
        <form className={styles.calendarEditForm} onSubmit={(event) => { event.preventDefault(); onSave(); }}>
          <div className={styles.calendarEditBody}>
            <label className={styles.calendarField}><span>제목</span><input autoFocus value={draft.title} onChange={(event) => onDraft({ ...draft, title: event.target.value })} placeholder="일정 제목" /></label>
            <div className={styles.calendarSettingRow}>
              <span>종일</span>
              <button type="button" role="switch" aria-checked={draft.allDay} className={draft.allDay ? styles.calendarSwitchOn : undefined} onClick={() => onDraft({ ...draft, allDay: !draft.allDay, reminderEnabled: draft.allDay ? draft.reminderEnabled : false })}><i /></button>
            </div>
            <div className={styles.calendarDateTimeGroup}>
              <label>
                <span>시작</span>
                <span className={styles.calendarDateTimeInputs} data-all-day={draft.allDay}>
                  <input aria-label="시작 날짜" type="date" value={draft.date} onChange={(event) => onDraft({ ...draft, date: event.target.value })} />
                  {draft.allDay ? null : <input aria-label="시작 시간" type="time" value={draft.time} onChange={(event) => onDraft({ ...draft, time: event.target.value })} />}
                </span>
              </label>
              <label>
                <span>종료</span>
                <span className={styles.calendarDateTimeInputs} data-all-day={draft.allDay}>
                  <input aria-label="종료 날짜" type="date" value={draft.date} onChange={(event) => onDraft({ ...draft, date: event.target.value })} />
                  {draft.allDay ? null : <input aria-label="종료 시간" type="time" value={draft.endTime} onChange={(event) => onDraft({ ...draft, endTime: event.target.value })} />}
                </span>
              </label>
            </div>
            <div className={styles.calendarSettingRow} aria-label="반복 설정"><span><Repeat2 size={16} /> 반복</span><strong>안 함</strong></div>
            <label className={styles.calendarField}><span>위치</span><input value={draft.location} onChange={(event) => onDraft({ ...draft, location: event.target.value })} placeholder="위치" /></label>
            <label className={styles.calendarField}>
              <span><Bell size={15} /> 알림</span>
              <select value={draft.reminderEnabled ? String(draft.reminderMinutes) : "none"} disabled={draft.allDay} onChange={(event) => onDraft({ ...draft, reminderEnabled: event.target.value !== "none", reminderMinutes: event.target.value === "none" ? 30 : Number(event.target.value) as CalendarReminderMinutes })}>
                <option value="none">없음</option>
                {CALENDAR_REMINDER_MINUTES.map((minutes) => <option value={minutes} key={minutes}>{CALENDAR_REMINDER_LABEL[minutes]}</option>)}
              </select>
              {draft.allDay ? <small>시작 시간이 있는 일정에서 알림을 설정할 수 있어요.</small> : null}
            </label>
            <label className={styles.calendarField}><span>메모</span><textarea rows={5} value={draft.memo} onChange={(event) => onDraft({ ...draft, memo: event.target.value })} placeholder="필요한 내용을 적어주세요." /></label>
            {error ? <p className={styles.calendarFormError}>{error}</p> : null}
          </div>
          <div className={styles.calendarSaveBar}><button type="submit" disabled={saving || !draft.title.trim()}>{saving ? "저장 중..." : "저장"}</button></div>
        </form>
      </section>
    );
  }

  if (!task) return null;
  return (
    <section className={styles.calendarEventScreen} aria-label="일정 상세">
      <header className={styles.calendarEventHeader}>
        <button type="button" onClick={onBack}><ChevronLeft size={19} /><span>{formatCompactDate(displayedDate)}</span></button>
        <h1>이벤트</h1>
        <button type="button" onClick={onEdit}><Pencil size={16} /><span>편집</span></button>
      </header>
      <div className={styles.calendarEventBody}>
        <section className={styles.calendarEventHero}><i style={{ background: CATEGORY_COLORS[task.category || "general"] || CATEGORY_COLORS.general }} /><div><h2>{task.title}</h2><p>{formatHeading(task.date)}</p></div></section>
        <div className={styles.calendarDetailList}>
          <div><Clock3 size={18} /><span><small>시간</small><strong>{formatTimeRange(task)}</strong></span></div>
          <div><MapPin size={18} /><span><small>위치</small><strong>{task.location || "위치 없음"}</strong></span></div>
          <div><Repeat2 size={18} /><span><small>반복</small><strong>안 함</strong></span></div>
          <div><Bell size={18} /><span><small>알림</small><strong>{task.reminder_enabled ? CALENDAR_REMINDER_LABEL[task.reminder_minutes_before ?? 30] : "없음"}</strong></span></div>
        </div>
        {task.memo ? <section className={styles.calendarEventMemo}><h3>메모</h3><p>{task.memo}</p></section> : null}
        {error ? <p className={styles.calendarFormError}>{error}</p> : null}
        <button type="button" className={styles.calendarDeleteEvent} disabled={deleting} onClick={onDelete}><Trash2 size={17} />{deleting ? "삭제 중..." : "이벤트 삭제"}</button>
      </div>
    </section>
  );
}

export default function MobileCalendar() {
  const [view, setView] = useState<CalendarView>("month");
  const [selectedDate, setSelectedDate] = useState(mobileCalendarDateKey);
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTask, setActiveTask] = useState<CalendarTask | null>(null);
  const [draft, setDraft] = useState<CalendarDraft | null>(null);
  const [eventError, setEventError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [todos, setTodos] = useState<CalendarTodo[]>([]);
  const [todosLoading, setTodosLoading] = useState(true);
  const [todoError, setTodoError] = useState("");
  const [todoTitle, setTodoTitle] = useState("");
  const [todoSaving, setTodoSaving] = useState(false);
  const [todoBusyId, setTodoBusyId] = useState<string | null>(null);

  const monthKey = selectedDate.slice(0, 7);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/calendar?month=${monthKey}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "일정을 불러오지 못했어요.");
      setTasks(payload.tasks || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "일정을 불러오지 못했어요."); }
    finally { setLoading(false); }
  }, [monthKey]);

  const loadTodos = useCallback(async () => {
    setTodosLoading(true); setTodoError("");
    try {
      const response = await fetch("/api/calendar/todos", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "할 일을 불러오지 못했어요.");
      setTodos(payload.todos || []);
    } catch (loadError) { setTodoError(loadError instanceof Error ? loadError.message : "할 일을 불러오지 못했어요."); }
    finally { setTodosLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadTodos(); }, [loadTodos]);
  useEffect(() => {
    const refresh = () => { void load(); void loadTodos(); };
    window.addEventListener("olivia-resource-updated", refresh);
    window.addEventListener("olivia-calendar-updated", refresh);
    return () => { window.removeEventListener("olivia-resource-updated", refresh); window.removeEventListener("olivia-calendar-updated", refresh); };
  }, [load, loadTodos]);

  const selectedTasks = useMemo(() => tasks.filter((task) => task.date === selectedDate), [selectedDate, tasks]);
  const monthGrid = useMemo(() => getMobileCalendarMonthGrid(selectedDate), [selectedDate]);
  const taskDates = useMemo(() => new Set(tasks.map((task) => task.date)), [tasks]);
  const sortedTodos = useMemo(() => [...todos].sort((left, right) => Number(left.completed) - Number(right.completed) || left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt)), [todos]);

  const openTask = (task: CalendarTask) => { setEventError(""); setDraft(null); setActiveTask(task); };
  const move = (direction: -1 | 1) => {
    if (view === "month") setSelectedDate((current) => moveMobileCalendarMonth(current, direction));
    else setSelectedDate((current) => moveMobileCalendarDate(current, (view === "week" ? 7 : 1) * direction));
  };

  const save = async () => {
    if (!draft?.title.trim() || !draft.date || saving) return;
    const startMinutes = mobileCalendarTimeToMinutes(draft.time);
    const endMinutes = mobileCalendarTimeToMinutes(draft.endTime);
    if (!draft.allDay && startMinutes != null && endMinutes != null && endMinutes <= startMinutes) { setEventError("종료 시간은 시작 시간보다 뒤여야 합니다."); return; }
    setSaving(true); setEventError("");
    try {
      const response = await fetch("/api/calendar", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(draft.id ? { id: draft.id } : {}), title: draft.title.trim(), date: draft.date,
          time: draft.allDay ? null : draft.time || null, end_time: draft.allDay ? null : draft.endTime || null,
          location: draft.location.trim() || null, memo: draft.memo.trim(),
          reminder_enabled: draft.allDay ? false : draft.reminderEnabled, reminder_minutes_before: draft.reminderMinutes,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "일정을 저장하지 못했어요.");
      const savedTask: CalendarTask = {
        id: draft.id || payload.id, title: draft.title.trim(), date: draft.date,
        time: draft.allDay ? null : draft.time, end_time: draft.allDay ? null : draft.endTime,
        location: draft.location.trim() || null, memo: draft.memo.trim(), category: draft.category || activeTask?.category || "general",
        reminder_enabled: !draft.allDay && draft.reminderEnabled, reminder_minutes_before: draft.reminderMinutes,
      };
      setSelectedDate(draft.date); setActiveTask(savedTask); setDraft(null);
      window.dispatchEvent(new CustomEvent("olivia-calendar-updated"));
      await load();
    } catch (saveError) { setEventError(saveError instanceof Error ? saveError.message : "일정을 저장하지 못했어요."); }
    finally { setSaving(false); }
  };

  const deleteEvent = async () => {
    if (!activeTask || deleting || !window.confirm("이 일정을 삭제할까요?")) return;
    setDeleting(true); setEventError("");
    try {
      const response = await fetch(`/api/calendar?id=${encodeURIComponent(activeTask.id)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "일정을 삭제하지 못했어요.");
      setActiveTask(null); setDraft(null); window.dispatchEvent(new CustomEvent("olivia-calendar-updated")); await load();
    } catch (deleteError) { setEventError(deleteError instanceof Error ? deleteError.message : "일정을 삭제하지 못했어요."); }
    finally { setDeleting(false); }
  };

  const addTodo = async () => {
    const title = todoTitle.trim(); if (!title || todoSaving) return;
    setTodoSaving(true); setTodoError("");
    try {
      const response = await fetch("/api/calendar/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "할 일을 추가하지 못했어요.");
      setTodos((current) => [...current, payload.todo as CalendarTodo]); setTodoTitle(""); window.dispatchEvent(new CustomEvent("olivia-calendar-updated"));
    } catch (saveError) { setTodoError(saveError instanceof Error ? saveError.message : "할 일을 추가하지 못했어요."); }
    finally { setTodoSaving(false); }
  };

  const toggleTodo = async (todo: CalendarTodo) => {
    if (todoBusyId) return;
    const completed = !todo.completed; setTodoBusyId(todo.id); setTodoError("");
    setTodos((current) => current.map((item) => item.id === todo.id ? { ...item, completed } : item));
    try {
      const response = await fetch("/api/calendar/todos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: todo.id, completed }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "완료 상태를 바꾸지 못했어요.");
      setTodos((current) => current.map((item) => item.id === todo.id ? payload.todo as CalendarTodo : item)); window.dispatchEvent(new CustomEvent("olivia-calendar-updated"));
    } catch (saveError) { setTodos((current) => current.map((item) => item.id === todo.id ? todo : item)); setTodoError(saveError instanceof Error ? saveError.message : "완료 상태를 바꾸지 못했어요."); }
    finally { setTodoBusyId(null); }
  };

  const deleteTodo = async (todo: CalendarTodo) => {
    if (todoBusyId) return;
    setTodoBusyId(todo.id); setTodoError(""); setTodos((current) => current.filter((item) => item.id !== todo.id));
    try {
      const response = await fetch(`/api/calendar/todos?id=${encodeURIComponent(todo.id)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "할 일을 삭제하지 못했어요.");
      window.dispatchEvent(new CustomEvent("olivia-calendar-updated"));
    } catch (saveError) { setTodos((current) => current.some((item) => item.id === todo.id) ? current : [...current, todo]); setTodoError(saveError instanceof Error ? saveError.message : "할 일을 삭제하지 못했어요."); }
    finally { setTodoBusyId(null); }
  };

  if (activeTask || draft) {
    return <CalendarEventScreen task={activeTask} draft={draft} saving={saving} deleting={deleting} error={eventError}
      onBack={() => { setEventError(""); if (draft && activeTask) setDraft(null); else { setDraft(null); setActiveTask(null); } }}
      onEdit={() => { if (activeTask) setDraft(draftForTask(activeTask)); }} onDraft={setDraft}
      onSave={() => void save()} onDelete={() => void deleteEvent()} />;
  }

  return (
    <section className={styles.screenWithHeader} aria-label="모바일 캘린더">
      <div className={`${styles.scrollBody} ${styles.calendarBody}`} data-calendar-view={view}>
        <div className={styles.segmented}>{VIEW_LABELS.map((item) => <button key={item.id} type="button" className={view === item.id ? styles.segmentedActive : undefined} onClick={() => { setView(item.id); if (item.id === "today") setSelectedDate(mobileCalendarDateKey()); }}>{item.label}</button>)}</div>
        <div className={styles.dateHeading}>
          <button type="button" onClick={() => move(-1)} aria-label={view === "month" ? "이전 달" : "이전 날짜"}><ChevronLeft size={20} /></button>
          <div><h2>{formatHeading(selectedDate, view === "month")}</h2></div>
          <button type="button" onClick={() => move(1)} aria-label={view === "month" ? "다음 달" : "다음 날짜"}><ChevronRight size={20} /></button>
        </div>
        <WeekStrip selectedDate={selectedDate} taskDates={taskDates} onSelect={setSelectedDate} onMoveWeek={(direction) => setSelectedDate((current) => moveMobileCalendarDate(current, direction * 7))} />

        {view === "month" ? <>
          <div className={styles.monthGrid} data-mobile-swipe-lock>
            {Array.from("일월화수목금토").map((day) => <span key={day}>{day}</span>)}
            {monthGrid.map(({ key, inMonth }) => <button type="button" key={key} data-outside={!inMonth || undefined} className={selectedDate === key ? styles.dateSelected : undefined} onClick={() => setSelectedDate(key)}>{parseMobileCalendarDate(key).getDate()}{taskDates.has(key) ? <i /> : null}</button>)}
          </div>
          <div className={styles.listHeading}><h3>선택한 날짜</h3><span>{selectedTasks.length}</span></div>
          <div className={styles.selectedSchedulePanel}>
            {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>일정을 확인하고 있어요...</div> : selectedTasks.length ? <div className={styles.scheduleList}>{selectedTasks.map((task) => <button type="button" key={task.id} onClick={() => openTask(task)}><span className={styles.scheduleTime}>{task.time?.slice(0, 5) || "종일"}</span><span className={styles.scheduleCopy}><strong>{task.title}</strong><small><MapPin size={12} />{task.location || "장소 미정"}</small></span><ChevronRight size={18} /></button>)}</div> : <div className={styles.emptyState}><CalendarDays size={22} /><span>{selectedDate === mobileCalendarDateKey() ? "오늘 예정된 일정이 없어요." : "이날 예정된 일정이 없어요."}</span></div>}
          </div>
          <section className={styles.todoSection} aria-labelledby="mobile-calendar-todos">
            <div className={styles.listHeading}><h3 id="mobile-calendar-todos">할 일</h3><span>{todos.length}</span></div>
            <form className={styles.todoComposer} onSubmit={(event) => { event.preventDefault(); void addTodo(); }}><input value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} placeholder="새 할 일을 입력하세요" maxLength={160} aria-label="새 할 일" /><button type="submit" disabled={todoSaving || !todoTitle.trim()} aria-label="할 일 추가"><Plus size={18} /></button></form>
            {todoError ? <div className={styles.todoError}><span>{todoError}</span><button type="button" onClick={() => void loadTodos()}>다시 시도</button></div> : null}
            {todosLoading ? <div className={styles.todoEmpty}>할 일을 확인하고 있어요...</div> : sortedTodos.length ? <div className={styles.todoList}>{sortedTodos.map((todo) => <div key={todo.id} className={todo.completed ? styles.todoCompleted : undefined}><button type="button" className={styles.todoToggle} disabled={todoBusyId === todo.id} onClick={() => void toggleTodo(todo)} aria-label={`${todo.title} ${todo.completed ? "미완료로 변경" : "완료"}`} aria-pressed={todo.completed}>{todo.completed ? <Check size={13} /> : null}</button><span>{todo.title}</span><button type="button" className={styles.todoDelete} disabled={todoBusyId === todo.id} onClick={() => void deleteTodo(todo)} aria-label={`${todo.title} 삭제`}><Trash2 size={15} /></button></div>)}</div> : <div className={styles.todoEmpty}>등록된 할 일이 없어요.</div>}
          </section>
        </> : error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>일정을 확인하고 있어요...</div> : <TimeAxis date={selectedDate} tasks={selectedTasks} onOpen={openTask} />}
      </div>
      <button type="button" className={styles.floatingAction} onClick={() => { setEventError(""); setDraft(emptyDraft(selectedDate)); }} aria-label="일정 추가"><Plus size={18} /><span>일정 추가</span></button>
    </section>
  );
}
