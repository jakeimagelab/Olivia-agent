export const CALENDAR_DRAG_SNAP_MINUTES = 15;

export type CalendarDragGrid = {
  top: number;
  scrollTop: number;
  hourHeight: number;
  startHour: number;
  endHour: number;
};

export function snapCalendarMinutes(minutes: number, step = CALENDAR_DRAG_SNAP_MINUTES) {
  return Math.round(minutes / step) * step;
}

export function calendarTimeFromClientY(clientY: number, grabbedOffsetY: number, grid: CalendarDragGrid) {
  const visualTop = clientY - grabbedOffsetY;
  const relativeY = visualTop - grid.top + grid.scrollTop;
  const relativeMinutes = snapCalendarMinutes((relativeY / grid.hourHeight) * 60);
  const min = grid.startHour * 60;
  const max = grid.endHour * 60 - CALENDAR_DRAG_SNAP_MINUTES;
  const absoluteMinutes = Math.max(min, Math.min(max, min + relativeMinutes));
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function calendarClientTopForTime(time: string, grid: CalendarDragGrid) {
  const [hours, minutes] = time.split(":").map(Number);
  const relativeMinutes = hours * 60 + minutes - grid.startHour * 60;
  return grid.top - grid.scrollTop + (relativeMinutes / 60) * grid.hourHeight;
}

export function calendarDayColumnAtX(clientX: number, columns: Array<{ left: number; right: number } | null>) {
  const direct = columns.findIndex((column) => column && clientX >= column.left && clientX < column.right);
  if (direct >= 0) return direct;
  const available = columns.flatMap((column, index) => column ? [{ column, index }] : []);
  if (!available.length) return -1;
  if (clientX < available[0].column.left) return available[0].index;
  return available[available.length - 1].index;
}

export function preserveCalendarDuration(start: string, end: string | null | undefined, nextStart: string, endHour: number) {
  if (!end) return null;
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const duration = toMinutes(end) - toMinutes(start);
  if (duration <= 0) return null;
  const nextEnd = Math.min(endHour * 60, toMinutes(nextStart) + duration);
  return `${String(Math.floor(nextEnd / 60)).padStart(2, "0")}:${String(nextEnd % 60).padStart(2, "0")}`;
}
