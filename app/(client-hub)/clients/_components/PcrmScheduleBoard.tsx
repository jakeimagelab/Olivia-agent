"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { C, R } from "@/lib/theme";

const CATS: Record<string, { label: string; color: string; bg: string }> = {
  shooting: { label: "촬영", color: "#E85D2C", bg: "#FFF0EB" },
  client:   { label: "고객", color: "#155855", bg: "#EAF4F2" },
  admin:    { label: "행정", color: "#EB8F22", bg: "#FFF3E0" },
  personal: { label: "개인", color: "#7C3AED", bg: "#F1E9FB" },
  general:  { label: "기타", color: "#5A7470", bg: "#F3F4F6" },
};
const CAT_KEYS = Object.keys(CATS);

type Task = {
  id: string;
  date: string;
  title: string;
  memo?: string;
  category: string;
  time?: string | null;
  end_time?: string | null;
  location?: string | null;
  completed?: boolean;
};

const cardStyle: React.CSSProperties = { background: C.white, border: `1px solid ${C.border}`, borderRadius: R.lg, boxShadow: "0 5px 18px rgba(21,88,85,.055)" };

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function buildWeeks(viewMonth: Date) {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const weeks: Date[][] = [];
  let cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export default function PcrmScheduleBoard() {
  const [viewMonth, setViewMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [nextMonthTasks, setNextMonthTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    const m1 = monthKey(viewMonth);
    const m2 = monthKey(addMonths(viewMonth, 1));
    Promise.all([
      fetch(`/api/calendar?month=${m1}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/calendar?month=${m2}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([a, b]) => {
        if (a.ok) setTasks(a.tasks || []);
        if (b.ok) setNextMonthTasks(b.tasks || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [viewMonth.getFullYear(), viewMonth.getMonth()]);

  const filteredTasks = useMemo(
    () => (categoryFilter ? tasks.filter((t) => t.category === categoryFilter) : tasks),
    [tasks, categoryFilter]
  );

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of filteredTasks) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date)!.push(t);
    }
    for (const list of map.values()) list.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    return map;
  }, [filteredTasks]);

  const upcoming = useMemo(() => {
    const todayStr = ymd(new Date());
    const all = categoryFilter
      ? [...tasks, ...nextMonthTasks].filter((t) => t.category === categoryFilter)
      : [...tasks, ...nextMonthTasks];
    return all.filter((t) => t.date >= todayStr).sort((a, b) => `${a.date}${a.time || ""}`.localeCompare(`${b.date}${b.time || ""}`)).slice(0, 10);
  }, [tasks, nextMonthTasks, categoryFilter]);

  const weeks = useMemo(() => buildWeeks(viewMonth), [viewMonth]);
  const todayStr = ymd(new Date());

  const saveTask = async (payload: Record<string, unknown>, id?: string) => {
    setSaving(true);
    try {
      if (id) {
        const res = await fetch("/api/calendar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...payload }) });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || "저장 실패");
      } else {
        const res = await fetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || "저장 실패");
      }
      setOpenDate(null);
      setSelectedTask(null);
      load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (id: string) => {
    if (!window.confirm("이 일정을 삭제할까요?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar?id=${id}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "삭제 실패");
      setSelectedTask(null);
      load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pcrm-dashboard">
      <div className="pcrm-dashboard-title">
        <div>
          <span>PCRM · PHOTOCLINIC CRM</span>
          <h1>일정 관리</h1>
          <small style={{ display: "block", marginTop: 4, fontSize: 11, fontWeight: 700, color: C.muted }}>
            촬영·상담·행정 일정을 한 곳에서 확인하고 등록할 수 있습니다.
          </small>
        </div>
        <div className="pcrm-dashboard-actions">
          <Link href="/calendar" className="pcrm-inline-action" style={{ height: 40 }}><ExternalLink size={13} /> 전체 캘린더 열기</Link>
          <button type="button" onClick={() => setOpenDate(todayStr)}><Plus size={16} /> 일정 등록</button>
        </div>
      </div>

      <div className="pcrm-cal-toolbar">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">전체 일정</option>
          {CAT_KEYS.map((key) => <option key={key} value={key}>{CATS[key].label}</option>)}
        </select>
        <div className="pcrm-cal-nav">
          <button type="button" onClick={() => setViewMonth((d) => addMonths(d, -1))} aria-label="이전 달"><ChevronLeft size={16} /></button>
          <b>{viewMonth.getFullYear()}년 {viewMonth.getMonth() + 1}월</b>
          <button type="button" onClick={() => setViewMonth((d) => addMonths(d, 1))} aria-label="다음 달"><ChevronRight size={16} /></button>
        </div>
        <button type="button" className="pcrm-cal-today" onClick={() => setViewMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>오늘</button>
        <div className="pcrm-cal-legend">
          {CAT_KEYS.map((key) => <span key={key}><i style={{ background: CATS[key].color }} />{CATS[key].label}</span>)}
        </div>
      </div>

      <div className="pcrm-cal-layout">
        <div className="pcrm-cal-grid">
          <div className="pcrm-cal-weekdays">
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="pcrm-cal-weeks">
            {weeks.map((week, wi) => (
              <div className="pcrm-cal-week" key={wi}>
                {week.map((day) => {
                  const dateStr = ymd(day);
                  const outside = day.getMonth() !== viewMonth.getMonth();
                  const dayTasks = tasksByDate.get(dateStr) || [];
                  const visible = dayTasks.slice(0, 3);
                  const overflow = dayTasks.length - visible.length;
                  return (
                    <div
                      key={dateStr}
                      className="pcrm-cal-day"
                      data-outside={outside}
                      data-today={dateStr === todayStr}
                      onClick={() => setOpenDate(dateStr)}
                    >
                      <span className="pcrm-cal-day__num">{day.getDate()}</span>
                      <div className="pcrm-cal-day__events">
                        {visible.map((t) => {
                          const cat = CATS[t.category] || CATS.general;
                          return (
                            <div
                              key={t.id}
                              className="pcrm-cal-chip"
                              style={{ background: cat.bg, color: cat.color }}
                              onClick={(e) => { e.stopPropagation(); setSelectedTask(t); }}
                            >
                              <i style={{ background: cat.color }} />
                              {t.time ? `${t.time.slice(0, 5)} ` : ""}{t.title}
                            </div>
                          );
                        })}
                        {overflow > 0 && <span className="pcrm-cal-more">+{overflow}건 더보기</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <aside className="pcrm-cal-upcoming" style={cardStyle}>
          <header><h2>다가오는 일정</h2></header>
          {loading ? (
            <p className="pcrm-empty-copy">불러오는 중...</p>
          ) : upcoming.length === 0 ? (
            <p className="pcrm-empty-copy">예정된 일정이 없습니다.</p>
          ) : upcoming.map((t) => {
            const cat = CATS[t.category] || CATS.general;
            return (
              <div key={t.id} className="pcrm-cal-upcoming-row" role="button" onClick={() => setSelectedTask(t)}>
                <time>{t.time ? t.time.slice(0, 5) : "종일"}</time>
                <span className="pcrm-cal-upcoming-row__body">
                  <strong>{t.title}</strong>
                  <small>{t.date.slice(5).replace("-", ".")} {t.location ? `· ${t.location}` : ""}</small>
                </span>
                <span className="pcrm-cal-upcoming-row__badge" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
              </div>
            );
          })}
        </aside>
      </div>

      {openDate && (
        <TaskFormPopover
          date={openDate}
          saving={saving}
          onClose={() => setOpenDate(null)}
          onSave={(payload) => saveTask(payload)}
        />
      )}
      {selectedTask && (
        <TaskFormPopover
          date={selectedTask.date}
          task={selectedTask}
          saving={saving}
          onClose={() => setSelectedTask(null)}
          onSave={(payload) => saveTask(payload, selectedTask.id)}
          onDelete={() => deleteTask(selectedTask.id)}
          onCopy={(payload) => saveTask(payload)}
        />
      )}
    </div>
  );
}

function TaskFormPopover({ date, task, saving, onClose, onSave, onDelete, onCopy }: {
  date: string; task?: Task; saving: boolean;
  onClose: () => void; onSave: (payload: Record<string, unknown>) => void; onDelete?: () => void;
  onCopy?: (payload: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(task?.title || "");
  const [category, setCategory] = useState(task?.category || "shooting");
  const [time, setTime] = useState(task?.time?.slice(0, 5) || "");
  const [endTime, setEndTime] = useState(task?.end_time?.slice(0, 5) || "");
  const [location, setLocation] = useState(task?.location || "");
  const [memo, setMemo] = useState(task?.memo || "");
  const [taskDate, setTaskDate] = useState(date);

  const buildPayload = () => ({ date: taskDate, title: title.trim(), category, time: time || null, end_time: endTime || null, location: location || null, memo });

  const submit = () => {
    if (!title.trim()) { alert("일정 제목을 입력해주세요."); return; }
    onSave(buildPayload());
  };

  const copy = () => {
    if (!title.trim()) { alert("일정 제목을 입력해주세요."); return; }
    onCopy?.(buildPayload());
  };

  return (
    <div className="pcrm-cal-popover" onClick={onClose}>
      <div className="pcrm-cal-popover__card" onClick={(e) => e.stopPropagation()}>
        <div className="pcrm-cal-popover__header">
          <h3>{task ? "일정 수정" : "일정 등록"}</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="pcrm-cal-popover__body">
          <label>제목<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="일정 제목" /></label>
          <div className="pcrm-cal-popover__row">
            <label>날짜<input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} /></label>
            <label>구분
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CAT_KEYS.map((key) => <option key={key} value={key}>{CATS[key].label}</option>)}
              </select>
            </label>
          </div>
          <div className="pcrm-cal-popover__row">
            <label>시작 시간<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
            <label>종료 시간<input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
          </div>
          <label>장소<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="장소 (선택)" /></label>
          <label>메모<textarea rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" /></label>
        </div>
        <div className="pcrm-cal-popover__footer">
          {task && onDelete ? (
            <button type="button" className="pc-btn pc-btn--ghost pc-btn--sm danger" disabled={saving} onClick={onDelete}><Trash2 size={13} /> 삭제</button>
          ) : <span />}
          <button type="button" className="pc-btn pc-btn--orange pc-btn--sm" disabled={saving} onClick={submit}>{saving ? "저장 중..." : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
