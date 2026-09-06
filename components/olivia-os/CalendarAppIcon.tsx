"use client";

import { useEffect, useId, useState } from "react";

// 맥 캘린더처럼 오늘 날짜가 실제로 찍혀 있는 아이콘 — 자정을 넘기면 자동으로 바뀌어야 하므로
// 1분마다 오늘 날짜를 다시 확인한다(그 사이 재렌더가 없어도 갱신되게). 다른 앱 아이콘(AppIcon.tsx)
// 과 동일하게 48x48 SVG 한 장으로 통째로 그려서 채운다 — 예전에는 흰 <span>을 Dock 타일 위에
// 얹는 방식이라 타일의 rx(12)와 안쪽 span의 rx(6)가 어긋나 위쪽에 얇은 틈이 보였다.
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
        <clipPath id={clipId}><rect width="48" height="48" rx="11" /></clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="48" height="48" fill="#fff" />
        <rect width="48" height="15" fill="#E85D2C" />
        <text x="24" y="11" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#fff" letterSpacing="0.3" fontFamily="inherit">{weekday}</text>
        <text x="24" y="36" textAnchor="middle" fontSize="21" fontWeight="400" fill="#1C2B28" fontFamily="inherit">{day}</text>
      </g>
    </svg>
  );
}
