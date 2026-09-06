"use client";

import { useEffect, useState } from "react";

// 맥 캘린더처럼 오늘 날짜가 실제로 찍혀 있는 아이콘 — 자정을 넘기면 자동으로 바뀌어야 하므로
// 1분마다 오늘 날짜를 다시 확인한다(그 사이 재렌더가 없어도 갱신되게). 실제 macOS 캘린더
// 아이콘처럼 흰 배경에 빨간 요일 라벨 + 굵은 검정 날짜 숫자만 얹는다(다른 앱 아이콘의
// rx=11 사각형은 그대로 맞춤).
export function CalendarAppIcon() {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(today);
  const day = today.getDate();

  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" role="img" aria-label={`캘린더, ${weekday}요일 ${day}일`}>
      <rect width="48" height="48" rx="11" fill="#fff" />
      <text x="24" y="18" textAnchor="middle" fontSize="9" fontWeight="700" fill="#FF3B30" letterSpacing="0.4" fontFamily="inherit">{weekday}</text>
      <text x="24" y="38" textAnchor="middle" fontSize="21" fontWeight="800" fill="#1C1C1E" fontFamily="inherit">{day}</text>
    </svg>
  );
}
