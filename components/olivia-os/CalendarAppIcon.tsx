"use client";

import { useEffect, useId, useState } from "react";

// 맥 캘린더처럼 오늘 날짜가 실제로 찍혀 있는 아이콘 — 자정을 넘기면 자동으로 바뀌어야 하므로
// 1분마다 오늘 날짜를 다시 확인한다(그 사이 재렌더가 없어도 갱신되게). 배경색(#245F8C)과 흰
// 카드 구성은 새 AppIcon 세트의 'work-calendar' 아이콘과 맞춰서 다른 앱 아이콘들과 같은
// 톤으로 보이게 하고, 그 카드 위에만 실시간 요일/날짜를 얹는다.
export function CalendarAppIcon() {
  const [today, setToday] = useState(() => new Date());
  const clipId = useId();

  useEffect(() => {
    const id = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(today);
  const day = today.getDate();

  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" role="img" aria-label={`캘린더, ${weekday}요일 ${day}일`}>
      <defs>
        <clipPath id={clipId}><rect x="10" y="11" width="28" height="26" rx="6" /></clipPath>
      </defs>
      <rect width="48" height="48" rx="11" fill="#245F8C" />
      <g clipPath={`url(#${clipId})`}>
        <rect x="10" y="11" width="28" height="26" fill="#fff" />
        <rect x="10" y="11" width="28" height="9" fill="#245F8C" />
        <text x="24" y="17.5" textAnchor="middle" fontSize="6" fontWeight="800" fill="#fff" letterSpacing="0.3" fontFamily="inherit">{weekday}</text>
        <text x="24" y="32.5" textAnchor="middle" fontSize="14" fontWeight="400" fill="#1C2B28" fontFamily="inherit">{day}</text>
      </g>
    </svg>
  );
}
