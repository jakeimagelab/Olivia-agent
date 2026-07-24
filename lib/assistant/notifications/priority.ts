import type { AssistantNotificationPriority } from "@/lib/assistant/types";

type QuietHoursSettings = {
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};

function minutesOfDay(value: string): number {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

export function isWithinQuietHours(
  nowMinutes: number,
  start: string,
  end: string,
): boolean {
  const startMinutes = minutesOfDay(start);
  const endMinutes = minutesOfDay(end);
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export function shouldSendNotificationNow(input: {
  priority: AssistantNotificationPriority;
  settings: QuietHoursSettings;
  nowMinutes: number;
}): boolean {
  if (input.priority === "CRITICAL") return true;
  if (!input.settings.quiet_hours_enabled) return true;
  return !isWithinQuietHours(
    input.nowMinutes,
    input.settings.quiet_hours_start,
    input.settings.quiet_hours_end,
  );
}
