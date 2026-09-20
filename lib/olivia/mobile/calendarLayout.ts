export const MOBILE_CALENDAR_HOUR_HEIGHT = 56;

export function mobileCalendarDateKey(date = new Date()) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export function parseMobileCalendarDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function moveMobileCalendarDate(value: string, days: number) {
  const next = parseMobileCalendarDate(value);
  next.setDate(next.getDate() + days);
  return mobileCalendarDateKey(next);
}

export function moveMobileCalendarMonth(value: string, months: number) {
  const current = parseMobileCalendarDate(value);
  const day = current.getDate();
  const target = new Date(current.getFullYear(), current.getMonth() + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(day, lastDay));
  return mobileCalendarDateKey(target);
}

export function getMobileCalendarWeek(value: string) {
  const selected = parseMobileCalendarDate(value);
  return Array.from({ length: 7 }, (_, index) => moveMobileCalendarDate(value, index - selected.getDay()));
}

export function getMobileCalendarMonthGrid(value: string) {
  const selected = parseMobileCalendarDate(value);
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: mobileCalendarDateKey(date),
      inMonth: date.getMonth() === selected.getMonth(),
    };
  });
}

export function mobileCalendarTimeToMinutes(value?: string | null) {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function getMobileCalendarEventPosition(time?: string | null, endTime?: string | null) {
  const startMinutes = mobileCalendarTimeToMinutes(time) ?? 0;
  const parsedEnd = mobileCalendarTimeToMinutes(endTime);
  const endMinutes = parsedEnd != null && parsedEnd > startMinutes ? parsedEnd : startMinutes + 60;
  const durationMinutes = Math.max(30, Math.min(24 * 60 - startMinutes, endMinutes - startMinutes));
  return {
    top: startMinutes / 60 * MOBILE_CALENDAR_HOUR_HEIGHT,
    height: durationMinutes / 60 * MOBILE_CALENDAR_HOUR_HEIGHT,
    startMinutes,
    durationMinutes,
  };
}
