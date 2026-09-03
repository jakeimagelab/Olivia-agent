"use client";

import dynamic from "next/dynamic";
import { CalendarEmbedProvider } from "@/lib/calendarEmbedContext";

// app/calendar/page.tsx는 GlobalHeader를 직접 그리는 유일한 샘플 앱이라(고객관리/사진작업실은
// 그리지 않음), CalendarEmbedProvider로 true를 내려서 그 헤더 렌더만 건너뛰게 한다.
const CalendarPage = dynamic(() => import("@/app/calendar/page"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>일정을 준비하는 중...</div>,
});

export function CalendarWindowContent() {
  return (
    <CalendarEmbedProvider value={true}>
      <CalendarPage />
    </CalendarEmbedProvider>
  );
}
