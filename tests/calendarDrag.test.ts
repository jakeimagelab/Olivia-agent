import { describe, expect, it } from "vitest";
import {
  calendarClientTopForTime,
  calendarDayColumnAtX,
  calendarTimeFromClientY,
  preserveCalendarDuration,
} from "@/lib/calendarDrag";

const grid = { top: 100, scrollTop: 0, hourHeight: 64, startHour: 7, endHour: 24 };

describe("calendar drag coordinates", () => {
  it("uses the grabbed offset and snaps the visual top to 15 minutes", () => {
    expect(calendarTimeFromClientY(180, 16, grid)).toBe("08:00");
    expect(calendarTimeFromClientY(173, 16, grid)).toBe("08:00");
  });

  it("keeps the same target while the time grid is scrolled", () => {
    const scrolled = { ...grid, scrollTop: 320 };
    expect(calendarTimeFromClientY(164, 0, scrolled)).toBe("13:00");
    expect(calendarClientTopForTime("13:00", scrolled)).toBe(164);
  });

  it("clamps drag targets to the visible calendar day range", () => {
    expect(calendarTimeFromClientY(-500, 0, grid)).toBe("07:00");
    expect(calendarTimeFromClientY(5000, 0, grid)).toBe("23:45");
  });

  it("selects and clamps week columns", () => {
    const columns = [
      { left: 100, right: 200 },
      { left: 200, right: 300 },
      { left: 300, right: 400 },
    ];
    expect(calendarDayColumnAtX(250, columns)).toBe(1);
    expect(calendarDayColumnAtX(20, columns)).toBe(0);
    expect(calendarDayColumnAtX(900, columns)).toBe(2);
  });

  it("preserves duration and clamps the ending boundary", () => {
    expect(preserveCalendarDuration("10:00", "12:00", "14:15", 24)).toBe("16:15");
    expect(preserveCalendarDuration("22:30", "23:30", "23:30", 24)).toBe("24:00");
    expect(preserveCalendarDuration("10:00", null, "12:00", 24)).toBeNull();
  });
});
