"use client";

import MiniCalendar from "@/components/work-journal/MiniCalendar";
import { C, R } from "@/lib/theme";
import type { CalendarEvent, UpcomingEntry } from "@/lib/work-journal/types";

// app/calendar/page.tsx의 카테고리 색상표와 동일 — 페이지 파일에서 export하지 않는 작은 룩업이라
// 여기서 그대로 다시 쓴다(공용 lib로 뽑기엔 5줄짜리라 과함).
const CATEGORY: Record<string, { label: string; color: string; bg: string }> = {
  shooting: { label: "촬영", color: "#E85D2C", bg: "#FFF0EB" },
  client:   { label: "고객", color: "#155855", bg: "#EAF4F2" },
  admin:    { label: "행정", color: "#EB8F22", bg: "#FFF3E0" },
  personal: { label: "개인", color: "#000000", bg: "#ECECEC" },
  general:  { label: "기타", color: "#5A7470", bg: "#F3F4F6" },
};

export default function ScheduleColumn({
  currentMonth,
  selectedDate,
  dayCounts,
  eventDates,
  onSelectDate,
  onMonthChange,
  schedules,
  schedulesLoading,
  selectedScheduleId,
  onSelectSchedule,
  upcoming,
  onSelectUpcoming,
}: {
  currentMonth: string;
  selectedDate: string;
  dayCounts: Map<string, { total: number; done: number }>;
  eventDates: Set<string>;
  onSelectDate: (date: string) => void;
  onMonthChange: (month: string) => void;
  schedules: CalendarEvent[];
  schedulesLoading: boolean;
  selectedScheduleId: string | null;
  onSelectSchedule: (id: string) => void;
  upcoming: UpcomingEntry[];
  onSelectUpcoming: (entry: UpcomingEntry) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}>
      <div style={{ flexShrink: 0 }}>
        <MiniCalendar
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          dayCounts={dayCounts}
          eventDates={eventDates}
          onSelectDate={onSelectDate}
          onMonthChange={onMonthChange}
          upcoming={upcoming}
          onSelectUpcoming={onSelectUpcoming}
        />
      </div>

      <div className="pc-card pc-card--padded" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 10, flexShrink: 0 }}>선택 날짜 일정</div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {schedulesLoading ? (
            <p style={{ fontSize: 11.5, color: C.hint }}>불러오는 중...</p>
          ) : schedules.length === 0 ? (
            <p style={{ fontSize: 11.5, color: C.hint }}>이 날짜에 등록된 일정이 없습니다.</p>
          ) : (
            schedules.map((schedule) => {
              const active = schedule.id === selectedScheduleId;
              const cat = CATEGORY[schedule.category] ?? CATEGORY.general;
              return (
                <button
                  key={schedule.id}
                  type="button"
                  onClick={() => onSelectSchedule(schedule.id)}
                  style={{
                    display: "flex", flexDirection: "column", gap: 4, textAlign: "left",
                    borderRadius: R.md, padding: "10px 12px", cursor: "pointer",
                    border: `1.5px solid ${active ? C.teal : "transparent"}`, background: active ? C.mint : "#fff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: cat.color, background: cat.bg, borderRadius: R.xs, padding: "2px 6px", flexShrink: 0 }}>
                      {cat.label}
                    </span>
                    {schedule.time ? <span style={{ fontSize: 11, color: C.hint, flexShrink: 0 }}>{schedule.time}</span> : null}
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {schedule.title}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
