"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, NotebookPen } from "lucide-react";
import MiniCalendar from "@/components/work-journal/MiniCalendar";
import { todayStr } from "@/lib/work-journal/dateLabel";

// 캘린더 + 오늘 일정을 한 카드에 통합 — 미니 캘린더는 work-journal에서 이미 만든 컴포넌트를
// compact 모드로 재사용하고, 오늘 일정은 그 옆에 작게 나열한다.
export default function IntegratedCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => todayStr().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => todayStr());
  const [eventDates, setEventDates] = useState<Set<string>>(new Set());
  const [daySchedules, setDaySchedules] = useState<{ id: string; time: string | null; title: string }[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);

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
      boxShadow: "0 12px 40px rgba(20,60,55,0.06)", overflow: "hidden", padding: "12px 12px 10px",
      gap: 8,
    }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 10 }}>
        <div style={{ width: "58%", flexShrink: 0 }}>
          <MiniCalendar
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            dayCounts={new Map()}
            eventDates={eventDates}
            onSelectDate={handleSelectDate}
            onMonthChange={setCurrentMonth}
            upcoming={[]}
            onSelectUpcoming={() => {}}
            compact
            hideUpcoming
          />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: "#6F7E7A", marginBottom: 8, letterSpacing: ".02em" }}>
            {selectedDate === todayStr() ? "오늘 일정" : `${selectedDate} 일정`}
          </div>
          {scheduleLoading ? (
            <div style={{ fontSize: 11.5, color: "#9BB5B0" }}>불러오는 중...</div>
          ) : daySchedules.length === 0 ? (
            <div style={{ fontSize: 11.5, color: "#9BB5B0" }}>등록된 일정이 없어요.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7, overflow: "hidden" }}>
              {daySchedules.slice(0, 6).map((s) => (
                <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 1, fontSize: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#155855" }}>{s.time || "종일"}</span>
                  <span style={{ color: "#1C2B28", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Link href="/work-journal" style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        height: 34, borderRadius: 12, background: "#155855", color: "#fff", fontSize: 12, fontWeight: 800,
        textDecoration: "none",
      }}>
        <NotebookPen size={13} /> 업무일지 작성하기 <ChevronRight size={13} />
      </Link>
    </section>
  );
}
