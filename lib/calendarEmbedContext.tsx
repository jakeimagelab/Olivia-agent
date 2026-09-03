"use client";

import { createContext, useContext } from "react";

// OLIVIA OS Desktop의 AppWindow 안에 캘린더가 마운트됐는지를 app/calendar/page.tsx에 알려주는
// 아주 작은 컨텍스트. Next.js App Router의 page.tsx 기본 export는 자체 PageProps 타입 제약이
// 있어 파라미터를 추가하거나 named export를 더 두면 .next/types 생성 타입 체크가 깨진다 —
// 그래서 prop 대신 이 컨텍스트로 embedded 여부를 전달한다. 기본값 false라 Provider 없이
// 렌더되는 기존 /calendar 방문은 전혀 바뀌지 않는다.
const CalendarEmbedContext = createContext(false);

export const CalendarEmbedProvider = CalendarEmbedContext.Provider;

export function useCalendarEmbedded(): boolean {
  return useContext(CalendarEmbedContext);
}
