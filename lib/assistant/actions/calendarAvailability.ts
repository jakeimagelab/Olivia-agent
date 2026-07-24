export type CalendarBusyItem = {
  title: string;
  time?: string | null;
  durationMinutes?: number | null;
  completed?: boolean;
};

export type CalendarWindow = {
  start: string;
  end: string;
};

function parseTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTime(minutes: number): string {
  const safeMinutes = Math.max(0, Math.min(minutes, 24 * 60));
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function findCalendarConflicts(
  items: CalendarBusyItem[],
  requestedTime: string,
  requestedDurationMinutes = 60,
): CalendarBusyItem[] {
  const requestedStart = parseTime(requestedTime);
  if (requestedStart === null) return [];
  const requestedEnd = requestedStart + Math.max(1, requestedDurationMinutes);

  return items.filter((item) => {
    if (!item.time || item.completed) return false;
    const itemStart = parseTime(item.time);
    if (itemStart === null) return false;
    const itemEnd = itemStart + Math.max(1, item.durationMinutes ?? 60);
    return requestedStart < itemEnd && requestedEnd > itemStart;
  });
}

export function calculateCalendarAvailability(input: {
  items: CalendarBusyItem[];
  workdayStart?: string;
  workdayEnd?: string;
  minimumWindowMinutes?: number;
}): CalendarWindow[] {
  const start = parseTime(input.workdayStart ?? "09:00");
  const end = parseTime(input.workdayEnd ?? "18:00");
  if (start === null || end === null || start >= end) {
    throw new Error("업무 시간 범위가 올바르지 않습니다.");
  }

  const busy = input.items
    .filter((item) => item.time && !item.completed)
    .map((item) => {
      const itemStart = parseTime(item.time!);
      if (itemStart === null) return null;
      return {
        start: Math.max(start, itemStart),
        end: Math.min(end, itemStart + Math.max(1, item.durationMinutes ?? 60)),
      };
    })
    .filter(
      (range): range is { start: number; end: number } =>
        range !== null && range.start < range.end,
    )
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const range of busy) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
    } else {
      previous.end = Math.max(previous.end, range.end);
    }
  }

  const minimum = Math.max(1, input.minimumWindowMinutes ?? 30);
  const windows: CalendarWindow[] = [];
  let cursor = start;
  for (const range of merged) {
    if (range.start - cursor >= minimum) {
      windows.push({ start: formatTime(cursor), end: formatTime(range.start) });
    }
    cursor = Math.max(cursor, range.end);
  }
  if (end - cursor >= minimum) {
    windows.push({ start: formatTime(cursor), end: formatTime(end) });
  }
  return windows;
}
