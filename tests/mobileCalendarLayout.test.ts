import { describe, expect, it } from "vitest";
import {
  MOBILE_CALENDAR_HOUR_HEIGHT,
  getMobileCalendarEventPosition,
  getMobileCalendarMonthGrid,
  getMobileCalendarWeek,
  mobileCalendarTimeToMinutes,
  moveMobileCalendarMonth,
} from "@/lib/olivia/mobile/calendarLayout";

describe("mobile calendar layout", () => {
  it("builds a Sunday-to-Saturday week around the selected date", () => {
    expect(getMobileCalendarWeek("2026-09-16")).toEqual([
      "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19",
    ]);
  });

  it("always returns a six-week month grid", () => {
    const grid = getMobileCalendarMonthGrid("2026-09-20");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ key: "2026-08-30", inMonth: false });
    expect(grid[41]).toEqual({ key: "2026-10-10", inMonth: false });
  });

  it("moves months without overflowing short months", () => {
    expect(moveMobileCalendarMonth("2026-01-31", 1)).toBe("2026-02-28");
    expect(moveMobileCalendarMonth("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("positions events by their real start and end time", () => {
    const position = getMobileCalendarEventPosition("15:00", "16:30");
    expect(position.top).toBe(15 * MOBILE_CALENDAR_HOUR_HEIGHT);
    expect(position.height).toBe(1.5 * MOBILE_CALENDAR_HOUR_HEIGHT);
    expect(position.durationMinutes).toBe(90);
  });

  it("uses a visible minimum duration and rejects invalid clock values", () => {
    expect(getMobileCalendarEventPosition("10:00", "10:10").durationMinutes).toBe(30);
    expect(mobileCalendarTimeToMinutes("25:00")).toBeNull();
    expect(mobileCalendarTimeToMinutes(null)).toBeNull();
  });
});
