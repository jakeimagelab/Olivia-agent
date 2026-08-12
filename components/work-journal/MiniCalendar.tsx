"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { C, R } from "@/lib/theme";
import type { UpcomingEntry } from "@/lib/work-journal/types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// 달력 그리드에 채울 날짜 셀 — 이전/다음 달의 겹치는 날짜도 흐리게 채워 6주 격자를 맞춘다.
function buildGrid(month: string): { date: string; day: number; inMonth: boolean }[] {
  const [year, m] = month.split("-").map(Number);
  const first = new Date(year, m - 1, 1);
  const startOffset = first.getDay();
  const gridStart = new Date(year, m - 1, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      day: d.getDate(),
      inMonth: d.getMonth() === m - 1,
    };
  });
}

function relativeDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${weekday})`;
}

export default function MiniCalendar({
  currentMonth,
  selectedDate,
  dayCounts,
  eventDates,
  onSelectDate,
  onMonthChange,
  upcoming,
  onSelectUpcoming,
  compact = false,
  hideUpcoming = false,
}: {
  currentMonth: string;
  selectedDate: string;
  dayCounts: Map<string, { total: number; done: number }>;
  eventDates: Set<string>;
  onSelectDate: (date: string) => void;
  onMonthChange: (month: string) => void;
  upcoming: UpcomingEntry[];
  onSelectUpcoming: (entry: UpcomingEntry) => void;
  /* 좁은 카드(홈 대시보드 통합 캘린더)에 넣을 때 셀 높이·여백을 줄인 축소판 */
  compact?: boolean;
  /* "다가오는 일정" 카드 자체를 렌더하지 않음 — 호출부가 그 자리를 다른 걸로 채울 때 */
  hideUpcoming?: boolean;
}) {
  const grid = buildGrid(currentMonth);
  const [year, month] = currentMonth.split("-").map(Number);
  const today = todayStr();
  const cellHeight = compact ? 28 : 32;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: hideUpcoming ? 0 : 12, height: "100%" }}>
      <div className="pc-card pc-card--padded" style={compact ? { padding: "10px 12px" } : undefined}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: compact ? 6 : 12 }}>
          <span style={{ fontSize: 13.5, fontWeight: 900, color: C.ink }}>📅 캘린더</span>
          <button
            type="button"
            onClick={() => { onMonthChange(today.slice(0, 7)); onSelectDate(today); }}
            style={{ height: compact ? 24 : 28, padding: "0 10px", borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.teal, fontSize: 11, fontWeight: 800, cursor: "pointer" }}
          >
            오늘
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: compact ? 2 : 10 }}>
          <button type="button" onClick={() => onMonthChange(shiftMonth(currentMonth, -1))} aria-label="이전 달"
            style={{ width: 24, height: 24, border: "none", background: "transparent", color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>{year}년 {month}월</span>
          <button type="button" onClick={() => onMonthChange(shiftMonth(currentMonth, 1))} aria-label="다음 달"
            style={{ width: 24, height: 24, border: "none", background: "transparent", color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronRight size={16} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: compact ? 1 : 4 }}>
          {WEEKDAYS.map((w) => (
            <div key={w} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: C.hint, padding: compact ? "0" : "2px 0" }}>{w}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {grid.map((cell) => {
            const counts = dayCounts.get(cell.date);
            const hasEvent = eventDates.has(cell.date);
            const active = cell.date === selectedDate;
            const isToday = cell.date === today;
            const allDone = counts && counts.total > 0 && counts.done === counts.total;
            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => onSelectDate(cell.date)}
                style={{
                  position: "relative", height: cellHeight, borderRadius: R.sm, border: isToday && !active ? `1px solid ${C.teal}` : "1px solid transparent",
                  background: active ? C.teal : "transparent", color: active ? "#fff" : cell.inMonth ? C.ink : C.hint,
                  fontSize: compact ? 11.5 : 11.5, fontWeight: active ? 800 : 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {cell.day}
                {counts || hasEvent ? (
                  <span style={{ position: "absolute", bottom: 3, display: "flex", gap: 2 }}>
                    {counts ? (
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: active ? "#fff" : allDone ? C.success : C.orange }} />
                    ) : null}
                    {hasEvent ? (
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: active ? "#fff" : "#2563EB" }} />
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {!compact && eventDates.size > 0 ? (
          <div style={{ display: "flex", gap: 12, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: C.muted, fontWeight: 700 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.orange }} />업무
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: C.muted, fontWeight: 700 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#2563EB" }} />캘린더 일정
            </span>
          </div>
        ) : null}
      </div>

      {hideUpcoming ? null : (
        <div className="pc-card pc-card--padded" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 10 }}>다가오는 일정</div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.length === 0 ? (
              <p style={{ fontSize: 11.5, color: C.hint }}>예정된 일정이 없습니다.</p>
            ) : upcoming.map((entry) => (
              <button
                key={`${entry.kind}-${entry.id}`}
                type="button"
                onClick={() => onSelectUpcoming(entry)}
                style={{ display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, flexShrink: 0, width: 56 }}>{relativeDayLabel(entry.date)}</span>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: entry.kind === "event" ? "#2563EB" : entry.done ? C.success : C.orange, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</span>
                {entry.time ? <span style={{ fontSize: 10, color: C.hint, flexShrink: 0 }}>{entry.time}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
