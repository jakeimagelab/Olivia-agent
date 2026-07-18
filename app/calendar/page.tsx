"use client";
// 캘린더 UI/UX 개편 (팝업 추가/수정, 전체화면 그리드, 모바일 드릴다운 내비게이션)

import Link from "next/link";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Check, Pencil, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";

/* ─── types ──────────────────────────────────────────── */
type ViewMode = "day" | "week" | "month" | "year";

type ConsultEntry = {
  hospital: string;
  summary: string;
  items: string[];
  budget: string;
  savedAt: string;
};

type MemoExtracted = {
  summary?: string; hospital_name?: string; manager_name?: string;
  phone?: string; preferred_date?: string; budget?: string;
  shooting_items?: string[]; special_notes?: string;
  recommended_package?: string; next_action?: string;
};

type CalTask = {
  id: string; date: string; title: string; memo: string;
  category: keyof typeof CATS; completed: boolean; created_at: string;
  time?: string | null; end_time?: string | null; location?: string | null;
};

/* ─── constants ───────────────────────────────────────── */
const C = {
  teal: "#0F4440", orange: "#E85D2C",
  bg: "#C8DBD8", surface: "#FFFFFF", border: "#93BAB4",
  cellBg: "#FAFCFB",
  muted: "#3D5C58", hint: "#6B9E98", txt: "#111E1C", mint: "#E4F2EF",
  todayRed: "#E8392C",
};

const CATS: Record<string, { label: string; color: string; bg: string }> = {
  shooting: { label: "촬영",    color: "#E85D2C", bg: "#FFF0EB" },
  client:   { label: "고객",    color: "#155855", bg: "#EAF4F2" },
  admin:    { label: "행정",    color: "#EB8F22", bg: "#FFF3E0" },
  personal: { label: "개인",    color: "#000000", bg: "#ECECEC" },
  general:  { label: "기타",    color: "#5A7470", bg: "#F3F4F6" },
};

/* 일정 드래그용 커스텀 마우스 커서 — 기본 OS grab/grabbing 손 아이콘 대신 그라디언트+그림자로
   입체감(눌린 듯한 원형 손잡이) 있는 커서를 씀. SVG data URI는 사파리 등 일부 브라우저에서
   cursor: url()에 잘 안 그려지는(특히 그라디언트가 있으면) 이슈가 있어, 미리 32x32 PNG로
   래스터화해서 base64로 박아넣는다 — 모든 브라우저에서 동일하게 보장되는 방식. */
const CURSOR_GRAB =
  `url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEaElEQVR4nOxXW2wUZRQ+/8yyu71sttuLlEa70QRoRFBqjamkVgISm2h8RQNPhndUjJoYffDFFyWYGF94NDExaow+iIVgSxSI2NpWpFelUCnba9jdmdmdmf/iOTOzG16m7haSvvRsTv75558933euO6vBBosGGyybBDacQASqlX37EvXxSBcD1skAnqJbCuCKYjBkcPgdBgaMasyxip/s64slHOsDBH6LMYhojKl06zZBRzcyt3WpFFMKOFr8KDe/+CFcu+ZUYrYiAvUHevdrDE7j448cP/yKfOnZXq29tRWQBCAwOJzD9flb8N3goDr97TfIEaYl044ZZ38evGcCiQO9PQh0IZlIiM/ffld/Zs8e0JkGCoEx9MCFAKGkt3Ip4dfREThx8iQ3C1ZEAvTkzw38sn4Chw7VNUj3r2Si/sEzn36mtzU1ga7pnuf0TYGAQgpwA3AiQdez8/Nw9P33hGEaN7NabDf095thEGt2QVI4p9DP9Cevv6lvbUwhuIbKYEtE96JAe1ZayRskRtxaW5rhjSNHdbzzcEI4H6+FEU7g4MEkWn3t5ef2q569ez3j3hcQULsLVAvul86Z98H22LULup94XGGtHoPu7pqqCdRL50laj/T1eZZLOad8+6GX3l7Sqvzz8nOeSnj+6W6KiZaojXZVTQA96iKvtre3ByCqDOwKjjkXXs6pC6TyyShvVf65kNDa3BjYguoJYKq70m1tkoqOQHgA7le78EC8vfRJ0LVPBtvS5agOUmGQSiaxGcIJhE5CnCtScKEo5EwGzYJuasistC9574P7a9FxoGAXoei6eG1T5DAoLNzRsAMM28jcQkYng2XPld9mbhABHrRgaQ7QQDIsC8xiESzUnGnCnVxORwZ/VE0AeY/QOjQ+Dg6BIYjLRdDrPCAhynPARo+zpgF5JEAkrGIB/pn7NwBhw2E4oSlAmyMRPP3yzI9yRzqt1cRiEI9FyZjXcl7RYyZc9NrGKBkIaBYKntdEImdacGlslPKvZVnkShiOHnbgzs4a0fRDnXMLCx3bWlqgOZXCwnK9MJO3NhYZARIwAeYROGchuGl5JIYnxuHyyChTgn9lnx/4omoCJI6E32INyVeHJybjnR0dGgoWmI2K4AhsBeAU8nygOUzD7eUl+Pqnc0JwvpQbnz4MhnFnXQQgm7WgJpaD2poXLwwNgY4juKkhBZbtF5kXgYJVJpFDvTw2Bj+cH6A2ZM6t+eP8xs2LaEmsjwCVwvLKshaP/y1jsa6rMzN1E7PXwcU+p4FDBUnAmZUV+HN6Bs5evARjk1PAXb5kZxbfsSem+tHG8loAlbwP0DOPQTL5QGL3oye0eOyF0kGirg47VDKMRLmbZKH4fX706ikMewa34+BNj7WNVyJR1O2EGWlsbNjStnWnXle7Q4tGd0oMhbTtSWVak25mcZqvrlK+86hTqO7/Ga78lcyXFGo7ativWwF1DnUVKpRqCZQkGpCouQu4iGpDlbJeAvdNNv+YbBL4DwAA//94ieNhAAAABklEQVQDAP+QqL+odE2TAAAAAElFTkSuQmCC") 16 16, grab`;
const CURSOR_GRABBING =
  `url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADtElEQVR4nOxWT28TRxR/M7NeG5OEVjZRnBglUaiicmmlCIoqoFbSoqIKekpKVVWilx7aQ79ApUrtqV+iVQ+9tZeqSikEKTiBgEQSIgExIomRCYS/UZw4tmd3Z4b3xgRO2LGFlIufPJrZmdn3+72/aw47LBx2WJoEmgR2nIAD9crwsIg+e/iew/hhAPZhZdNcDpiZKo6l5/BB16OO1XO5bfCjE6GQ81ugVAc9J+J7lQEDD58+FfTsCPEgCIIz+QsXz29X57YItA4NxQRXvxsDJ9/v7zenjx9nvV1JBOSgtIZiuQwL95bhrwtjJpPNMuT0t3Hkt+v/T62+EQKJz05c1KCOfD/yBU8NDCCwY18k6/0gwKGg7EuQvg/p6Rn4879RLRifeDR6LlVLt6h1oXUwdSbQwQ/fjYywTw59ABHXhXAoBC4OwQUgkCVCP40u6twbh93RKJvNZHrc3p67XvbuXMMEokePJlxXnB04cMD95tQpBA9b8F04hxyHYk64YAhcGySgAfMDOuJxuJPLwdp6/mPe1/WHv3Rv43UYVctQhMVXaNXuk8eOobXcDheByfpoJILrEIQwHPYM84EzBhzXDOfBQweJXIvQoS+rYVQtQ4xzN819yaS1dCthCIjWzG4YC2jIDaySGXSabG/f0rGvGkb1RmRMd3sspsndBl0caGVdXPY9KHmVpAuwChTuEQGNaxsODIWD7+xpaVWMmX0NewD5b6JiQ6XmqwCcQIBknk02ayvOMvDxTNlB94gknRPRin9ANkwAs3v2yerq6U2sc/EitqScyo5zZhOPgDwiYcsxsN7w0TPFUgnyhQ2BVGcaJoDxmaU5e38Z+rt7rMUEIMSr4iECNKTnWSIekijjOreyUjFC65kaGK+X/FphXAB7MDo5aSjeFPcSKi/KMpSktB3Q7slKPtg7tIfWX7o+pzAZcwXN09UwqjeilRXNuxI3H6/lv367rQ0S2GQoxls5Yd3vk+tfgReKRbh28xZcm5/nSsrPvfRktnECKH5uedFNdh6cz+X2RyO7WEc89tLtNu5IZMsbRQSfRvCxq1dNIOU/hYmpX2vpr0mAJNzbd84E3tCNpaXOBexwLdGobThEoFguwcbmJizix+jf9ARMZzKgfH+aRfSwXFwu1dJdz+eYtRw5/BMPh3/EahCUkLG39lBRwGo+z180I6VL8pfC5Ss/g63AbSiFOqUtldqvlfwUa/Id9MK7uIUpoW8j+gIX4bPr4+ML9eirm8Cbluaf0iaBJoHnAAAA///xsNStAAAABklEQVQDAIN1A2x0naawAAAAAElFTkSuQmCC") 16 16, grabbing`;

const WEEKDAYS = ["일","월","화","수","목","금","토"];

/* 매일 반복되는 개인 루틴 — 특정 날짜에 매인 일정이 아니라서 Supabase에 저장하지 않고
   월 화면 하단 빈 공간에 고정 안내로 띄운다. */
const DAILY_ROUTINE: { time: string; label: string }[] = [
  { time: "07:30", label: "명상" },
  { time: "08:40", label: "은우 등원" },
  { time: "10:00", label: "업무시작(출근)" },
  { time: "11:00", label: "운동" },
  { time: "12:00", label: "감사일기" },
];
const HOURS = Array.from({length: 15}, (_, i) => i + 7); // 07:00~21:00
const HOUR_HEIGHT = 64; // px per hour

const TIME_OPTIONS = Array.from({length: 31}, (_, i) => {
  const totalMin = 7 * 60 + i * 30;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}); // "07:00" ~ "22:00" in 30-min steps

function nextHourTime(t: string, hrs = 1): string {
  const idx = TIME_OPTIONS.indexOf(t);
  const newIdx = idx + hrs * 2;
  return newIdx >= 0 && newIdx < TIME_OPTIONS.length ? TIME_OPTIONS[newIdx] : TIME_OPTIONS[TIME_OPTIONS.length - 1];
}

/* ─── helpers ─────────────────────────────────────────── */
function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

type TimedLayout = { left: string; width: string; column: number; columns: number };

function layoutOverlappingTasks(tasks: CalTask[]): Map<string, TimedLayout> {
  const entries = tasks
    .filter((task): task is CalTask & { time: string } => Boolean(task.time))
    .map((task) => {
      const start = timeToMinutes(task.time);
      const rawEnd = task.end_time ? timeToMinutes(task.end_time) : start + 60;
      return { task, start, end: rawEnd > start ? rawEnd : start + 60 };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const result = new Map<string, TimedLayout>();
  let group: typeof entries = [];
  let groupEnd = -1;

  const placeGroup = () => {
    if (!group.length) return;
    const columnEnds: number[] = [];
    const placements = group.map((entry) => {
      let column = columnEnds.findIndex((end) => end <= entry.start);
      if (column === -1) column = columnEnds.length;
      columnEnds[column] = entry.end;
      return { entry, column };
    });
    const columns = Math.max(1, columnEnds.length);
    placements.forEach(({ entry, column }) => {
      const width = 100 / columns;
      result.set(entry.task.id, {
        column,
        columns,
        left: `calc(${column * width}% + 2px)`,
        width: `calc(${width}% - 4px)`,
      });
    });
  };

  entries.forEach((entry) => {
    if (group.length && entry.start >= groupEnd) {
      placeGroup();
      group = [];
      groupEnd = -1;
    }
    group.push(entry);
    groupEnd = Math.max(groupEnd, entry.end);
  });
  placeGroup();
  return result;
}

function formatTimeKo(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h < 12 ? "오전" : "오후";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return m === 0 ? `${period} ${h12}시` : `${period} ${h12}:${String(m).padStart(2,"0")}`;
}

function monthLabel(m: number) { return `${m+1}월`; }

function getWeekDates(dateStr: string): Date[] {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  return Array.from({length: 7}, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() - dow + i);
    return day;
  });
}

type MonthCell = { year: number; month: number; day: number; isCurrent: boolean };

function buildMonthCells(year: number, month: number) {
  const first    = new Date(year, month, 1).getDay();
  const days     = new Date(year, month+1, 0).getDate();
  const prevY    = month === 0 ? year-1 : year;
  const prevM    = month === 0 ? 11 : month-1;
  const prevDays = new Date(prevY, prevM+1, 0).getDate();
  const nextY    = month === 11 ? year+1 : year;
  const nextM    = month === 11 ? 0 : month+1;

  const cells: MonthCell[] = [];
  for (let i = first-1; i >= 0; i--)
    cells.push({ year: prevY, month: prevM, day: prevDays-i, isCurrent: false });
  for (let d = 1; d <= days; d++)
    cells.push({ year, month, day: d, isCurrent: true });
  let nd = 1;
  while (cells.length % 7 !== 0)
    cells.push({ year: nextY, month: nextM, day: nd++, isCurrent: false });
  return { cells, first };
}

/* ─── TimeSelect ─────────────────────────────────────── */
function TimeSelect({ value, onChange, placeholder = "시간 없음" }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: "6px 8px", outline: "none", background: "#FAFAFA",
        color: value ? C.txt : C.hint, cursor: "pointer", fontFamily: "inherit", flex: 1 }}>
      <option value="">{placeholder}</option>
      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

/* ─── TaskItem ────────────────────────────────────────── */
function TaskItem({
  task, compact, onToggle, onDelete, onEdit,
}: { task: CalTask; compact?: boolean; onToggle: () => void; onDelete: () => void; onEdit?: (t: CalTask) => void }) {
  const cat = CATS[task.category] ?? CATS.general;
  const [expanded, setExpanded] = useState(false);
  const [editing,  setEditing]  = useState(false);
  const hasDetail = !!(task.time || task.location || task.memo);

  if (editing) return (
    <EditTaskForm task={task}
      onSave={updated => { onEdit?.(updated); setEditing(false); }}
      onCancel={() => setEditing(false)}/>
  );

  if (compact) return (
    <div style={{
      display: "flex", alignItems: "center", gap: 3,
      padding: "2px 5px", borderRadius: 3,
      background: cat.color + "18", borderLeft: `2.5px solid ${cat.color}`,
      overflow: "hidden",
    }}>
      {task.time && <span style={{ fontSize: 9, color: cat.color, fontWeight: 800, flexShrink: 0 }}>{task.time.slice(0,5)}</span>}
      <span style={{ fontSize: 10, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        textDecoration: task.completed ? "line-through" : "none", opacity: task.completed ? 0.55 : 1, fontWeight: 700 }}>
        {task.title}
      </span>
    </div>
  );

  return (
    <div style={{
      background: task.completed ? "#F9FAFB" : C.surface,
      border: `1.5px solid ${expanded ? cat.color + "50" : task.completed ? "#E5E7EB" : C.border}`,
      borderRadius: 12, opacity: task.completed ? .7 : 1,
      transition: "all .15s", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        cursor: hasDetail ? "pointer" : "default" }}
        onClick={() => hasDetail && setExpanded(v => !v)}>
        {/* checkbox */}
        <button onClick={e => { e.stopPropagation(); onToggle(); }} style={{
          width: 22, height: 22, borderRadius: "50%",
          border: `2px solid ${task.completed ? cat.color : C.border}`,
          background: task.completed ? cat.color : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", flexShrink: 0, transition: "all .15s",
        }}>
          {task.completed && <Check size={12} color="#fff" strokeWidth={3}/>}
        </button>

        {/* title + meta stacked */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: task.completed ? C.hint : C.txt,
            textDecoration: task.completed ? "line-through" : "none",
            lineHeight: 1.35, marginBottom: 3,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {task.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: cat.color, background: cat.bg,
              padding: "1px 7px", borderRadius: 99 }}>{cat.label}</span>
            {task.time && (
              <span style={{ fontSize: 11, fontWeight: 700, color: C.teal }}>
                ⏰ {task.time.slice(0,5)}{task.end_time ? ` – ${task.end_time.slice(0,5)}` : ""}
              </span>
            )}
            {task.location && (
              <span style={{ fontSize: 11, color: C.muted }}>📍 {task.location}</span>
            )}
          </div>
        </div>

        {hasDetail && (
          <span style={{ fontSize: 11, color: C.hint, transition: "transform .2s",
            transform: expanded ? "rotate(180deg)" : "none", flexShrink: 0 }}>▾</span>
        )}
        <button onClick={e => { e.stopPropagation(); setEditing(true); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.hint, padding: 2,
            display: "flex", flexShrink: 0 }}>
          <Pencil size={14}/>
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.hint, padding: 2,
            display: "flex", flexShrink: 0 }}>
          <Trash2 size={14}/>
        </button>
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${cat.color}20`, background: cat.bg + "60",
          padding: "10px 14px 12px 44px", display: "flex", flexDirection: "column", gap: 6 }}>
          {task.time && <div style={{ display: "flex", gap: 6, fontSize: 12, color: C.txt, fontWeight: 700 }}>
            <span style={{ color: C.teal }}>⏰</span>
            {task.time.slice(0,5)}{task.end_time ? ` – ${task.end_time.slice(0,5)}` : ""}
          </div>}
          {task.location && <div style={{ display: "flex", gap: 6, fontSize: 12, color: C.txt }}>
            <span>📍</span>{task.location}
          </div>}
          {task.memo && (
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7,
              borderLeft: `2px solid ${cat.color}`, paddingLeft: 10, marginTop: 2,
              whiteSpace: "pre-wrap" }}>
              {task.memo}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── AddTaskForm ─────────────────────────────────────── */
function AddTaskForm({ date, onAdd, triggerKey = 0, defaultTime }: {
  date: string; onAdd: (t: CalTask) => void; triggerKey?: number; defaultTime?: string;
}) {
  const [open,     setOpen]     = useState(false);
  const [title,    setTitle]    = useState("");
  const [memo,     setMemo]     = useState("");
  const [time,     setTime]     = useState(defaultTime ?? "");
  const [endTime,  setEndTime]  = useState(defaultTime ? nextHourTime(defaultTime) : "");
  const [location, setLocation] = useState("");
  const [cat,      setCat]      = useState<keyof typeof CATS>("general");
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const prevKey  = useRef(0);

  useEffect(() => {
    if (triggerKey > 0 && triggerKey !== prevKey.current) {
      prevKey.current = triggerKey;
      setOpen(true);
      setTime(defaultTime ?? "");
      setEndTime(defaultTime ? nextHourTime(defaultTime) : "");
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [triggerKey, defaultTime]);

  const handleTimeChange = (v: string) => {
    setTime(v);
    if (v && !endTime) setEndTime(nextHourTime(v));
  };

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/calendar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, title: title.trim(), memo: memo.trim(),
          category: cat, time: time || null, end_time: endTime || null,
          location: location.trim() || null }),
      });
      const d = await r.json();
      if (d.ok) {
        onAdd({ id: d.id, date, title: title.trim(), memo: memo.trim(), category: cat,
          completed: false, created_at: new Date().toISOString(),
          time: time || null, end_time: endTime || null, location: location.trim() || null });
        setTitle(""); setMemo(""); setTime(""); setEndTime(""); setLocation(""); setCat("general"); setOpen(false);
      } else setErr(d.error ?? "저장 실패");
    } catch { setErr("네트워크 오류"); }
    finally { setBusy(false); }
  };

  if (!open) return (
    <button onClick={() => { setOpen(true); setTimeout(() => titleRef.current?.focus(), 50); }}
      className="pc-btn pc-btn--ghost" style={{ width: "100%", justifyContent: "flex-start" }}>
      <Plus size={14}/> 할일 추가
    </button>
  );

  return (
    <div style={{ background: C.surface, border: `1.5px solid ${C.teal}`,
      borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <input ref={titleRef} value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()} placeholder="할일 제목"
        style={{ fontSize: 14, fontWeight: 700, border: "none", outline: "none",
          background: "transparent", color: C.txt, width: "100%" }}/>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <TimeSelect value={time} onChange={handleTimeChange} placeholder="시작 시간"/>
        {time && <>
          <span style={{ fontSize: 11, color: C.hint, flexShrink: 0 }}>~</span>
          <TimeSelect value={endTime} onChange={setEndTime} placeholder="종료 시간"/>
        </>}
      </div>
      <input type="text" value={location} onChange={e => setLocation(e.target.value)}
        placeholder="장소 (선택)"
        style={{ fontSize: 13, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "6px 10px", outline: "none", background: "#FAFAFA", color: C.txt }}/>
      <div style={{ display: "flex", gap: 6 }}>
        {Object.entries(CATS).map(([key, v]) => (
          <button key={key} onClick={() => setCat(key as keyof typeof CATS)} style={{
            padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 800, cursor: "pointer",
            border: `1.5px solid ${cat === key ? v.color : C.border}`,
            background: cat === key ? v.color : "transparent",
            color: cat === key ? "#fff" : C.muted,
          }}>{v.label}</button>
        ))}
      </div>
      <textarea value={memo} onChange={e => setMemo(e.target.value)}
        placeholder="메모 (선택) — 상담 내용, 준비물, 특이사항 등" rows={2}
        style={{ fontSize: 12, color: C.muted, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "8px 10px", resize: "none", background: "#FAFAFA", outline: "none" }}/>
      {err && <div style={{ fontSize: 11, color: "#E85D2C", background: "#FFF0EB",
        borderRadius: 6, padding: "6px 10px" }}>⚠️ {err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={busy || !title.trim()} className="pc-btn pc-btn--primary pc-btn--sm" style={{ flex: 1 }}>{busy ? "저장 중…" : "저장"}</button>
        <button onClick={() => setOpen(false)} className="pc-btn pc-btn--secondary pc-btn--sm" style={{ width: 70 }}>취소</button>
      </div>
    </div>
  );
}

/* ─── EditTaskForm ────────────────────────────────────── */
function EditTaskForm({ task, onSave, onCancel }: {
  task: CalTask; onSave: (updated: CalTask) => void; onCancel: () => void;
}) {
  const [title,    setTitle]    = useState(task.title);
  const [memo,     setMemo]     = useState(task.memo);
  const [time,     setTime]     = useState(task.time || "");
  const [endTime,  setEndTime]  = useState(task.end_time || "");
  const [location, setLocation] = useState(task.location || "");
  const [cat,      setCat]      = useState<keyof typeof CATS>(task.category);
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");

  const handleTimeChange = (v: string) => {
    setTime(v);
    if (v && !endTime) setEndTime(nextHourTime(v));
  };

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/calendar", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, title: title.trim(), memo: memo.trim(),
          category: cat, time: time || null, end_time: endTime || null,
          location: location.trim() || null }),
      });
      const d = await r.json();
      if (d.ok) {
        onSave({ ...task, title: title.trim(), memo: memo.trim(), category: cat,
          time: time || null, end_time: endTime || null, location: location.trim() || null });
      } else setErr(d.error ?? "수정 실패");
    } catch { setErr("네트워크 오류"); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ background: C.surface, border: `1.5px solid ${C.teal}`,
      borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: C.teal, letterSpacing: ".06em" }}>✏️ 편집</div>
        <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: C.muted,
          background: C.mint, padding: "3px 10px", borderRadius: 20 }}>
          {new Date(task.date + "T12:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
        </div>
      </div>
      <input value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()} placeholder="할일 제목"
        style={{ fontSize: 14, fontWeight: 700, border: "none", borderBottom: `1px solid ${C.border}`,
          outline: "none", background: "transparent", color: C.txt, width: "100%", paddingBottom: 4 }}/>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <TimeSelect value={time} onChange={handleTimeChange} placeholder="시작 시간"/>
        {time && <>
          <span style={{ fontSize: 11, color: C.hint, flexShrink: 0 }}>~</span>
          <TimeSelect value={endTime} onChange={setEndTime} placeholder="종료 시간"/>
        </>}
      </div>
      <input type="text" value={location} onChange={e => setLocation(e.target.value)}
        placeholder="장소 (선택)"
        style={{ fontSize: 13, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "6px 10px", outline: "none", background: "#FAFAFA", color: C.txt }}/>
      <div style={{ display: "flex", gap: 6 }}>
        {Object.entries(CATS).map(([key, v]) => (
          <button key={key} onClick={() => setCat(key as keyof typeof CATS)} style={{
            padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 800, cursor: "pointer",
            border: `1.5px solid ${cat === key ? v.color : C.border}`,
            background: cat === key ? v.color : "transparent",
            color: cat === key ? "#fff" : C.muted,
          }}>{v.label}</button>
        ))}
      </div>
      <textarea value={memo} onChange={e => setMemo(e.target.value)}
        placeholder="메모 (선택)" rows={2}
        style={{ fontSize: 12, color: C.muted, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "8px 10px", resize: "none", background: "#FAFAFA", outline: "none" }}/>
      {err && <div style={{ fontSize: 11, color: "#E85D2C", background: "#FFF0EB",
        borderRadius: 6, padding: "6px 10px" }}>⚠️ {err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={busy || !title.trim()} className="pc-btn pc-btn--primary pc-btn--sm" style={{ flex: 1 }}>{busy ? "저장 중…" : "수정 저장"}</button>
        <button onClick={onCancel} className="pc-btn pc-btn--secondary pc-btn--sm" style={{ width: 70 }}>취소</button>
      </div>
    </div>
  );
}

/* ─── EventPopover ────────────────────────────────────────
   셀/일정 클릭 시 뜨는 팝업 — 데스크탑은 클릭 위치 근처에 뜨는 카드,
   모바일은 전체화면 시트. 실제 입력폼은 기존 AddTaskForm/EditTaskForm을 그대로 재사용한다. */
function EventPopover({ mode, date, task, anchor, isMobile, defaultTime, onClose, onAdd, onSave, onDelete, onToggle }: {
  mode: "add" | "edit";
  date: string;
  task: CalTask | null;
  anchor: { x: number; y: number } | null;
  isMobile: boolean;
  defaultTime?: string;
  onClose: () => void;
  onAdd: (t: CalTask) => void;
  onSave: (t: CalTask) => void;
  onDelete: (id: string) => void;
  onToggle: (t: CalTask) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false); // 편집 버튼을 눌러야 수정 폼(+삭제)이 나온다

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // 팝업이 뜨는 클릭 자체가 바로 닫히지 않도록 다음 tick에 리스너 등록
    const t = setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", close); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });

  const posStyle: React.CSSProperties = isMobile
    ? { position: "fixed", inset: 0, zIndex: 500 }
    : (() => {
        const W = 340;
        const maxH = typeof window !== "undefined" ? window.innerHeight - 32 : 600;
        let left = (anchor?.x ?? 200) + 14;
        let top = (anchor?.y ?? 200) - 20;
        if (typeof window !== "undefined") {
          if (left + W > window.innerWidth - 16) left = Math.max(16, window.innerWidth - W - 16);
          if (top + 460 > window.innerHeight - 16) top = Math.max(16, window.innerHeight - 460 - 16);
          if (top < 16) top = 16;
        }
        return { position: "fixed", left, top, zIndex: 500, width: W, maxHeight: maxH, overflowY: "auto" };
      })();

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 499, background: isMobile ? C.bg : "transparent" }}/>
      <div ref={ref} data-event-popover style={{
        ...posStyle,
        background: isMobile ? "transparent" : C.surface,
        borderRadius: isMobile ? 0 : 14,
        boxShadow: isMobile ? "none" : "0 20px 50px rgba(15,68,64,.28)",
        padding: isMobile ? "16px 16px 32px" : 16,
      }}>
        {isMobile && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.teal,
              fontSize: 15, fontWeight: 800, cursor: "pointer", padding: "6px 4px" }}>‹ 닫기</button>
            {mode === "edit" && task && editing && (
              <button onClick={() => { onDelete(task.id); onClose(); }} style={{
                background: "none", border: "none", color: "#DC2626", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                삭제
              </button>
            )}
          </div>
        )}
        {!isMobile && (
          <div style={{ fontSize: 11, fontWeight: 800, color: C.hint, marginBottom: 10 }}>{dateLabel}</div>
        )}
        {mode === "add" ? (
          <AddTaskForm key={`add-${date}-${anchor?.x}-${anchor?.y}`} date={date}
            onAdd={t => { onAdd(t); onClose(); }} triggerKey={1} defaultTime={defaultTime}/>
        ) : task && !editing ? (
          <EventDetailView task={task} onEdit={() => setEditing(true)} onToggle={() => onToggle(task)}/>
        ) : task && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <EditTaskForm key={task.id} task={task}
              onSave={t => { onSave(t); onClose(); }} onCancel={() => setEditing(false)}/>
            {!isMobile && (
              <button onClick={() => { onDelete(task.id); onClose(); }} className="pc-btn pc-btn--danger pc-btn--sm">
                🗑 일정 삭제
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ─── EventDetailView (읽기 전용, "편집" 눌러야 수정 폼으로 전환) ── */
function EventDetailView({ task, onEdit, onToggle }: { task: CalTask; onEdit: () => void; onToggle: () => void }) {
  const cat = CATS[task.category] ?? CATS.general;
  const [completed, setCompleted] = useState(task.completed); // 팝업 안에서 즉시 반영되도록 로컬로도 관리
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <button onClick={() => { setCompleted(v => !v); onToggle(); }} style={{
          width: 22, height: 22, borderRadius: "50%", marginTop: 4, flexShrink: 0,
          border: `2px solid ${completed ? cat.color : C.border}`,
          background: completed ? cat.color : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", transition: "all .15s", padding: 0,
        }}>
          {completed && <Check size={12} color="#fff" strokeWidth={3}/>}
        </button>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: cat.color, marginTop: 7, flexShrink: 0 }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: completed ? C.hint : C.txt, lineHeight: 1.35,
            textDecoration: completed ? "line-through" : "none" }}>{task.title}</div>
          <span style={{ display: "inline-block", marginTop: 5, fontSize: 11, fontWeight: 800, color: cat.color,
            background: cat.bg, padding: "2px 9px", borderRadius: 99 }}>{cat.label}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: C.muted }}>
        <div>📅 {new Date(task.date + "T12:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}</div>
        {task.time && (
          <div>⏰ {task.time.slice(0,5)}{task.end_time ? ` – ${task.end_time.slice(0,5)}` : ""}</div>
        )}
        {task.location && <div>📍 {task.location}</div>}
      </div>
      {task.memo && (
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, background: "#FAFCFB",
          border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", whiteSpace: "pre-wrap" }}>
          {task.memo}
        </div>
      )}
      <button onClick={onEdit} className="pc-btn pc-btn--primary">
        편집
      </button>
    </div>
  );
}

/* ─── ConsultMemoPanel ─────────────────────────────────── */
function ConsultMemoPanel({ dateStr, consultations, onAdd }: {
  dateStr: string;
  consultations: ConsultEntry[];
  onAdd: (t: CalTask) => void;
}) {
  const [rawMemo, setRawMemo] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<MemoExtracted | null>(null);
  const [edited, setEdited] = useState<MemoExtracted>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [calError, setCalError] = useState("");
  const [memoError, setMemoError] = useState("");

  useEffect(() => {
    setRawMemo(""); setResult(null); setSaved(false); setCalError(""); setMemoError("");
  }, [dateStr]);

  const analyze = async () => {
    if (!rawMemo.trim()) { setMemoError("메모를 입력해주세요."); return; }
    setAnalyzing(true); setMemoError("");
    try {
      const res = await fetch("/api/memo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_memo: rawMemo }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResult(data);
      setEdited({ ...data, preferred_date: data.preferred_date || dateStr });
    } catch (e: any) { setMemoError(e.message || "분석 실패"); }
    finally { setAnalyzing(false); }
  };

  const saveToCalendar = async () => {
    const date = edited.preferred_date?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || dateStr;
    setSaving(true); setCalError("");
    try {
      const title = [edited.hospital_name, "촬영 일정"].filter(Boolean).join(" ") || "촬영 일정";
      const memo = [
        edited.summary,
        (edited.shooting_items ?? []).length ? "항목: " + (edited.shooting_items ?? []).join(", ") : "",
        edited.budget ? "예산: " + edited.budget : "",
        edited.special_notes,
      ].filter(Boolean).join("\n");
      const location = edited.hospital_name || null;
      const r = await fetch("/api/calendar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, title, memo, category: "shooting", location }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      // Supabase의 calendar_tasks에 그대로 저장 — 상담 메모 카드는 이 목록에서 파생되므로
      // 다른 컴퓨터에서도 동일하게 보인다 (localStorage 별도 저장 불필요).
      onAdd({ id: d.id, date, title, memo, category: "shooting", completed: false,
        created_at: new Date().toISOString(), time: null, end_time: null, location });
      setSaved(true);
    } catch (e: any) { setCalError(e.message || "저장 실패"); }
    finally { setSaving(false); }
  };

  const upd = (key: keyof MemoExtracted, val: string) => setEdited(prev => ({ ...prev, [key]: val }));

  const iStyle: React.CSSProperties = {
    fontSize: 12, color: C.txt, border: "none", outline: "none",
    borderBottom: `1px solid ${C.border}`, background: "transparent",
    padding: "1px 0", fontFamily: "inherit", width: "100%",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {consultations.map((c, i) => (
        <div key={i} style={{ background: "#FFF5F0", border: "1px solid #FACCB8", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#E85D2C" }}>🏥 {c.hospital}</span>
            <span style={{ fontSize: 9, color: C.hint, marginLeft: "auto" }}>{c.savedAt}</span>
          </div>
          {c.summary && <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{c.summary}</div>}
          {c.items?.length > 0 && <div style={{ fontSize: 11, color: C.hint, marginTop: 3 }}>항목: {c.items.join(", ")}</div>}
          {c.budget && <div style={{ fontSize: 11, color: C.hint }}>예산: {c.budget}</div>}
        </div>
      ))}

      {!result ? (
        <>
          <textarea value={rawMemo} onChange={e => setRawMemo(e.target.value)}
            placeholder={`상담 내용을 자유롭게 메모하세요.\n\n예:\n강남 피부과 - 김실장 상담\n원장 프로필 + 공간사진 + 시술 연출\n7월 초 희망 / 예산 250~300`}
            rows={9}
            style={{ width: "100%", fontSize: 12, color: C.txt, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "10px 12px", resize: "none", background: "#FAFCFB",
              outline: "none", lineHeight: 1.75, fontFamily: "inherit", boxSizing: "border-box" }}/>
          {memoError && <div style={{ fontSize: 11, color: "#E85D2C", background: "#FFF0EB", borderRadius: 7, padding: "6px 10px" }}>⚠ {memoError}</div>}
          <button onClick={analyze} disabled={analyzing} className="pc-btn pc-btn--primary">
            {analyzing ? "AI 분석 중…" : "✨ AI 분석하기"}
          </button>
        </>
      ) : (
        <>
          <div style={{ background: C.teal, borderRadius: 10, padding: "12px 14px", color: "#fff" }}>
            <div style={{ fontSize: 9, opacity: .6, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 3 }}>AI 분석 요약</div>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.65 }}>{edited.summary || "—"}</div>
          </div>
          <div className="pc-card pc-card--padded" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {([
              { key: "hospital_name"  as const, label: "병원명" },
              { key: "manager_name"   as const, label: "담당자" },
              { key: "phone"          as const, label: "연락처" },
              { key: "preferred_date" as const, label: "희망일" },
              { key: "budget"         as const, label: "예산" },
              { key: "special_notes"  as const, label: "특이사항" },
            ] as const).map(({ key, label }) => (
              edited[key] ? (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.hint }}>{label}</span>
                  <input value={String(edited[key] ?? "")} onChange={e => upd(key, e.target.value)} style={iStyle}/>
                </div>
              ) : null
            ))}
            {(edited.shooting_items ?? []).length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.hint }}>항목</span>
                <span style={{ fontSize: 12, color: C.txt }}>{(edited.shooting_items ?? []).join(", ")}</span>
              </div>
            )}
          </div>
          {calError && <div style={{ fontSize: 11, color: "#E85D2C", background: "#FFF0EB", borderRadius: 7, padding: "6px 10px" }}>⚠ {calError}</div>}
          {saved ? (
            <div style={{ padding: "9px 12px", background: "#E6F4EA", border: "1px solid #86EFAC", borderRadius: 9, fontSize: 12, color: "#166534", fontWeight: 700 }}>
              ✅ 캘린더에 등록됐어요!
            </div>
          ) : (
            <button onClick={saveToCalendar} disabled={saving} className="pc-btn pc-btn--orange">
              {saving ? "등록 중…" : "📅 캘린더에 등록"}
            </button>
          )}
          <button onClick={() => { setResult(null); setRawMemo(""); setSaved(false); }} className="pc-btn pc-btn--ghost pc-btn--sm">새 메모 작성</button>
        </>
      )}
    </div>
  );
}

/* ─── DayPanel (right side) ───────────────────────────── */
function DayPanel({ dateStr, tasks, loading, todayStr, onToggle, onDelete, onAdd, onEdit,
  autoOpenTrigger, autoSlotTime }: {
  dateStr: string; tasks: CalTask[]; loading: boolean; todayStr: string;
  onToggle: (t: CalTask) => void; onDelete: (id: string) => void; onAdd: (t: CalTask) => void;
  onEdit: (t: CalTask) => void; autoOpenTrigger?: number; autoSlotTime?: string;
}) {
  const isToday = dateStr === todayStr;
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  const dateLabel = `${d.getMonth()+1}월 ${d.getDate()}일 ${WEEKDAYS[dow]}`;
  const done = tasks.filter(t => t.completed).length;

  // 상담 메모는 별도 저장소 없이, 이미 Supabase에 저장된 category:"shooting" 태스크에서
  // 그대로 파생한다 — 그래야 다른 컴퓨터에서 접속해도 동일하게 보인다.
  const consultations = useMemo<ConsultEntry[]>(() => tasks
    .filter(t => t.category === "shooting" && t.memo)
    .map(t => ({
      hospital: t.location || t.title.replace(/\s*촬영\s*일정\s*$/, "").trim() || "미입력",
      summary: t.memo,
      items: [],
      budget: "",
      savedAt: new Date(t.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    })), [tasks]);

  const sorted = useMemo(() => [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    return (a.time ?? "99:99").localeCompare(b.time ?? "99:99");
  }), [tasks]);

  const SectionLabel = ({ children, badge }: { children: string; badge?: number }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 900, color: C.teal, letterSpacing: ".04em" }}>{children}</span>
      {badge != null && badge > 0 && (
        <span style={{ background: C.teal, color: "#fff", fontSize: 9, fontWeight: 800,
          padding: "1px 6px", borderRadius: 99 }}>{badge}</span>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.surface }}>

      {/* ── 날짜 헤더 */}
      <div style={{ padding: "18px 20px 14px", flexShrink: 0,
        background: isToday ? "#FFF5F0" : "#FAFCFB",
        borderBottom: `1.5px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          {isToday && (
            <span style={{ fontSize: 10, fontWeight: 900, color: "#fff",
              background: C.todayRed, padding: "2px 9px", borderRadius: 99 }}>오늘</span>
          )}
          <span style={{ fontSize: 18, fontWeight: 900, color: C.txt, letterSpacing: "-0.4px", flex: 1 }}>
            {dateLabel}
          </span>
        </div>
        {tasks.length > 0 ? (
          <>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
              전체 {tasks.length}개 ·{" "}
              <span style={{ color: C.teal, fontWeight: 800 }}>완료 {done}개</span>
              {done === tasks.length && (
                <span style={{ marginLeft: 7, color: "#059669", fontWeight: 800 }}>🎉 완료!</span>
              )}
            </div>
            <div style={{ height: 3, background: "#E0EDEB", borderRadius: 99, marginTop: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", background: C.teal, borderRadius: 99,
                width: `${(done / tasks.length) * 100}%`, transition: "width .4s ease" }}/>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: C.hint }}>일정 없음</div>
        )}
      </div>

      {/* ── 스크롤 영역 (할일 + 상담 메모 상하 배치) */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px 32px" }}>

        {/* 할일 섹션 */}
        <SectionLabel badge={tasks.length}>📅 할일</SectionLabel>
        {loading ? (
          <div style={{ textAlign: "center", color: C.hint, padding: "24px 0", fontSize: 13 }}>불러오는 중…</div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: "center", color: C.hint, padding: "16px 0 20px" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📅</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>할일이 없어요</div>
            <div style={{ fontSize: 12 }}>아래에서 추가하세요</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 14 }}>
            {sorted.map(task => (
              <TaskItem key={task.id} task={task}
                onToggle={() => onToggle(task)} onDelete={() => onDelete(task.id)}
                onEdit={onEdit}/>
            ))}
          </div>
        )}
        <AddTaskForm date={dateStr} onAdd={onAdd} triggerKey={autoOpenTrigger} defaultTime={autoSlotTime}/>

        {/* 구분선 */}
        <div style={{ margin: "24px 0 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: C.border }}/>
        </div>

        {/* 상담 메모 섹션 */}
        <SectionLabel badge={consultations.length}>📝 상담 메모</SectionLabel>
        <ConsultMemoPanel
          dateStr={dateStr}
          consultations={consultations}
          onAdd={onAdd}
        />
      </div>
    </div>
  );
}


/* ─── MonthView ───────────────────────────────────────── */
function MonthView({ year, month, todayStr, selectedDate, tasksByDate, onSelectDate, onUpdateTask, onCreateTask, onRequestDelete, onPrev, onNext, onOpenAdd, onOpenEdit, isMobile = false, onNavigateDay, onNavigateYear }: {
  year: number; month: number; todayStr: string; selectedDate: string;
  tasksByDate: Record<string, CalTask[]>;
  onSelectDate: (d: string) => void;
  onUpdateTask: (id: string, fields: Partial<CalTask>) => void;
  onCreateTask: (fields: Omit<CalTask, "id" | "created_at">) => Promise<CalTask | null>;
  onRequestDelete: (id: string) => void;
  onPrev: () => void; onNext: () => void;
  onOpenAdd: (date: string, x: number, y: number) => void;
  onOpenEdit: (task: CalTask, x: number, y: number) => void;
  isMobile?: boolean;
  onNavigateDay?: (date: string) => void;
  onNavigateYear?: () => void;
}) {
  const { cells } = buildMonthCells(year, month);
  const [dragTask,     setDragTask]     = useState<CalTask | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // ── 키보드 조작: 셀 포커스 이동, 태스크 선택/복사/붙여넣기/삭제 ──
  const [focusedIdx,    setFocusedIdx]    = useState(0);
  // id만 들고 있으면 Cmd+C 시 "현재 포커스된 셀"의 tasks 목록에서 다시 찾아야 하는데,
  // 포커스가 선택한 셀과 다른 셀에 가 있으면 못 찾아서 조용히 실패했었다 — 객체 자체를 들고 있는다.
  const [selectedTask,  setSelectedTask]  = useState<CalTask | null>(null);
  const [clipboardTask, setClipboardTask] = useState<CalTask | null>(null); // 메모리에만 보관 (새로고침 시 초기화)
  const [toast,         setToast]         = useState<string | null>(null); // 복사/붙여넣기는 눈에 보이는 변화가 없어서 확인용 토스트가 필요
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const cellDateStr = (n: number) => {
    const c = cells[n];
    return `${c.year}-${String(c.month+1).padStart(2,"0")}-${String(c.day).padStart(2,"0")}`;
  };

  // 월 이동 시 focus를 선택된 날짜(없으면 오늘, 없으면 첫 칸)로 재조정
  useEffect(() => {
    const bySelected = cells.findIndex((_, i) => cellDateStr(i) === selectedDate);
    const byToday    = cells.findIndex((_, i) => cellDateStr(i) === todayStr);
    setFocusedIdx(bySelected >= 0 ? bySelected : byToday >= 0 ? byToday : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  useEffect(() => {
    cellRefs.current[focusedIdx]?.focus({ preventScroll: true });
  }, [focusedIdx]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Month nav header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px 12px",
        background: C.surface, borderBottom: `1.5px solid ${C.border}`, flexShrink: 0 }}>
        <button onClick={onPrev} style={{ width: 32, height: 32, border: `1.5px solid ${C.border}`, borderRadius: 8,
          background: C.mint, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.teal }}>
          <ChevronLeft size={16}/>
        </button>
        {isMobile ? (
          <button onClick={onNavigateYear} style={{
            flex: 1, textAlign: "center", fontSize: 18, fontWeight: 900, color: C.teal, letterSpacing: "-0.3px",
            background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            <ChevronLeft size={15} style={{ opacity: .55 }}/> {year}년 {monthLabel(month)}
          </button>
        ) : (
          <div style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: 900, color: C.teal, letterSpacing: "-0.3px" }}>
            {year}년 {monthLabel(month)}
          </div>
        )}
        <button onClick={onNext} style={{ width: 32, height: 32, border: `1.5px solid ${C.border}`, borderRadius: 8,
          background: C.mint, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.teal }}>
          <ChevronRight size={16}/>
        </button>
      </div>

      {/* ── Weekday row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)",
        background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} style={{ textAlign: "center", fontSize: 12, fontWeight: 900, padding: "8px 0 7px",
            color: i===0 ? "#C0201A" : i===6 ? "#1D4ED8" : C.muted }}>
            {w}
          </div>
        ))}
      </div>

      {/* ── Day grid — 주 수(5~6주)에 따라 실제 높이가 달라지고, 남는 세로 공간은 아래
          데일리 루틴 패널이 flex:1로 흡수한다(예전엔 이 div가 flex:1이라 그리드 밑에 빈
          배경색만 남았다). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)",
        gridAutoRows: "124px", gap: "1px", background: C.border,
        border: `1px solid ${C.border}`, flexShrink: 0, overflow: "hidden" }}>
        {cells.map((cell, idx) => {
          const dateStr    = `${cell.year}-${String(cell.month+1).padStart(2,"0")}-${String(cell.day).padStart(2,"0")}`;
          const isToday    = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const tasks      = tasksByDate[dateStr] ?? [];
          const dow        = new Date(cell.year, cell.month, cell.day).getDay();
          const isDragOver = dragOverDate === dateStr && dragTask?.date !== dateStr;
          const dimmed     = !cell.isCurrent;

          return (
            <div key={idx}
              ref={el => { cellRefs.current[idx] = el; }}
              tabIndex={0}
              className="cal-cell"
              onFocus={() => setFocusedIdx(idx)}
              onClick={e => {
                onSelectDate(dateStr); setSelectedTask(null);
                if (isMobile) onNavigateDay?.(dateStr);
                else onOpenAdd(dateStr, e.clientX, e.clientY);
              }}
              onKeyDown={e => {
                const cols = 7;
                if (e.key === "ArrowRight") { e.preventDefault(); const n = Math.min(cells.length - 1, idx + 1); setFocusedIdx(n); onSelectDate(cellDateStr(n)); }
                else if (e.key === "ArrowLeft") { e.preventDefault(); const n = Math.max(0, idx - 1); setFocusedIdx(n); onSelectDate(cellDateStr(n)); }
                else if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.min(cells.length - 1, idx + cols); setFocusedIdx(n); onSelectDate(cellDateStr(n)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.max(0, idx - cols); setFocusedIdx(n); onSelectDate(cellDateStr(n)); }
                else if (e.key === "Enter") {
                  e.preventDefault();
                  if (isMobile) onNavigateDay?.(dateStr);
                  else {
                    const rect = cellRefs.current[idx]?.getBoundingClientRect();
                    onOpenAdd(dateStr, rect ? rect.left + 20 : 200, rect ? rect.top + 20 : 200);
                  }
                }
                else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
                  if (selectedTask) {
                    e.preventDefault();
                    setClipboardTask(selectedTask);
                    setToast(`'${selectedTask.title}' 복사됨 — 다른 날짜로 이동해 ⌘V로 붙여넣으세요`);
                  }
                }
                else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
                  if (clipboardTask) {
                    e.preventDefault();
                    onCreateTask({
                      date: dateStr, title: clipboardTask.title, memo: clipboardTask.memo,
                      category: clipboardTask.category, completed: false,
                      time: clipboardTask.time, end_time: clipboardTask.end_time, location: clipboardTask.location,
                    }).then(created => setToast(created ? `'${clipboardTask.title}' 붙여넣기 완료` : "붙여넣기 실패 — 다시 시도해 주세요"));
                  }
                }
                else if (e.key === "Delete" || e.key === "Backspace") {
                  // 맥 키보드의 "delete" 키는 실제로 Backspace를 전송하므로 둘 다 처리
                  if (selectedTask) { e.preventDefault(); onRequestDelete(selectedTask.id); }
                }
              }}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverDate(dateStr); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDate(null); }}
              onDrop={e => {
                e.preventDefault();
                if (dragTask && dragTask.date !== dateStr) onUpdateTask(dragTask.id, { date: dateStr });
                setDragTask(null); setDragOverDate(null);
              }}
              style={{
                overflow: "hidden", padding: "6px 5px 4px", cursor: "pointer",
                background: isDragOver ? "#D4EDE8" : isToday ? "#FFF5F4" : isSelected ? "#EAF4F2" : dimmed ? "#F3F6F5" : C.surface,
                transition: "background .1s",
                outline: isDragOver ? `2px solid ${C.teal}` : isSelected ? `2px solid ${C.teal}` : isToday ? `2px solid ${C.todayRed}` : "none",
                outlineOffset: "-2px",
              }}>
              {/* date number */}
              <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 2, marginBottom: 3 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: isToday ? C.todayRed : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{
                    fontSize: 14,
                    fontWeight: isToday ? 900 : isSelected ? 800 : 600,
                    opacity: dimmed ? 0.38 : 1,
                    color: isToday ? "#fff" : dow===0 ? "#C0201A" : dow===6 ? "#1D4ED8" : C.txt,
                  }}>{cell.day}</span>
                </div>
              </div>

              {/* event pills */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {tasks.slice(0, 4).map(t => {
                  const cat = CATS[t.category] ?? CATS.general;
                  return (
                    <div key={t.id}
                      draggable
                      onDragStart={e => { e.stopPropagation(); setDragTask(t); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDragTask(null); setDragOverDate(null); }}
                      onClick={e => {
                        e.stopPropagation();
                        onSelectDate(dateStr); setSelectedTask(t);
                        // 일정 pill은 포커스를 못 받는 요소라 클릭해도 셀의 키보드 이벤트가 안 잡혔음 —
                        // Cmd+C/V/Delete가 부모 셀의 onKeyDown에서 처리되므로 셀에 포커스를 옮겨줘야 한다.
                        cellRefs.current[idx]?.focus();
                        // 한 번 클릭은 선택만 — 자세히 보려면(팝업) 더블클릭해야 함
                        if (isMobile) onNavigateDay?.(dateStr);
                      }}
                      onDoubleClick={e => {
                        e.stopPropagation();
                        if (!isMobile) onOpenEdit(t, e.clientX, e.clientY);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "1px 3px", borderRadius: 3,
                        opacity: dragTask?.id === t.id ? 0.4 : dimmed ? 0.45 : t.completed ? 0.55 : 1,
                        cursor: CURSOR_GRAB,
                        transition: "opacity .15s, box-shadow .15s",
                        boxShadow: selectedTask?.id === t.id ? "0 0 0 2px #0F4440" : "none",
                      }}>
                      <span style={{
                        width: 5, height: 12, borderRadius: 2, flexShrink: 0,
                        background: t.completed ? "#A0AEC0" : cat.color,
                      }}/>
                      <span style={{
                        flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: 600,
                        color: C.txt, textDecoration: t.completed ? "line-through" : "none",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>{t.title}</span>
                      {t.time && !isMobile && (
                        <span style={{ fontSize: 9, color: C.muted, fontWeight: 500, flexShrink: 0 }}>
                          {formatTimeKo(t.time)}
                        </span>
                      )}
                    </div>
                  );
                })}
                {tasks.length > 4 && (
                  <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, paddingLeft: 3, lineHeight: 1, opacity: dimmed ? 0.45 : 1 }}>
                    +{tasks.length-4}개 더
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 데일리 루틴 — 그리드 밑에 남는 공간을 채우는 매일 반복 일정 안내 */}
      <div style={{ flex: 1, minHeight: 56, overflowY: "auto", background: C.surface,
        borderTop: `1px solid ${C.border}`, padding: "12px 20px" }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: C.hint, letterSpacing: ".06em",
          textTransform: "uppercase", marginBottom: 10 }}>⏰ 데일리 루틴</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 10 : 22 }}>
          {DAILY_ROUTINE.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.teal, flexShrink: 0 }}/>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.teal, whiteSpace: "nowrap" }}>{formatTimeKo(r.time)}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.txt, whiteSpace: "nowrap" }}>{r.label}</span>
              {i < DAILY_ROUTINE.length - 1 && (
                <div style={{ width: 14, height: 1, background: C.border, marginLeft: isMobile ? 2 : 14 }}/>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Legend */}
      <div style={{ display: "flex", gap: 14, padding: "8px 20px", flexWrap: "wrap", flexShrink: 0,
        background: C.surface, borderTop: `1px solid ${C.border}` }}>
        {Object.entries(CATS).map(([, v]) => (
          <div key={v.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: v.color }}/>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{v.label}</span>
          </div>
        ))}
      </div>

      {/* 복사/붙여넣기는 화면에 눈에 띄는 변화가 없어서 결과를 알려주는 토스트 */}
      {toast && (
        <div style={{
          position: "fixed", left: "50%", bottom: 28, transform: "translateX(-50%)", zIndex: 400,
          background: "#0F4440", color: "#fff", padding: "10px 18px", borderRadius: 99,
          fontSize: 12.5, fontWeight: 700, boxShadow: "0 10px 28px rgba(15,68,64,.32)",
          pointerEvents: "none", whiteSpace: "nowrap",
        }}>{toast}</div>
      )}
    </div>
  );
}

/* ─── WeekView ────────────────────────────────────────── */
function WeekView({ weekDates, todayStr, selectedDate, tasksByDate, onSelectDate,
  onUpdateTask, isMobile = false, onPrev, onNext, onOpenAdd, onOpenEdit }: {
  weekDates: Date[]; todayStr: string; selectedDate: string;
  tasksByDate: Record<string, CalTask[]>;
  onSelectDate: (d: string) => void;
  onUpdateTask: (id: string, fields: Partial<CalTask>) => void;
  isMobile?: boolean; onPrev: () => void; onNext: () => void;
  onOpenAdd: (date: string, x: number, y: number, time?: string) => void;
  onOpenEdit: (task: CalTask, x: number, y: number) => void;
}) {
  const start = weekDates[0], end = weekDates[6];
  const navLabel = start.getMonth() === end.getMonth()
    ? `${start.getFullYear()}년 ${monthLabel(start.getMonth())}`
    : `${monthLabel(start.getMonth())} - ${monthLabel(end.getMonth())}`;

  /* ── smooth drag-to-move state ──
     ghost는 dragPosRef를 통해 direct DOM으로만 움직인다(React state 미개입) — 예전엔 JSX의
     style.transform도 dragging.currentX/currentY(React state)를 같이 참조해서, RAF로 지연된
     리렌더가 direct DOM으로 이미 앞서 나간 위치를 순간적으로 되돌리는 "이중 라이터" 충돌이 있었고
     이게 드래그 중 박스가 미세하게 떨리는 현상의 원인이었다. 예전엔 별도로 점선 테두리의 "드롭
     인디케이터"(dropTarget state, 15분 단위로 스냅되고 top에 CSS transition까지 걸려있었다)가
     ghost와 별개로 렌더링돼서, 실제 이동 중인 박스는 부드러운데 그 옆에서 점선 박스가 스냅→transition으로
     "쫓아오다 점프"를 반복해 전체적으로 떨리는 것처럼 보였다. 이제 점선 인디케이터를 없애고, 실제
     박스와 똑같은 크기(요일 컬럼 폭 × 소요시간 높이)의 ghost 하나만 커서를 그대로 따라가게 한다
     (세로는 커서에 1:1로 붙고, 가로는 어느 요일 컬럼 위에 있는지에 따라서만 스냅) — 15분 단위 스냅은
     실제로 손을 뗄 때(finishDrag)만 적용해 저장한다. */
  const [dragging, setDragging] = useState<{
    task: CalTask; offsetX: number; offsetY: number;
  } | null>(null);
  const draggingRef  = useRef(dragging);
  draggingRef.current = dragging;
  const ghostRef     = useRef<HTMLDivElement>(null);
  const ghostTimeRef = useRef<HTMLSpanElement>(null);
  const dragPosRef   = useRef<{x:number;y:number}>({x:0,y:0});
  const dragStartRef = useRef<{x:number;y:number}>({x:0,y:0}); // 클릭 vs 드래그 구분용

  /* ── drag-to-resize state ── */
  const [resizeInfo, setResizeInfo] = useState<{
    task: CalTask; edge: "top" | "bottom"; startY: number;
    origStartTime: string; origEndTime: string;
    previewStartTime: string; previewEndTime: string;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const weekDatesRef = useRef(weekDates);
  weekDatesRef.current = weekDates;
  const TL_W = isMobile ? 28 : 44;
  const dayColRefs = useRef<(HTMLDivElement|null)[]>(Array(7).fill(null));

  /* Compute grid target (date + time) from viewport cursor coords.
     드래그 중엔 매 mousemove마다 getBoundingClientRect()를 (컬럼 7개분) 다시 계산하면 강제 리플로우가
     초당 수십~수백 번 발생해서 ghost의 direct DOM transform 갱신과 경합하며 떨림의 원인이 될 수 있다.
     cached를 넘기면 드래그 시작 시점에 1회 캐시해둔 rect를 재사용해 리플로우를 피한다. */
  const getPosTarget = (clientX: number, clientY: number, cached?: { rect: DOMRect; colRects: (DOMRect | null)[] }) => {
    const el = scrollRef.current;
    if (!el) return null;
    const rect = cached?.rect ?? el.getBoundingClientRect();
    const scrollTop = el.scrollTop;
    const colRects = cached?.colRects ?? dayColRefs.current.map(c => c?.getBoundingClientRect() ?? null);
    let colIdx = -1;
    for (let i = 0; i < 7; i++) {
      const cr = colRects[i];
      if (!cr) continue;
      if (clientX >= cr.left && clientX < cr.right) { colIdx = i; break; }
    }
    if (colIdx === -1) {
      const relX = clientX - rect.left - TL_W;
      colIdx = Math.max(0, Math.min(6, Math.floor(relX / ((rect.width - TL_W) / 7))));
    }
    const relY = clientY - rect.top + scrollTop;
    const totalMins = Math.round((relY / HOUR_HEIGHT * 60) / 15) * 15;
    const rawH = Math.floor(totalMins / 60) + 7;
    const h = Math.max(7, Math.min(21, rawH));
    const m = rawH > 21 ? 0 : totalMins % 60;
    return {
      date: toYMD(weekDatesRef.current[colIdx]),
      time: `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`,
      colIdx,
    };
  };

  /* Mouse + touch drag effect — ghost 위치/크기는 항상 direct DOM으로만 갱신하고, 드래그 중엔
     React state를 전혀 건드리지 않는다 (리렌더가 아예 없으므로 떨릴 여지가 없다). 15분 단위 스냅은
     실제로 손을 놓는 순간(finishDrag)에만 계산해서 저장한다. */
  const isDraggingActive = dragging !== null;
  useEffect(() => {
    if (!isDraggingActive) return;
    // 컬럼 rect는 드래그 세션 동안 바뀌지 않으므로 시작 시점에 1회만 캐시 — 매 mousemove마다
    // getBoundingClientRect()를 다시 호출하면 강제 리플로우가 반복돼 떨림의 원인이 될 수 있다.
    const cachedRects = scrollRef.current ? {
      rect: scrollRef.current.getBoundingClientRect(),
      colRects: dayColRefs.current.map(c => c?.getBoundingClientRect() ?? null),
    } : undefined;
    const positionGhost = (x: number, y: number) => {
      const d = draggingRef.current;
      if (!ghostRef.current || !d) return;
      // 세로는 커서 위치를 그대로 따라가고(부드러움), 가로만 현재 커서가 있는 요일 컬럼 폭/위치에 맞춰
      // 스냅한다 — 진짜 박스처럼 보이면서도 어느 요일에 놓일지 계속 눈으로 확인할 수 있다.
      const target = getPosTarget(x, y, cachedRects);
      const timeTarget = getPosTarget(x, y - d.offsetY, cachedRects);
      const colRect = target && cachedRects ? cachedRects.colRects[target.colIdx] : null;
      const left = colRect ? colRect.left + 2 : x - d.offsetX;
      const top = y - d.offsetY;
      ghostRef.current.style.transform = `translate(${left}px,${top}px)`;
      if (colRect) ghostRef.current.style.width = `${colRect.width - 4}px`;
      if (ghostTimeRef.current && timeTarget) {
        const duration = d.task.time && d.task.end_time
          ? Math.max(0, timeToMinutes(d.task.end_time) - timeToMinutes(d.task.time))
          : 0;
        const end = duration ? minutesToTime(timeToMinutes(timeTarget.time) + duration) : "";
        ghostTimeRef.current.textContent = end ? `${timeTarget.time}–${end}` : timeTarget.time;
      }
    };
    positionGhost(dragPosRef.current.x, dragPosRef.current.y);
    const onMouseMove = (e: MouseEvent) => {
      dragPosRef.current = { x: e.clientX, y: e.clientY };
      positionGhost(e.clientX, e.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      dragPosRef.current = { x: t.clientX, y: t.clientY };
      positionGhost(t.clientX, t.clientY);
    };
    const finishDrag = (clientX: number, clientY: number) => {
      const d = draggingRef.current;
      if (d) {
        const moved = Math.hypot(clientX - dragStartRef.current.x, clientY - dragStartRef.current.y);
        if (moved < 6) {
          // 거의 움직이지 않았으면 드래그가 아니라 클릭으로 간주 — 편집 팝업을 연다
          setDragging(null);
          onOpenEdit(d.task, clientX, clientY);
          return;
        }
        // 박스 안 어디를 잡았든(offsetY) 실제로 화면에 보이는 박스의 "윗변"이 새 시작시간이 되어야
        // 한다 — getPosTarget에 커서 좌표를 그대로 넣으면 잡은 지점(offsetY)만큼 항상 더 밀려서
        // 계산되는 버그가 있었다(예: 박스 중간을 잡고 30분 내리면 실제로는 1시간+ 밀려 보임).
        // ghost의 시각적 top(=clientY - offsetY)과 반드시 같은 좌표를 써야 눈에 보이는 위치와
        // 저장되는 시간이 일치한다.
        const target = getPosTarget(clientX, clientY - d.offsetY, cachedRects);
        if (target && (target.date !== d.task.date || target.time !== d.task.time)) {
          // 통째로 이동 — 기존 소요시간(예: 10시~12시 = 2시간)을 그대로 유지한 채 새 시작시간으로 옮긴다
          const fields: Partial<CalTask> = { date: target.date, time: target.time };
          if (d.task.end_time && d.task.time) {
            const durationMins = timeToMinutes(d.task.end_time) - timeToMinutes(d.task.time);
            if (durationMins > 0) fields.end_time = minutesToTime(timeToMinutes(target.time) + durationMins);
          }
          onUpdateTask(d.task.id, fields);
        }
      }
      setDragging(null);
    };
    const onMouseUp = (e: MouseEvent) => finishDrag(e.clientX, e.clientY);
    const onTouchEnd = (e: TouchEvent) => { const t = e.changedTouches[0]; finishDrag(t.clientX, t.clientY); };
    document.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraggingActive]);

  /* Resize effect — 위 경계는 시작시간만, 아래 경계는 종료시간만 바꾸고 반대쪽은 고정.
     예전엔 마우스가 움직일 때마다(초당 수십~백 회) setResizeInfo를 즉시 호출했고, 의존성 배열에
     resizeInfo 자체가 들어있어 매번 리스너를 통째로 떼었다 다시 붙이기까지 했다 — 드래그 이동과
     같은 종류의 불안정함(끊김/떨림)을 유발할 수 있어 RAF로 묶어서 초당 최대 화면 주사율만큼만 갱신한다. */
  const resizeInfoRef = useRef(resizeInfo);
  resizeInfoRef.current = resizeInfo;
  const resizeRafRef = useRef<number | null>(null);
  const resizePendingRef = useRef<{ previewStartTime: string; previewEndTime: string } | null>(null);
  const isResizingActive = resizeInfo !== null;
  useEffect(() => {
    if (!isResizingActive) return;
    const info = resizeInfoRef.current!; // edge/orig*/task/startY는 리사이즈 도중 안 바뀌므로 시작 시점 값을 고정 캡처
    const compute = (clientY: number) => {
      const dy = clientY - info.startY;
      const deltaMins = Math.round(dy / HOUR_HEIGHT * 60 / 15) * 15;
      if (info.edge === "bottom") {
        const origTotal = timeToMinutes(info.origEndTime);
        const startTotal = timeToMinutes(info.origStartTime);
        const newTotal = Math.min(22 * 60, Math.max(startTotal + 15, origTotal + deltaMins));
        return { previewStartTime: info.origStartTime, previewEndTime: minutesToTime(newTotal) };
      }
      const origTotal = timeToMinutes(info.origStartTime);
      const endTotal = timeToMinutes(info.origEndTime);
      const newTotal = Math.max(7 * 60, Math.min(endTotal - 15, origTotal + deltaMins));
      return { previewStartTime: minutesToTime(newTotal), previewEndTime: info.origEndTime };
    };
    const onMove = (e: MouseEvent) => {
      resizePendingRef.current = compute(e.clientY);
      if (resizeRafRef.current === null) {
        resizeRafRef.current = requestAnimationFrame(() => {
          const p = resizePendingRef.current;
          if (p) setResizeInfo(r => r ? { ...r, ...p } : null);
          resizeRafRef.current = null;
        });
      }
    };
    const finishResize = (clientY?: number) => {
      if (resizeRafRef.current !== null) { cancelAnimationFrame(resizeRafRef.current); resizeRafRef.current = null; }
      const p = typeof clientY === "number" ? compute(clientY) : resizePendingRef.current;
      if (info.edge === "bottom") onUpdateTask(info.task.id, { end_time: p?.previewEndTime ?? info.previewEndTime });
      else onUpdateTask(info.task.id, { time: p?.previewStartTime ?? info.previewStartTime });
      resizePendingRef.current = null;
      setResizeInfo(null);
    };
    const onUp = (e: MouseEvent) => finishResize(e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) onMove({ clientY: touch.clientY } as MouseEvent);
    };
    const onTouchEnd = (e: TouchEvent) => finishResize(e.changedTouches[0]?.clientY);
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      if (resizeRafRef.current !== null) { cancelAnimationFrame(resizeRafRef.current); resizeRafRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResizingActive]);

  const timeToTop = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return (h - 7 + m / 60) * HOUR_HEIGHT;
  };

  const durationPx = (s: string, e: string | null | undefined) => {
    if (!e) return HOUR_HEIGHT;
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    return Math.max(28, ((eh * 60 + em) - (sh * 60 + sm)) / 60 * HOUR_HEIGHT);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
      userSelect: (dragging || resizeInfo) ? "none" : undefined,
      cursor: dragging ? CURSOR_GRABBING : undefined }}>

      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 10px", flexShrink: 0,
        background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <button onClick={onPrev} style={{ width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: 7,
          background: C.mint, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.teal }}>
          <ChevronLeft size={14}/>
        </button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 900, color: C.teal }}>{navLabel}</div>
        <button onClick={onNext} style={{ width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: 7,
          background: C.mint, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.teal }}>
          <ChevronRight size={14}/>
        </button>
      </div>

      {/* Day header row */}
      <div style={{ display: "grid", gridTemplateColumns: `${TL_W}px repeat(7,1fr)`,
        background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div/>
        {weekDates.map((d, i) => {
          const ds = toYMD(d);
          const isToday = ds === todayStr;
          const isSelected = ds === selectedDate;
          const dow = d.getDay();
          const cnt = tasksByDate[ds]?.length ?? 0;
          return (
            <div key={i} onClick={() => onSelectDate(ds)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 2px", cursor: "pointer" }}>
              <span style={{ fontSize: 10, fontWeight: 700, marginBottom: 2,
                color: dow===0 ? "#DC2626" : dow===6 ? "#2563EB" : C.muted }}>{WEEKDAYS[dow]}</span>
              <div style={{ width: 26, height: 26, borderRadius: "50%",
                background: isToday ? C.todayRed : isSelected ? C.teal : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 13, fontWeight: (isToday||isSelected) ? 900 : 700,
                  color: (isToday||isSelected) ? "#fff" : dow===0 ? "#DC2626" : dow===6 ? "#2563EB" : C.txt }}>
                  {d.getDate()}
                </span>
              </div>
              {cnt > 0 && !isToday && !isSelected && (
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.teal, marginTop: 2 }}/>
              )}
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      <div style={{ display: "grid", gridTemplateColumns: `${TL_W}px repeat(7,1fr)`,
        background: "#F8FBFA", borderBottom: `1px solid ${C.border}40`, flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: C.hint, paddingTop: 6, textAlign: "right", paddingRight: isMobile ? 4 : 8 }}>종일</div>
        {weekDates.map((d, i) => {
          const ds = toYMD(d);
          const allDay = (tasksByDate[ds] ?? []).filter(t => !t.time);
          return (
            <div key={i} style={{ padding: "3px 2px", display: "flex", flexDirection: "column", gap: 1.5,
              borderLeft: `1px solid ${C.border}30`, minHeight: 24 }}>
              {allDay.map(t => (
                <div key={t.id} style={{ fontSize: 9, fontWeight: 700, color: "#fff",
                  background: (CATS[t.category]?.color) ?? C.hint, borderRadius: 2, padding: "1.5px 4px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  opacity: t.completed ? 0.5 : 1 }}>{t.title}</div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `${TL_W}px repeat(7,1fr)` }}>

          {/* Hour labels */}
          <div style={{ background: "#F8FBFA" }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: HOUR_HEIGHT, borderBottom: `1px solid ${C.border}25`,
                display: "flex", alignItems: "flex-start", paddingTop: 4,
                justifyContent: "flex-end", paddingRight: isMobile ? 4 : 8 }}>
                <span style={{ fontSize: isMobile ? 8 : 9.5, color: C.hint, fontWeight: 700 }}>
                  {String(h).padStart(2,"0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDates.map((d, colIdx) => {
            const ds = toYMD(d);
            const isToday = ds === todayStr;
            const timedTasks = (tasksByDate[ds] ?? []).filter(t => !!t.time);
            const timedLayout = layoutOverlappingTasks(timedTasks);
            return (
              <div key={colIdx} ref={el => { dayColRefs.current[colIdx] = el; }} style={{ position: "relative", borderLeft: `1px solid ${C.border}30` }}>

                {/* Hour slot backgrounds — click to add */}
                {HOURS.map(h => (
                  <div key={h}
                    style={{ height: HOUR_HEIGHT, borderBottom: `1px solid ${C.border}20`,
                      background: isToday ? "#FFFAF9" : h % 2 === 0 ? "#FAFCFB" : "#FFFFFF",
                      cursor: dragging ? CURSOR_GRABBING : "pointer" }}
                    onClick={e => { if (!dragging) onOpenAdd(ds, e.clientX, e.clientY, `${String(h).padStart(2,"0")}:00`); }}
                  />
                ))}

                {/* Timed event blocks */}
                {timedTasks.map(t => {
                  const cat = CATS[t.category] ?? CATS.general;
                  const isResizing = resizeInfo?.task.id === t.id;
                  const currentStart = isResizing && resizeInfo!.edge === "top" ? resizeInfo!.previewStartTime : t.time!;
                  const currentEnd = isResizing && resizeInfo!.edge === "bottom" ? resizeInfo!.previewEndTime : t.end_time;
                  const top = timeToTop(currentStart);
                  const height = durationPx(currentStart, currentEnd);
                  const isDraggingThis = dragging?.task.id === t.id;
                  const layout = timedLayout.get(t.id);

                  return (
                    <div key={t.id}
                      onMouseDown={e => {
                        if ((e.target as HTMLElement).closest("[data-resize]")) return;
                        e.preventDefault();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        dragStartRef.current = { x: e.clientX, y: e.clientY };
                        dragPosRef.current = { x: e.clientX, y: e.clientY };
                        setDragging({
                          task: t,
                          offsetX: e.clientX - rect.left,
                          offsetY: e.clientY - rect.top,
                        });
                      }}
                      onTouchStart={e => {
                        if ((e.target as HTMLElement).closest("[data-resize]")) return;
                        const touch = e.touches[0];
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        dragStartRef.current = { x: touch.clientX, y: touch.clientY };
                        dragPosRef.current = { x: touch.clientX, y: touch.clientY };
                        setDragging({
                          task: t,
                          offsetX: touch.clientX - rect.left,
                          offsetY: touch.clientY - rect.top,
                        });
                      }}
                      style={{
                        position: "absolute", top,
                        left: layout?.left ?? 2,
                        width: layout?.width ?? "calc(100% - 4px)",
                        height: Math.max(28, height),
                        background: t.completed ? "#9CA3AF" : cat.color,
                        borderRadius: 5, padding: "3px 6px 8px",
                        overflow: "hidden",
                        cursor: isDraggingThis ? CURSOR_GRABBING : CURSOR_GRAB,
                        zIndex: isDraggingThis ? 2 : 10,
                        opacity: isDraggingThis ? 0.2 : t.completed ? 0.7 : 1,
                        boxShadow: "0 1px 4px rgba(0,0,0,.15)",
                        transition: isResizing ? "none" : "opacity .15s, box-shadow .15s",
                        touchAction: "none",
                      }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#fff",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {currentStart?.slice(0,5)} {t.title}
                      </div>
                      {currentEnd && (
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,.75)" }}>~ {currentEnd.slice(0,5)}</div>
                      )}
                      {isResizing && (
                        <span style={{ position: "absolute", top: 2, right: 3, zIndex: 20,
                          borderRadius: 4, padding: "1px 4px", background: "rgba(245,247,247,.94)",
                          color: "#74827F", fontSize: 8, fontWeight: 900, lineHeight: 1.4,
                          boxShadow: "0 1px 3px rgba(21,88,85,.12)" }}>
                          {currentStart.slice(0,5)}{currentEnd ? `–${currentEnd.slice(0,5)}` : ""}
                        </span>
                      )}

                      {/* 위쪽 경계 — 드래그하면 시작시간만 바뀌고 종료시간은 고정 */}
                      <div
                        data-resize="1"
                        onMouseDown={e => {
                          e.preventDefault(); e.stopPropagation();
                          const origStart = t.time || "09:00";
                          const origEnd = t.end_time || nextHourTime(origStart);
                          setResizeInfo({ task: t, edge: "top", startY: e.clientY,
                            origStartTime: origStart, origEndTime: origEnd,
                            previewStartTime: origStart, previewEndTime: origEnd });
                        }}
                        onTouchStart={e => {
                          e.preventDefault(); e.stopPropagation();
                          const touch = e.touches[0];
                          const origStart = t.time || "09:00";
                          const origEnd = t.end_time || nextHourTime(origStart);
                          setResizeInfo({ task: t, edge: "top", startY: touch.clientY,
                            origStartTime: origStart, origEndTime: origEnd,
                            previewStartTime: origStart, previewEndTime: origEnd });
                        }}
                        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8,
                          cursor: "ns-resize", background: "rgba(0,0,0,.12)",
                          borderRadius: "5px 5px 0 0", display: "flex",
                          alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 20, height: 2, background: "rgba(255,255,255,.55)", borderRadius: 1 }}/>
                      </div>

                      {/* 아래쪽 경계 — 드래그하면 종료시간만 바뀌고 시작시간은 고정 */}
                      <div
                        data-resize="1"
                        onMouseDown={e => {
                          e.preventDefault(); e.stopPropagation();
                          const origStart = t.time || "09:00";
                          const origEnd = t.end_time || nextHourTime(origStart);
                          setResizeInfo({ task: t, edge: "bottom", startY: e.clientY,
                            origStartTime: origStart, origEndTime: origEnd,
                            previewStartTime: origStart, previewEndTime: origEnd });
                        }}
                        onTouchStart={e => {
                          e.preventDefault(); e.stopPropagation();
                          const touch = e.touches[0];
                          const origStart = t.time || "09:00";
                          const origEnd = t.end_time || nextHourTime(origStart);
                          setResizeInfo({ task: t, edge: "bottom", startY: touch.clientY,
                            origStartTime: origStart, origEndTime: origEnd,
                            previewStartTime: origStart, previewEndTime: origEnd });
                        }}
                        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8,
                          cursor: "ns-resize", background: "rgba(0,0,0,.12)",
                          borderRadius: "0 0 5px 5px", display: "flex",
                          alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 20, height: 2, background: "rgba(255,255,255,.55)", borderRadius: 1 }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Ghost — 실제 박스와 동일한 크기(요일 컬럼 폭 × 소요시간 높이)로 커서를 그대로 따라간다.
          위치/폭은 오직 direct DOM(positionGhost)으로만 갱신되고 React state는 전혀 관여하지 않는다.
          예전엔 작은 카드가 커서를 따라가는 것과 별개로 점선 테두리의 "드롭 위치 표시" 박스가 15분
          단위로 스냅+transition 되며 렌더링돼서, 두 요소가 따로 움직이는 게 떨림처럼 보였다 — 이제
          이 ghost 하나가 곧 "이동 중인 그 박스"라 크기가 유지된 채 부드럽게만 움직인다. */}
      {dragging && (() => {
        const cat = CATS[dragging.task.category] ?? CATS.general;
        const height = Math.max(28, durationPx(dragging.task.time || "09:00", dragging.task.end_time));
        const initialColIdx = weekDates.findIndex(d => toYMD(d) === dragging.task.date);
        const initialColRect = initialColIdx >= 0 ? dayColRefs.current[initialColIdx]?.getBoundingClientRect() : null;
        const initialWidth = initialColRect ? initialColRect.width - 4 : 130;
        const initialLeft = initialColRect ? initialColRect.left + 2 : dragStartRef.current.x - dragging.offsetX;
        return (
          <div ref={ghostRef} style={{
            position: "fixed", left: 0, top: 0, pointerEvents: "none", zIndex: 9999,
            willChange: "transform",
            width: initialWidth, height,
            transform: `translate(${initialLeft}px,${dragStartRef.current.y - dragging.offsetY}px)`,
            background: dragging.task.completed ? "#9CA3AF" : cat.color,
            borderRadius: 5, padding: "3px 6px 8px",
            boxShadow: "0 16px 34px rgba(0,0,0,.26), 0 5px 12px rgba(0,0,0,.18)",
            overflow: "hidden",
          }}>
            <span ref={ghostTimeRef} style={{ position: "absolute", top: 3, right: 4, zIndex: 2,
              borderRadius: 4, padding: "1px 4px", background: "rgba(245,247,247,.94)",
              color: "#74827F", fontSize: 8, fontWeight: 900, lineHeight: 1.4 }}>
              {dragging.task.time?.slice(0,5)}
            </span>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#fff",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {dragging.task.time?.slice(0,5)} {dragging.task.title}
            </div>
            {dragging.task.end_time && (
              <div style={{ fontSize: 9, color: "rgba(255,255,255,.75)", marginTop: 1 }}>
                ~ {dragging.task.end_time.slice(0,5)}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/* ─── DayView (full-width day detail) ────────────────── */
function DayView({ dateStr, tasks, loading, todayStr, onToggle, onDelete, onAdd, onEdit,
  onUpdateTask, isMobile = false, onPrev, onNext, onOpenAdd, onOpenEdit, onNavigateMonth }: {
  dateStr: string; tasks: CalTask[]; loading: boolean; todayStr: string;
  onToggle: (t: CalTask) => void; onDelete: (id: string) => void;
  onAdd: (t: CalTask) => void; onEdit: (t: CalTask) => void;
  onUpdateTask: (id: string, fields: Partial<CalTask>) => void;
  isMobile?: boolean; onPrev: () => void; onNext: () => void;
  onOpenAdd?: (date: string, x: number, y: number, time?: string) => void;
  onOpenEdit?: (task: CalTask, x: number, y: number) => void;
  onNavigateMonth?: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const isToday = dateStr === todayStr;
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  const allDay = tasks.filter(t => !t.time);
  const timed  = tasks.filter(t => !!t.time);
  const timedLayout = useMemo(() => layoutOverlappingTasks(timed), [timed]);

  const [dragging, setDragging] = useState<{
    task: CalTask; currentX: number; currentY: number; offsetX: number; offsetY: number;
  } | null>(null);
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const dragStartRef = useRef<{x:number;y:number}>({x:0,y:0}); // 클릭 vs 드래그 구분용
  const scrollRef = useRef<HTMLDivElement>(null);

  const TL_W  = isMobile ? 32 : 44;
  const MIN_H = isMobile ? 44 : 28;

  const getTimeFromY = (clientY: number): string | null => {
    const el = scrollRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const relY = clientY - rect.top + el.scrollTop;
    const totalMins = Math.round((relY / HOUR_HEIGHT * 60) / 15) * 15;
    const h = Math.max(7, Math.min(21, Math.floor(totalMins / 60) + 7));
    const m = totalMins % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  };

  const timeToTop = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return (h - 7 + m / 60) * HOUR_HEIGHT;
  };

  const durationPx = (s: string, e: string | null | undefined) => {
    if (!e) return HOUR_HEIGHT;
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    return Math.max(MIN_H, ((eh * 60 + em) - (sh * 60 + sm)) / 60 * HOUR_HEIGHT);
  };

  const isDraggingActive = dragging !== null;
  useEffect(() => {
    if (!isDraggingActive) return;
    const onMouseMove = (e: MouseEvent) => {
      setDragging(d => d ? { ...d, currentX: e.clientX, currentY: e.clientY } : null);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      setDragging(d => d ? { ...d, currentX: t.clientX, currentY: t.clientY } : null);
    };
    const finishDrag = (clientX: number, clientY: number) => {
      const d = draggingRef.current;
      if (d) {
        const moved = Math.hypot(clientX - dragStartRef.current.x, clientY - dragStartRef.current.y);
        if (moved < 6) {
          // 거의 움직이지 않았으면 드래그가 아니라 클릭 — 모바일은 전체화면 팝업, 데스크탑은 인라인 편집 폼
          setDragging(null);
          if (isMobile && onOpenEdit) onOpenEdit(d.task, clientX, clientY);
          else setEditingId(d.task.id);
          return;
        }
        // 박스 안 어디를 잡았든(offsetY) 화면에 보이는 박스의 윗변이 새 시작시간이 되어야 한다 —
        // 커서 좌표를 그대로 넣으면 잡은 지점만큼 항상 더 밀려서 계산되는 버그가 있었다.
        const newTime = getTimeFromY(clientY - d.offsetY);
        if (newTime && newTime !== (d.task.time ?? "")) {
          // 통째로 이동 — 기존 소요시간을 그대로 유지한 채 새 시작시간으로 옮긴다
          const fields: Partial<CalTask> = { time: newTime };
          if (d.task.end_time && d.task.time) {
            const durationMins = timeToMinutes(d.task.end_time) - timeToMinutes(d.task.time);
            if (durationMins > 0) fields.end_time = minutesToTime(timeToMinutes(newTime) + durationMins);
          }
          onUpdateTask(d.task.id, fields);
        }
      }
      setDragging(null);
    };
    const onMouseUp = (e: MouseEvent) => finishDrag(e.clientX, e.clientY);
    const onTouchEnd = (e: TouchEvent) => finishDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    document.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraggingActive]);

  const dropTime = dragging ? getTimeFromY(dragging.currentY) : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
      maxWidth: isMobile ? undefined : 700, margin: "0 auto", width: "100%",
      userSelect: dragging ? "none" : undefined,
      cursor: dragging ? CURSOR_GRABBING : undefined }}>

      {/* 모바일: 월로 돌아가기 */}
      {isMobile && onNavigateMonth && (
        <div style={{ padding: "8px 12px 0", flexShrink: 0 }}>
          <button onClick={onNavigateMonth} style={{
            background: "none", border: "none", color: C.teal, fontSize: 14, fontWeight: 800,
            cursor: "pointer", padding: "4px 2px", fontFamily: "inherit" }}>
            ‹ {d.getMonth()+1}월
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12,
        padding: isMobile ? "10px 12px 8px" : "14px 24px 12px", flexShrink: 0 }}>
        <button onClick={onPrev} style={{ width: isMobile ? 36 : 30, height: isMobile ? 36 : 30,
          border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.teal }}>
          <ChevronLeft size={isMobile ? 16 : 14}/>
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {isToday && <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 800, color: C.todayRed,
              background: "#FFF0EE", padding: "2px 9px", borderRadius: 99 }}>오늘</span>}
            <span style={{ fontSize: isMobile ? 15 : 18, fontWeight: 900, color: C.teal }}>
              {d.getMonth()+1}월 {d.getDate()}일 {WEEKDAYS[dow]}요일
            </span>
          </div>
        </div>
        <button onClick={onNext} style={{ width: isMobile ? 36 : 30, height: isMobile ? 36 : 30,
          border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.teal }}>
          <ChevronRight size={isMobile ? 16 : 14}/>
        </button>
      </div>

      {/* All-day events */}
      {allDay.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: "10px 12px", margin: `0 ${isMobile ? 8 : 24}px 10px`, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.hint, marginBottom: 6 }}>하루 종일</div>
          <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 5 : 7 }}>
            {allDay.map(t => (
              <TaskItem key={t.id} task={t} onToggle={() => onToggle(t)} onDelete={() => onDelete(t.id)} onEdit={onEdit}/>
            ))}
          </div>
        </div>
      )}

      {/* Time grid */}
      {loading ? (
        <div style={{ textAlign: "center", color: C.hint, padding: "32px 0", fontSize: 13 }}>불러오는 중…</div>
      ) : (
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto",
          padding: `0 ${isMobile ? 4 : 24}px` }}>
          <div style={{ display: "flex" }}>
            {/* Time labels */}
            <div style={{ width: TL_W, flexShrink: 0 }}>
              {HOURS.map(h => (
                <div key={h} style={{ height: HOUR_HEIGHT, display: "flex", alignItems: "flex-start",
                  paddingTop: 4, justifyContent: "flex-end", paddingRight: isMobile ? 4 : 8 }}>
                  <span style={{ fontSize: isMobile ? 8.5 : 9.5, color: C.hint, fontWeight: 700 }}>
                    {String(h).padStart(2,"0")}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Event column */}
            <div style={{ flex: 1, position: "relative", borderLeft: `1px solid ${C.border}` }}>
              {/* Hour slot backgrounds — click to add */}
              {HOURS.map(h => (
                <div key={h}
                  style={{ height: HOUR_HEIGHT, borderBottom: `1px solid ${C.border}20`,
                    background: h % 2 === 0 ? "#FAFCFB" : "#FFFFFF",
                    cursor: dragging ? CURSOR_GRABBING : onOpenAdd ? "pointer" : "default" }}
                  onClick={e => { if (!dragging) onOpenAdd?.(dateStr, e.clientX, e.clientY, `${String(h).padStart(2,"0")}:00`); }}
                />
              ))}

              {/* Drop indicator */}
              {dropTime && dragging && (
                <div style={{
                  position: "absolute",
                  top: timeToTop(dropTime),
                  left: 2, right: 2,
                  height: Math.max(MIN_H, durationPx(dropTime, dragging.task.end_time)),
                  background: "rgba(15,68,64,.08)",
                  border: `2px dashed ${C.teal}`,
                  borderRadius: 5, pointerEvents: "none", zIndex: 5, transition: "top .05s",
                }}/>
              )}

              {/* Absolute-positioned timed events */}
              {timed.map(t => {
                const cat = CATS[t.category] ?? CATS.general;
                const top = timeToTop(t.time!);
                const height = durationPx(t.time!, t.end_time);
                const isDraggingThis = dragging?.task.id === t.id;
                const layout = timedLayout.get(t.id);

                if (editingId === t.id) return (
                  <div key={t.id} style={{ position: "absolute", top, left: layout?.left ?? 2, width: layout?.width ?? "calc(100% - 4px)", zIndex: 20 }}>
                    <EditTaskForm task={t}
                      onSave={updated => { onEdit(updated); setEditingId(null); }}
                      onCancel={() => setEditingId(null)}/>
                  </div>
                );

                return (
                  <div key={t.id}
                    onMouseDown={e => {
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      dragStartRef.current = { x: e.clientX, y: e.clientY };
                      setDragging({ task: t, currentX: e.clientX, currentY: e.clientY,
                        offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
                    }}
                    onTouchStart={e => {
                      const touch = e.touches[0];
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      dragStartRef.current = { x: touch.clientX, y: touch.clientY };
                      setDragging({ task: t, currentX: touch.clientX, currentY: touch.clientY,
                        offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top });
                    }}
                    style={{
                      position: "absolute", top,
                      left: layout?.left ?? 2,
                      width: layout?.width ?? "calc(100% - 4px)",
                      height: Math.max(MIN_H, height),
                      background: t.completed ? "#9CA3AF" : cat.color,
                      borderRadius: 6, padding: isMobile ? "5px 8px 12px" : "4px 8px 10px",
                      overflow: "hidden",
                      cursor: isDraggingThis ? CURSOR_GRABBING : CURSOR_GRAB,
                      zIndex: isDraggingThis ? 2 : 10,
                      opacity: isDraggingThis ? 0.2 : t.completed ? 0.7 : 1,
                      boxShadow: "0 1px 4px rgba(0,0,0,.15)",
                      transition: "opacity .15s",
                      touchAction: "none",
                    }}>
                    <div style={{ fontSize: isMobile ? 10 : 9, fontWeight: 700,
                      color: "rgba(255,255,255,.85)", marginBottom: 1 }}>
                      {t.time?.slice(0,5)}{t.end_time ? ` – ${t.end_time.slice(0,5)}` : ""}
                    </div>
                    <div style={{ fontSize: isMobile ? 12 : 11, fontWeight: 800, color: "#fff",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>
                      {t.title}
                    </div>
                    {t.location && (
                      <div style={{ fontSize: isMobile ? 10 : 9, color: "rgba(255,255,255,.75)", marginTop: 1 }}>
                        📍 {t.location}
                      </div>
                    )}
                    {/* Action buttons */}
                    <div style={{ position: "absolute", top: 3, right: 4, display: "flex", gap: 2 }}>
                      <button onClick={e => { e.stopPropagation(); onToggle(t); }} style={{
                        width: isMobile ? 22 : 17, height: isMobile ? 22 : 17, borderRadius: "50%",
                        border: `2px solid ${t.completed ? "#fff" : "rgba(255,255,255,.6)"}`,
                        background: t.completed ? "rgba(255,255,255,.9)" : "transparent",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {t.completed && <Check size={9} color={cat.color} strokeWidth={3}/>}
                      </button>
                      <button onClick={e => {
                        e.stopPropagation();
                        if (isMobile && onOpenEdit) onOpenEdit(t, e.clientX, e.clientY);
                        else setEditingId(t.id);
                      }} style={{
                        background: "rgba(255,255,255,.15)", border: "none", borderRadius: 3,
                        cursor: "pointer", color: "rgba(255,255,255,.9)", padding: 1, display: "flex",
                      }}><Pencil size={isMobile ? 12 : 9}/></button>
                      <button onClick={e => { e.stopPropagation(); onDelete(t.id); }} style={{
                        background: "rgba(255,255,255,.15)", border: "none", borderRadius: 3,
                        cursor: "pointer", color: "rgba(255,255,255,.9)", padding: 1, display: "flex",
                      }}><Trash2 size={isMobile ? 12 : 9}/></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add task form */}
          <div style={{ marginTop: 16 }}>
            <AddTaskForm date={dateStr} onAdd={onAdd}/>
          </div>
        </div>
      )}

      {/* Ghost card */}
      {dragging && (() => {
        const cat = CATS[dragging.task.category] ?? CATS.general;
        return (
          <div style={{
            position: "fixed", left: 0, top: 0, pointerEvents: "none", zIndex: 9999,
            willChange: "transform",
            transform: `translate(${dragging.currentX - dragging.offsetX}px, ${dragging.currentY - dragging.offsetY}px) rotate(2deg) scale(1.05)`,
          }}>
            <div style={{
              width: 140, background: cat.color, borderRadius: 6, padding: "5px 10px 10px",
              boxShadow: "0 10px 32px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.18)", overflow: "hidden",
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#fff",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {dragging.task.time?.slice(0,5)} {dragging.task.title}
              </div>
              {dragging.task.end_time && (
                <div style={{ fontSize: 9, color: "rgba(255,255,255,.75)", marginTop: 1 }}>
                  ~ {dragging.task.end_time.slice(0,5)}
                </div>
              )}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 5,
                background: "rgba(0,0,0,.15)", borderRadius: "0 0 6px 6px" }}/>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── MiniMonth (for year view) ──────────────────────── */
function MiniMonth({ year, m, todayStr, selectedDate, tasksByDate, onSelectDate, onClick, isMobile = false }: {
  year: number; m: number; todayStr: string; selectedDate: string;
  tasksByDate: Record<string, CalTask[]>;
  onSelectDate: (d: string) => void; onClick: () => void; isMobile?: boolean;
}) {
  const { cells } = buildMonthCells(year, m);
  return (
    <div onClick={onClick} style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "10px 10px 8px", cursor: "pointer",
      transition: "border-color .15s",
    }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: C.teal, marginBottom: 6, textAlign: "center" }}>
        {monthLabel(m)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} style={{ textAlign: "center", fontSize: 7.5, fontWeight: 700, paddingBottom: 2,
            color: i===0 ? "#DC2626" : i===6 ? "#2563EB" : C.hint }}>{w}</div>
        ))}
        {cells.map((cell, idx) => {
          if (!cell.isCurrent) return <div key={idx}/>;
          const ds = `${cell.year}-${String(cell.month+1).padStart(2,"0")}-${String(cell.day).padStart(2,"0")}`;
          const isToday    = ds === todayStr;
          const isSelected = ds === selectedDate;
          const hasTasks   = (tasksByDate[ds]?.length ?? 0) > 0;
          const dow = new Date(cell.year, cell.month, cell.day).getDay();
          return (
            <div key={idx} onClick={e => {
              // 모바일은 날짜를 눌러도 월 화면으로 이동(탭 영역 대부분이 날짜 숫자라 그래야 자연스럽다).
              // 데스크탑은 연도 화면에 머문 채 날짜만 선택.
              if (isMobile) { onSelectDate(ds); onClick(); return; }
              e.stopPropagation(); onSelectDate(ds);
            }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center",
                padding: "1px 0", position: "relative" }}>
              <div style={{
                width: 17, height: 17, borderRadius: "50%",
                background: isToday ? C.todayRed : isSelected ? C.teal : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: 8, fontWeight: isToday || isSelected ? 900 : 600,
                  color: isToday || isSelected ? "#fff" : dow===0 ? "#DC2626" : dow===6 ? "#2563EB" : C.txt }}>
                  {cell.day}
                </span>
              </div>
              {hasTasks && !isToday && !isSelected && (
                <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
                  width: 3, height: 3, borderRadius: "50%", background: C.teal }}/>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── YearView ────────────────────────────────────────── */
function YearView({ year, todayStr, tasksByDate, selectedDate, onSelectDate, onPrev, onNext, onSelectMonth, isMobile = false }: {
  year: number; todayStr: string; tasksByDate: Record<string, CalTask[]>;
  selectedDate: string;
  onSelectDate: (d: string) => void; onPrev: () => void; onNext: () => void;
  onSelectMonth: (y: number, m: number) => void; isMobile?: boolean;
}) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <button onClick={onPrev} style={{ width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: 7,
          background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.teal }}>
          <ChevronLeft size={14}/>
        </button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 900, color: C.teal }}>{year}년</div>
        <button onClick={onNext} style={{ width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: 7,
          background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.teal }}>
          <ChevronRight size={14}/>
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 12 }}>
        {Array.from({length: 12}, (_, m) => (
          <MiniMonth key={m} year={year} m={m} todayStr={todayStr}
            selectedDate={selectedDate} tasksByDate={tasksByDate}
            onSelectDate={onSelectDate} isMobile={isMobile}
            onClick={() => onSelectMonth(year, m)}/>
        ))}
      </div>
    </div>
  );
}

/* ─── CalendarPage ────────────────────────────────────── */
export default function CalendarPage() {
  const today    = new Date();
  const todayStr = toYMD(today);

  const [viewMode,    setViewMode]    = useState<ViewMode>("month");
  const [year,        setYear]        = useState(today.getFullYear());
  const [month,       setMonth]       = useState(today.getMonth());
  const [weekDates,   setWeekDates]   = useState(() => getWeekDates(todayStr));
  const [selectedDate,setSelectedDate]= useState(todayStr);
  const [allTasks,    setAllTasks]    = useState<CalTask[]>([]);
  const [dayTasks,    setDayTasks]    = useState<CalTask[]>([]);
  const [dayLoading,  setDayLoading]  = useState(false);
  const [isMobile,    setIsMobile]    = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false); // 일정 분석(카테고리별 건수) 팝업
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null); // 삭제 확인 팝업 대상 태스크 id
  const [popover, setPopover] = useState<{
    mode: "add" | "edit"; date: string; task: CalTask | null; x: number; y: number; time?: string;
  } | null>(null);
  const loadedKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 모바일에는 "주" 화면이 없음(세그먼트 탭 자체가 안 보임) — 데스크탑에서 리사이즈해 들어온 경우 월로 보정
  useEffect(() => {
    if (isMobile && viewMode === "week") setViewMode("month");
  }, [isMobile, viewMode]);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-confirm-delete-modal]")) setConfirmDeleteId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [confirmDeleteId]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, CalTask[]> = {};
    for (const t of allTasks) {
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    }
    // 시간 없는 일정(종일)은 맨 앞, 나머지는 시간순으로 정렬 — 그렇지 않으면 셀에 추가된 순서대로만 쌓여
    // 오후 3시 일정이 오전 9시 일정보다 위에 뜨는 등 뒤죽박죽으로 보인다.
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        if (!a.time && !b.time) return 0;
        if (!a.time) return -1;
        if (!b.time) return 1;
        return a.time.localeCompare(b.time);
      });
    }
    return map;
  }, [allTasks]);

  // 일정 분석 — 지금 보고 있는 달(year/month) 기준으로 카테고리별 건수를 센다.
  // 뷰(월/주/일/연) 모드와 무관하게 상단 nav의 year/month가 항상 "현재 기준 월"을 가리키므로 그대로 쓴다.
  const monthStats = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const monthTasks = allTasks.filter(t => t.date.startsWith(prefix));
    const byCategory = Object.keys(CATS).map(key => ({
      key, ...CATS[key],
      count: monthTasks.filter(t => t.category === key).length,
    }));
    return { total: monthTasks.length, byCategory, completed: monthTasks.filter(t => t.completed).length };
  }, [allTasks, year, month]);


  const loadMonth = useCallback(async (y: number, m: number) => {
    const key = `${y}-${String(m+1).padStart(2,"0")}`;
    if (loadedKeys.current.has(key)) return;
    loadedKeys.current.add(key);
    const r = await fetch(`/api/calendar?month=${key}`);
    const d = await r.json();
    if (d.ok) setAllTasks(prev => {
      const others = prev.filter(t => !t.date.startsWith(key));
      return [...others, ...(d.tasks as CalTask[])];
    });
  }, []);

  const loadYear = useCallback(async (y: number) => {
    const key = `year-${y}`;
    if (loadedKeys.current.has(key)) return;
    loadedKeys.current.add(key);
    const r = await fetch(`/api/calendar?year=${y}`);
    const d = await r.json();
    if (d.ok) setAllTasks(d.tasks as CalTask[]);
  }, []);

  const loadDay = useCallback(async (date: string) => {
    setDayLoading(true);
    const r = await fetch(`/api/calendar?date=${date}`);
    const d = await r.json();
    if (d.ok) setDayTasks(d.tasks as CalTask[]);
    setDayLoading(false);
  }, []);

  // refresh trigger (from OliviaChat)
  useEffect(() => {
    const handler = () => {
      loadedKeys.current.clear();
      const key = `${year}-${String(month+1).padStart(2,"0")}`;
      const r = fetch(`/api/calendar?month=${key}`).then(res => res.json()).then(d => {
        if (d.ok) setAllTasks(d.tasks as CalTask[]);
      });
      loadDay(selectedDate);
    };
    window.addEventListener("olivia-calendar-updated", handler);
    return () => window.removeEventListener("olivia-calendar-updated", handler);
  }, [year, month, selectedDate, loadDay]);

  useEffect(() => {
    if (viewMode === "year") loadYear(year);
    else { loadMonth(year, month); }
  }, [year, month, viewMode, loadMonth, loadYear]);

  useEffect(() => { loadDay(selectedDate); }, [selectedDate, loadDay]);

  // sync dayTasks from allTasks for month/week views
  useEffect(() => {
    if (viewMode !== "day") setDayTasks(tasksByDate[selectedDate] ?? []);
  }, [tasksByDate, selectedDate, viewMode]);

  const handleSelectDate = (ds: string) => {
    setSelectedDate(ds);
    const d = new Date(ds + "T12:00:00");
    setYear(d.getFullYear()); setMonth(d.getMonth());
    setWeekDates(getWeekDates(ds));
  };

  // 모바일 드릴다운 내비게이션: 연 → 월 → 일, 세그먼트 탭 없이 화면 전환
  const navigateToDay = (ds: string) => { handleSelectDate(ds); setViewMode("day"); };
  const navigateToMonth = () => setViewMode("month");
  const navigateToYear = () => setViewMode("year");

  const goToday = () => {
    setYear(today.getFullYear()); setMonth(today.getMonth());
    setWeekDates(getWeekDates(todayStr)); setSelectedDate(todayStr);
  };

  const prevPeriod = () => {
    if (viewMode === "year") { setYear(y => y-1); }
    else if (viewMode === "month") {
      if (month === 0) { setYear(y => y-1); setMonth(11); }
      else setMonth(m => m-1);
    } else if (viewMode === "week") {
      const newSun = new Date(weekDates[0]);
      newSun.setDate(newSun.getDate() - 7);
      const wd = getWeekDates(toYMD(newSun));
      setWeekDates(wd);
      setYear(wd[3].getFullYear()); setMonth(wd[3].getMonth());
    } else {
      const d = new Date(selectedDate + "T12:00:00"); d.setDate(d.getDate() - 1);
      handleSelectDate(toYMD(d));
    }
  };

  const nextPeriod = () => {
    if (viewMode === "year") { setYear(y => y+1); }
    else if (viewMode === "month") {
      if (month === 11) { setYear(y => y+1); setMonth(0); }
      else setMonth(m => m+1);
    } else if (viewMode === "week") {
      const newSun = new Date(weekDates[0]);
      newSun.setDate(newSun.getDate() + 7);
      const wd = getWeekDates(toYMD(newSun));
      setWeekDates(wd);
      setYear(wd[3].getFullYear()); setMonth(wd[3].getMonth());
    } else {
      const d = new Date(selectedDate + "T12:00:00"); d.setDate(d.getDate() + 1);
      handleSelectDate(toYMD(d));
    }
  };

  const openAddPopover = (date: string, x: number, y: number, time?: string) =>
    setPopover({ mode: "add", date, task: null, x, y, time });
  const openEditPopover = (task: CalTask, x: number, y: number) =>
    setPopover({ mode: "edit", date: task.date, task, x, y });

  const updateTaskFields = async (id: string, fields: Partial<CalTask>) => {
    await fetch("/api/calendar", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }) });
    const upd = (t: CalTask) => t.id === id ? { ...t, ...fields } : t;
    setAllTasks(ts => ts.map(upd)); setDayTasks(ts => ts.map(upd));
  };

  const editTask = (task: CalTask) => {
    const upd = (t: CalTask) => t.id === task.id ? task : t;
    setAllTasks(ts => ts.map(upd)); setDayTasks(ts => ts.map(upd));
  };

  const toggleTask = async (task: CalTask) => {
    await fetch("/api/calendar", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, completed: !task.completed }) });
    const upd = (t: CalTask) => t.id === task.id ? { ...t, completed: !t.completed } : t;
    setAllTasks(ts => ts.map(upd)); setDayTasks(ts => ts.map(upd));
  };

  const deleteTask = async (id: string) => {
    const response = await fetch(`/api/calendar?id=${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "일정 삭제 실패");
    setAllTasks(ts => ts.filter(t => t.id !== id));
    setDayTasks(ts => ts.filter(t => t.id !== id));
  };

  const addTask = (task: CalTask) => {
    setAllTasks(ts => [...ts, task]); setDayTasks(ts => [...ts, task]);
  };

  // 삭제는 항상 확인 팝업을 거치도록 통일 — 트래시 아이콘, 키보드 Delete 모두 이 경로를 탐
  const taskById = useMemo(() => {
    const map: Record<string, CalTask> = {};
    for (const t of allTasks) map[t.id] = t;
    return map;
  }, [allTasks]);
  const requestDeleteTask = (id: string) => setConfirmDeleteId(id);
  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    try { await deleteTask(confirmDeleteId); setConfirmDeleteId(null); }
    catch (error) { window.alert(error instanceof Error ? error.message : "일정 삭제 실패"); }
  };

  // 키보드 붙여넣기(Cmd/Ctrl+V) 등, AddTaskForm 내부 submit()을 거치지 않는 생성 경로용
  const createTask = async (fields: Omit<CalTask, "id" | "created_at">): Promise<CalTask | null> => {
    try {
      const r = await fetch("/api/calendar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: fields.date, title: fields.title, memo: fields.memo,
          category: fields.category, time: fields.time ?? null,
          end_time: fields.end_time ?? null, location: fields.location ?? null,
        }),
      });
      const d = await r.json();
      if (!d.ok) return null;
      const newTask: CalTask = { ...fields, id: d.id, created_at: new Date().toISOString() };
      addTask(newTask);
      return newTask;
    } catch { return null; }
  };

  const VIEW_LABELS: Record<ViewMode, string> = { day: "일", week: "주", month: "월", year: "년" };

  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif", color: C.txt }}>

      <PageHeader title="업무 캘린더" actions={<>
          {/* view mode tabs — 모바일에서는 숨기고 연/월/일 드릴다운 내비게이션으로 대체 */}
          {!isMobile && (
            <div style={{ display: "flex", background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: 2, gap: 1 }}>
              {(["day","week","month","year"] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`pc-btn pc-btn--sm ${viewMode === v ? "pc-btn--primary" : "pc-btn--ghost"}`}
                  style={{ border: "none" }}>{VIEW_LABELS[v]}</button>
              ))}
            </div>
          )}
          <button onClick={goToday} className="pc-btn pc-btn--secondary pc-btn--sm">오늘</button>
          <button onClick={() => setShowStatsModal(v => !v)} className="pc-btn pc-btn--ghost pc-btn--sm">
            📊{!isMobile && " 일정 분석"}
          </button>
      </>} />

      <div style={{
        maxWidth: isMobile ? undefined : 1440, margin: "0 auto", width: "100%",
        height: "calc(100vh - 110px)", display: "flex", overflow: "hidden",
      }}>
        {/* 전체화면 캘린더 — 사이드 패널 없이 그리드가 화면 전체를 씀. 셀/일정 클릭은 팝업으로 처리 */}
        {viewMode === "month" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>
            <MonthView year={year} month={month} todayStr={todayStr}
              selectedDate={selectedDate} tasksByDate={tasksByDate}
              onSelectDate={handleSelectDate}
              onUpdateTask={updateTaskFields}
              onCreateTask={createTask}
              onRequestDelete={requestDeleteTask}
              onPrev={prevPeriod} onNext={nextPeriod}
              onOpenAdd={openAddPopover} onOpenEdit={openEditPopover}
              isMobile={isMobile} onNavigateDay={navigateToDay} onNavigateYear={navigateToYear}/>
          </div>
        )}

        {viewMode === "week" && !isMobile && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#F4F9F8" }}>
            <WeekView weekDates={weekDates} todayStr={todayStr}
              selectedDate={selectedDate} tasksByDate={tasksByDate}
              onSelectDate={handleSelectDate}
              onUpdateTask={updateTaskFields}
              isMobile={isMobile}
              onPrev={prevPeriod} onNext={nextPeriod}
              onOpenAdd={openAddPopover} onOpenEdit={openEditPopover}/>
          </div>
        )}

        {viewMode === "day" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
            minHeight: "calc(100vh - 56px)" }}>
            <DayView dateStr={selectedDate} tasks={dayTasks} loading={dayLoading} todayStr={todayStr}
              onToggle={toggleTask} onDelete={requestDeleteTask} onAdd={addTask} onEdit={editTask}
              onUpdateTask={updateTaskFields} isMobile={isMobile}
              onPrev={prevPeriod} onNext={nextPeriod}
              onOpenAdd={openAddPopover} onOpenEdit={openEditPopover}
              onNavigateMonth={isMobile ? navigateToMonth : undefined}/>
          </div>
        )}

        {viewMode === "year" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
            <YearView year={year} todayStr={todayStr} tasksByDate={tasksByDate}
              selectedDate={selectedDate} onSelectDate={handleSelectDate}
              isMobile={isMobile}
              onPrev={prevPeriod} onNext={nextPeriod}
              onSelectMonth={(y, m) => { setYear(y); setMonth(m); setViewMode("month"); }}/>
          </div>
        )}
      </div>

      {/* 일정 추가/수정 팝업 — 데스크탑은 클릭 위치 근처 카드, 모바일은 전체화면 시트 */}
      {popover && (
        <EventPopover
          key={`${popover.mode}-${popover.task?.id ?? popover.date}-${popover.x}-${popover.y}`}
          mode={popover.mode} date={popover.date} task={popover.task}
          anchor={{ x: popover.x, y: popover.y }} isMobile={isMobile} defaultTime={popover.time}
          onClose={() => setPopover(null)}
          onAdd={addTask} onSave={editTask} onToggle={toggleTask}
          onDelete={id => { setPopover(null); requestDeleteTask(id); }}/>
      )}

      {/* 일정 분석 팝업 — 지금 보고 있는 달 기준 카테고리별 건수 */}
      {showStatsModal && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 300 }}
            onClick={() => setShowStatsModal(false)}/>
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 301,
            width: isMobile ? "calc(100vw - 32px)" : 360, maxHeight: "80vh", overflowY: "auto",
            background: "#fff", borderRadius: 14, padding: "20px 20px 18px",
            boxShadow: "0 20px 50px rgba(0,0,0,.22)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: C.txt }}>📊 일정 분석</span>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: C.muted,
                background: C.mint, padding: "3px 10px", borderRadius: 20 }}>
                {year}년 {monthLabel(month)}
              </span>
              <button onClick={() => setShowStatsModal(false)} style={{
                background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 2, display: "flex" }}>
                <X size={16}/>
              </button>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
              총 {monthStats.total}건 · 완료 {monthStats.completed}건
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {monthStats.byCategory.map(c => {
                const pct = monthStats.total > 0 ? Math.round((c.count / monthStats.total) * 100) : 0;
                return (
                  <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 3, background: c.color, flexShrink: 0 }}/>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.txt, width: 44, flexShrink: 0 }}>{c.label}</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 99, background: "#F1F5F4", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: c.color, borderRadius: 99, transition: "width .3s" }}/>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, width: 36, textAlign: "right", flexShrink: 0 }}>{c.count}건</span>
                  </div>
                );
              })}
            </div>
            {monthStats.total === 0 && (
              <div style={{ fontSize: 12, color: C.hint, textAlign: "center", padding: "16px 0 4px" }}>
                이 달에 등록된 일정이 없어요
              </div>
            )}
          </div>
        </>
      )}

      {/* 삭제 확인 팝업 — 트래시 아이콘·키보드 Delete 공통 경로 */}
      {confirmDeleteId && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 300 }}/>
          <div data-confirm-delete-modal style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 301,
            width: 320, background: "#fff", borderRadius: 14, padding: "22px 22px 18px",
            boxShadow: "0 20px 50px rgba(0,0,0,.22)",
          }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.txt, marginBottom: 8 }}>일정을 삭제할까요?</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 20, wordBreak: "break-word" }}>
              &lsquo;{taskById[confirmDeleteId]?.title ?? ""}&rsquo; 일정을 휴지통으로 이동합니다. 30일 안에 복원할 수 있어요.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDeleteId(null)} className="pc-btn pc-btn--secondary pc-btn--sm">취소</button>
              <button onClick={confirmDelete} className="pc-btn pc-btn--orange pc-btn--sm">삭제</button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes mobileSlideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        .cal-cell:focus-visible {
          outline: 2px solid #0F4440 !important;
          outline-offset: -2px;
        }
        .cal-cell:focus:not(:focus-visible) {
          outline: none;
        }
      `}</style>
    </main>
  );
}
