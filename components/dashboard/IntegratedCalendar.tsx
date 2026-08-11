"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronRight, NotebookPen } from "lucide-react";
import MiniCalendar from "@/components/work-journal/MiniCalendar";
import { todayStr } from "@/lib/work-journal/dateLabel";
import { useHomeDashboardData } from "@/components/dashboard/HomeDashboardData";

// 캘린더 + 오늘 일정 + 오늘 할 일을 한 카드에 통합 — 미니 캘린더는 work-journal에서 이미 만든
// 컴포넌트를 그대로 재사용하고, "오늘 할 일"은 홈 전체가 공유하는 HomeDashboardData를 그대로
// 쓴다(중복 fetch 없이).
export default function IntegratedCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => todayStr().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => todayStr());
  const [eventDates, setEventDates] = useState<Set<string>>(new Set());
  const [daySchedules, setDaySchedules] = useState<{ id: string; time: string | null; title: string }[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);

  const { data, state, savingTaskIds, setTaskCompleted } = useHomeDashboardData();
  const todos = data?.todayTasks ?? [];
  const doneCount = todos.filter((t) => t.completed).length;

  useEffect(() => {
    fetch(`/api/calendar?month=${currentMonth}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json?.ok) return;
        setEventDates(new Set((json.tasks ?? []).map((t: any) => t.date)));
      })
      .catch(() => {});
  }, [currentMonth]);

  useEffect(() => {
    setScheduleLoading(true);
    fetch(`/api/calendar?date=${selectedDate}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json?.ok) return;
        setDaySchedules((json.tasks ?? []).map((t: any) => ({ id: t.id, time: t.time, title: t.title })));
      })
      .catch(() => {})
      .finally(() => setScheduleLoading(false));
  }, [selectedDate]);

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setCurrentMonth(date.slice(0, 7));
  };

  return (
    <section style={{
      display: "flex", flexDirection: "column", height: "100%", minHeight: 0,
      borderRadius: 22, background: "rgba(255,255,255,0.72)", backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)" as any, border: "1px solid rgba(21,88,85,0.08)",
      boxShadow: "0 12px 40px rgba(20,60,55,0.06)", overflow: "hidden", padding: "14px 14px 12px",
      gap: 10,
    }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <MiniCalendar
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          dayCounts={new Map()}
          eventDates={eventDates}
          onSelectDate={handleSelectDate}
          onMonthChange={setCurrentMonth}
          upcoming={[]}
          onSelectUpcoming={() => {}}
        />

        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: "#6F7E7A", marginBottom: 6, letterSpacing: ".02em" }}>
            {selectedDate === todayStr() ? "오늘 일정" : `${selectedDate} 일정`}
          </div>
          {scheduleLoading ? (
            <div style={{ fontSize: 11.5, color: "#9BB5B0" }}>불러오는 중...</div>
          ) : daySchedules.length === 0 ? (
            <div style={{ fontSize: 11.5, color: "#9BB5B0" }}>등록된 일정이 없어요.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {daySchedules.slice(0, 4).map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: "#155855", flexShrink: 0, width: 40 }}>{s.time || "종일"}</span>
                  <span style={{ color: "#1C2B28", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid rgba(21,88,85,0.08)", paddingTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: "#6F7E7A", letterSpacing: ".02em" }}>오늘 할 일</span>
            {todos.length > 0 && <span style={{ fontSize: 10, color: "#9BB5B0" }}>{doneCount}/{todos.length}</span>}
          </div>
          {state === "loading" ? (
            <div style={{ fontSize: 11.5, color: "#9BB5B0" }}>불러오는 중...</div>
          ) : todos.length === 0 ? (
            <div style={{ fontSize: 11.5, color: "#9BB5B0" }}>오늘 할 일이 없어요.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {todos.slice(0, 4).map((task) => {
                const saving = savingTaskIds.has(task.id);
                return (
                  <label key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: saving ? "wait" : "pointer" }}>
                    <span
                      onClick={() => !saving && void setTaskCompleted(task.id, !task.completed)}
                      style={{
                        width: 15, height: 15, borderRadius: 5, flexShrink: 0,
                        border: `1.5px solid ${task.completed ? "#22876A" : "rgba(21,88,85,0.25)"}`,
                        background: task.completed ? "#22876A" : "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {task.completed ? <Check size={10} color="#fff" strokeWidth={3} /> : null}
                    </span>
                    <span style={{ color: task.completed ? "#9BB5B0" : "#1C2B28", textDecoration: task.completed ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {task.title}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Link href="/work-journal" style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        height: 36, borderRadius: 12, background: "#155855", color: "#fff", fontSize: 12, fontWeight: 800,
        textDecoration: "none",
      }}>
        <NotebookPen size={13} /> 업무일지 작성하기 <ChevronRight size={13} />
      </Link>
    </section>
  );
}
