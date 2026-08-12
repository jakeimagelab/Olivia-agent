"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MiniCalendar from "@/components/work-journal/MiniCalendar";
import { dateHeaderLabel, todayStr } from "@/lib/work-journal/dateLabel";
import { useHomeDashboardData } from "@/components/dashboard/HomeDashboardData";

// 통합 스케줄 — 미니 캘린더(왼쪽, 작게) + 선택한 날짜의 일정(오른쪽, 넓게)을 가로로 배치.
// 오늘 할 일은 캘린더 아래에 "3/5" 요약만 보여준다(체크리스트 전체는 /calendar에서).
export default function IntegratedCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => todayStr().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => todayStr());
  const [eventDates, setEventDates] = useState<Set<string>>(new Set());
  const [daySchedules, setDaySchedules] = useState<{ id: string; time: string | null; title: string }[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);

  const { data } = useHomeDashboardData();
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

  const isToday = selectedDate === todayStr();

  return (
    <section className="pc-panel pc-schedule-panel">
      <div className="pc-panel__header">
        <h3>통합 스케줄</h3>
        <div className="pc-panel__actions">
          <button type="button" onClick={() => handleSelectDate(todayStr())}>오늘</button>
          <Link href="/calendar">전체 일정</Link>
        </div>
      </div>

      <div className="pc-schedule-panel__body">
        <div className="pc-mini-calendar-wrap">
          <div className="pc-mini-calendar">
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
          <div className="pc-today-task-summary">
            <span>오늘 할 일</span>
            <strong>{doneCount}/{todos.length}</strong>
          </div>
        </div>

        <div className="pc-today-schedule">
          <div className="pc-today-schedule__date">
            {isToday ? "오늘" : dateHeaderLabel(selectedDate)}
          </div>

          {scheduleLoading ? (
            <div className="pc-panel__empty">불러오는 중...</div>
          ) : daySchedules.length === 0 ? (
            <div className="pc-panel__empty">등록된 일정이 없어요.</div>
          ) : (
            daySchedules.slice(0, 5).map((s) => (
              <button key={s.id} type="button" className="pc-schedule-row">
                <time>{s.time || "종일"}</time>
                <span>{s.title}</span>
              </button>
            ))
          )}

          <Link href="/calendar" className="pc-schedule-more">일정 전체 보기</Link>
        </div>
      </div>
    </section>
  );
}
