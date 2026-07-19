export const CALENDAR_REMINDER_MINUTES = [0, 10, 30, 60, 1440] as const;
export type CalendarReminderMinutes = typeof CALENDAR_REMINDER_MINUTES[number];

export const CALENDAR_REMINDER_LABEL: Record<CalendarReminderMinutes, string> = {
  0: "일정 시간에",
  10: "10분 전",
  30: "30분 전",
  60: "1시간 전",
  1440: "하루 전",
};

export function isCalendarReminderMinutes(value: unknown): value is CalendarReminderMinutes {
  return CALENDAR_REMINDER_MINUTES.includes(Number(value) as CalendarReminderMinutes);
}

// CALENDAR_REMINDER_LABEL은 뱃지/드롭다운처럼 짧게 쓰일 땐 "30분 전"이 자연스럽지만,
// 문장 안에서 그대로 이어붙이면("30분 전 텔레그램으로") 조사가 빠져 어색해진다.
// 문장에 넣을 때만 이 함수로 조사를 붙인다.
export function reminderTimingPhrase(minutes: CalendarReminderMinutes) {
  const label = CALENDAR_REMINDER_LABEL[minutes];
  return minutes === 0 ? label : `${label}에`;
}

export function calendarReminderDueAt(date: string, time: string | null | undefined, minutesBefore: number) {
  const normalizedTime = time?.slice(0, 5);
  const isNextDayMidnight = normalizedTime === "24:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !normalizedTime || (!isNextDayMidnight && !/^([01]\d|2[0-3]):[0-5]\d$/.test(normalizedTime))) return null;
  const eventAt = new Date(`${date}T${isNextDayMidnight ? "00:00" : normalizedTime}:00+09:00`);
  if (Number.isNaN(eventAt.getTime())) return null;
  if (isNextDayMidnight) eventAt.setTime(eventAt.getTime() + 24 * 60 * 60_000);
  return new Date(eventAt.getTime() - minutesBefore * 60_000).toISOString();
}
