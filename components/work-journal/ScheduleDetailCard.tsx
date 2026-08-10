"use client";

import { C } from "@/lib/theme";

export default function ScheduleDetailCard() {
  return (
    <div className="pc-card pc-card--padded" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 200 }}>
      <p style={{ fontSize: 13, color: C.hint }}>일정을 선택해주세요.</p>
    </div>
  );
}
