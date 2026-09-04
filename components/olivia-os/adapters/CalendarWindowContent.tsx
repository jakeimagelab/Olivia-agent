"use client";

import dynamic from "next/dynamic";
import { CalendarEmbedProvider } from "@/lib/calendarEmbedContext";

// CalendarWorkspace는 standalone 모드에서만 GlobalHeader를 그린다. Window에서는
// CalendarEmbedProvider로 true를 내려서 route chrome과 viewport assumptions를 건너뛴다.
const CalendarWorkspace = dynamic(() => import("@/components/calendar/CalendarWorkspace"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>일정을 준비하는 중...</div>,
});

export function CalendarWindowContent() {
  return (
    <CalendarEmbedProvider value={true}>
      <div style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        <CalendarWorkspace />
      </div>
    </CalendarEmbedProvider>
  );
}
