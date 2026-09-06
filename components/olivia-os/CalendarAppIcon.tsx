"use client";

import { useEffect, useState } from "react";

// 맥 캘린더처럼 오늘 날짜가 실제로 찍혀 있는 아이콘 — 자정을 넘기면 자동으로 바뀌어야 하므로
// 1분마다 오늘 날짜를 다시 확인한다(그 사이 재렌더가 없어도 갱신되게).
export function CalendarAppIcon() {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(today);
  const day = today.getDate();

  return (
    <span style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      width: "100%", height: "100%", borderRadius: 6, overflow: "hidden", fontFamily: "inherit",
    }}>
      <span style={{
        width: "100%", textAlign: "center", background: "#E85D2C", color: "#fff",
        fontSize: 8, fontWeight: 800, lineHeight: "11px", letterSpacing: ".02em",
      }}>{weekday}</span>
      <span style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        width: "100%", background: "#fff", color: "#1C2B28", fontSize: 15, fontWeight: 800,
      }}>{day}</span>
    </span>
  );
}
