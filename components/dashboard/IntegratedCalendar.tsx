"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FilePlus2, FolderUp, CalendarPlus, UsersRound } from "lucide-react";
import MiniCalendar from "@/components/work-journal/MiniCalendar";
import { dateHeaderLabel, todayStr } from "@/lib/work-journal/dateLabel";
import { useHomeDashboardData } from "@/components/dashboard/HomeDashboardData";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { navigateToFeature } from "@/lib/olivia/features/navigationBridge";

// UI/UX 통일 개편(2026-08-18) 23절 — Quick Action은 더 이상 별도 카드가 아니라 Today Schedule
// 카드 하단에 붙는다(하단 그리드를 3카드로 줄이기 위함). QuickActions.tsx와 같은 4개 액션.
const QUICK_LINKS = [
  { label: "새 프로젝트", href: "/clients", icon: FilePlus2 },
  { label: "문서 업로드", href: "/quote", icon: FolderUp },
  { label: "일정 등록", href: "/calendar", icon: CalendarPlus },
  { label: "고객 검색", href: "/clients", icon: UsersRound },
] as const;

// 통합 스케줄 — 미니 캘린더(왼쪽, 작게) + 선택한 날짜의 일정(오른쪽, 넓게)을 가로로 배치.
// 오늘 할 일은 캘린더 아래에 "3/5" 요약만 보여준다(체크리스트 전체는 /calendar에서).
export default function IntegratedCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => todayStr().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => todayStr());
  const [eventDates, setEventDates] = useState<Set<string>>(new Set());
  const [daySchedules, setDaySchedules] = useState<{
    id: string;
    time: string | null;
    title: string;
    clientId?: string;
    clientName?: string;
    projectId?: string;
    projectName?: string;
  }[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [selectedRowId, setSelectedRowId] = useState<string | undefined>(undefined);
  const setSelectedSchedule = useOliviaContextStore((state) => state.setSelectedSchedule);
  const setClient = useOliviaContextStore((state) => state.setClient);
  const setProject = useOliviaContextStore((state) => state.setProject);
  const recordAction = useOliviaContextStore((state) => state.recordAction);

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
        setDaySchedules((json.tasks ?? []).map((t: Record<string, unknown>) => ({
          id: String(t.id),
          time: typeof t.time === "string" ? t.time : null,
          title: String(t.title || "일정"),
          clientId: typeof t.client_id === "string" ? t.client_id : undefined,
          clientName: typeof t.client_name === "string" ? t.client_name : typeof t.hospital_name === "string" ? t.hospital_name : undefined,
          projectId: typeof t.workflow_run_id === "string" ? t.workflow_run_id : typeof t.project_id === "string" ? t.project_id : undefined,
          projectName: typeof t.project_name === "string" ? t.project_name : undefined,
        })));
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
        <h3>오늘의 일정</h3>
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
              <button
                key={s.id}
                type="button"
                className={`pc-schedule-row${selectedRowId === s.id ? " pc-schedule-row--selected" : ""}`}
                aria-pressed={selectedRowId === s.id}
                onClick={() => {
                  if (s.clientId || s.clientName) setClient(s.clientId, s.clientName);
                  if (s.projectId || s.projectName) setProject(s.projectId, s.projectName);
                  setSelectedSchedule(s.id);
                  setSelectedRowId(s.id);
                  recordAction(`schedule:selected:${s.id}`);
                }}
              >
                <time>{s.time || "종일"}</time>
                <span>{s.title}</span>
              </button>
            ))
          )}

          <Link href="/calendar" className="pc-schedule-more">일정 전체 보기</Link>
        </div>
      </div>

      <div className="pc-schedule-panel__quick-actions">
        {QUICK_LINKS.map(({ label, href, icon: Icon }) => (
          <button key={label} type="button" onClick={() => navigateToFeature(href)}>
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
