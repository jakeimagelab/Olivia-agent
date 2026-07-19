import { describe, expect, it } from "vitest";
import {
  CALENDAR_REMINDER_LABEL,
  calendarReminderDueAt,
  isCalendarReminderMinutes,
} from "@/lib/calendarReminders";

describe("calendar Telegram reminders", () => {
  it("calculates the due time from a Korea-time event", () => {
    expect(calendarReminderDueAt("2026-07-20", "10:00", 30)).toBe("2026-07-20T00:30:00.000Z");
  });

  it("accepts database times that include seconds", () => {
    expect(calendarReminderDueAt("2026-07-20", "10:00:00", 60)).toBe("2026-07-20T00:00:00.000Z");
  });

  it("treats the calendar's 24:00 option as midnight on the next day", () => {
    expect(calendarReminderDueAt("2026-07-20", "24:00", 30)).toBe("2026-07-20T14:30:00.000Z");
  });

  it("rejects missing or invalid schedule values", () => {
    expect(calendarReminderDueAt("2026-07-20", null, 30)).toBeNull();
    expect(calendarReminderDueAt("2026-07-20", "25:00", 30)).toBeNull();
    expect(calendarReminderDueAt("20-07-2026", "10:00", 30)).toBeNull();
  });

  it("only accepts supported notification offsets", () => {
    expect(isCalendarReminderMinutes(0)).toBe(true);
    expect(isCalendarReminderMinutes("30")).toBe(true);
    expect(isCalendarReminderMinutes(15)).toBe(false);
    expect(CALENDAR_REMINDER_LABEL[1440]).toBe("하루 전");
  });
});
