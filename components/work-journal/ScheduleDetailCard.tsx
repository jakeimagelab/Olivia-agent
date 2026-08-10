"use client";

import { C, R } from "@/lib/theme";
import { dateHeaderLabel, timeRangeLabel } from "@/lib/work-journal/dateLabel";
import type { CalendarEvent } from "@/lib/work-journal/types";

// app/calendar/page.tsx의 카테고리 색상표와 동일 — ScheduleColumn.tsx와 같은 이유로 여기서도 다시 쓴다.
const CATEGORY: Record<string, { label: string; color: string; bg: string }> = {
  shooting: { label: "촬영", color: "#E85D2C", bg: "#FFF0EB" },
  client:   { label: "고객", color: "#155855", bg: "#EAF4F2" },
  admin:    { label: "행정", color: "#EB8F22", bg: "#FFF3E0" },
  personal: { label: "개인", color: "#000000", bg: "#ECECEC" },
  general:  { label: "기타", color: "#5A7470", bg: "#F3F4F6" },
};

export default function ScheduleDetailCard({ schedule }: { schedule: CalendarEvent | null }) {
  if (!schedule) {
    return (
      <div className="pc-card pc-card--padded" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 200 }}>
        <p style={{ fontSize: 13, color: C.hint }}>일정을 선택해주세요.</p>
      </div>
    );
  }

  const cat = CATEGORY[schedule.category] ?? CATEGORY.general;

  return (
    <div className="pc-card pc-card--padded">
      <span style={{ display: "inline-block", fontSize: 10.5, fontWeight: 800, color: cat.color, background: cat.bg, borderRadius: R.xs, padding: "3px 8px", marginBottom: 10 }}>
        {cat.label}
      </span>
      <h2 style={{ fontSize: 16, fontWeight: 900, color: C.ink, margin: "0 0 10px" }}>{schedule.title}</h2>
      <div style={{ display: "grid", gap: 6, fontSize: 12.5, color: C.muted }}>
        <span>{dateHeaderLabel(schedule.date)} · {timeRangeLabel(schedule.time, schedule.endTime)}</span>
        {schedule.location ? <span>{schedule.location}</span> : null}
      </div>
      {schedule.memo ? (
        <p style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`, fontSize: 12.5, color: C.ink, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {schedule.memo}
        </p>
      ) : null}
    </div>
  );
}
